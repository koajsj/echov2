//! Synthetic identities, real RFC 9420 messages and on-disk OpenMLS storage.
//! This is NOT application account/device authorization or encrypted storage.
use echo_mls_persistence::{JsonCodec, Provider};
use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_sqlite_storage::SqliteStorageProvider;
use openmls_traits::{OpenMlsProvider, crypto::OpenMlsCrypto, types::HashType};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use std::{error::Error, path::Path, process::Command, sync::Arc, time::Duration};
use tls_codec::{Deserialize, Serialize};

type Result<T = ()> = std::result::Result<T, Box<dyn Error>>;
const SUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
const GROUP: &[u8] = b"synthetic-group-01";

fn open(path: &Path) -> Result<Connection> {
    let mut db = Connection::open(path)?;
    db.busy_timeout(Duration::from_secs(5))?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")?;
    SqliteStorageProvider::<JsonCodec, _>::new(&mut db).run_migrations()?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS identity (id INTEGER PRIMARY KEY CHECK(id=1), credential BLOB NOT NULL);
         CREATE TABLE IF NOT EXISTS heads (group_id BLOB PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT 0);
         CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, group_id BLOB NOT NULL, kind TEXT NOT NULL,
           request_digest BLOB NOT NULL, wire BLOB NOT NULL, welcome BLOB);
         CREATE TABLE IF NOT EXISTS inbox (group_id BLOB NOT NULL, seq INTEGER NOT NULL,
           message_id TEXT NOT NULL, wire BLOB NOT NULL, event BLOB NOT NULL,
           PRIMARY KEY(group_id,seq), UNIQUE(group_id,message_id));",
    )?;
    Ok(db)
}
fn identity(db: &mut Connection, label: &str) -> Result {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let provider = Provider::new(&tx);
    let signer = SignatureKeyPair::new(SUITE.signature_algorithm())?;
    signer.store(provider.storage())?;
    let credential = CredentialWithKey {
        credential: BasicCredential::new(label.as_bytes().to_vec()).into(),
        signature_key: signer.public().into(),
    };
    tx.execute(
        "INSERT INTO identity VALUES(1,?1)",
        [serde_json::to_vec(&credential)?],
    )?;
    tx.commit()?;
    Ok(())
}
fn keys(db: &Connection, provider: &Provider<'_>) -> Result<(SignatureKeyPair, CredentialWithKey)> {
    let bytes: Vec<u8> = db.query_row("SELECT credential FROM identity WHERE id=1", [], |row| {
        row.get(0)
    })?;
    let credential: CredentialWithKey = serde_json::from_slice(&bytes)?;
    let signer = SignatureKeyPair::read(
        provider.storage(),
        credential.signature_key.as_slice(),
        SUITE.signature_algorithm(),
    )
    .ok_or("persisted signer missing or unreadable")?;
    Ok((signer, credential))
}
fn load(provider: &Provider<'_>) -> Result<MlsGroup> {
    MlsGroup::load(provider.storage(), &GroupId::from_slice(GROUP))?.ok_or("group missing".into())
}
fn create(db: &mut Connection) -> Result {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let provider = Provider::new(&tx);
    let (signer, credential) = keys(&tx, &provider)?;
    let config = MlsGroupCreateConfig::builder()
        .ciphersuite(SUITE)
        .use_ratchet_tree_extension(true)
        .build();
    MlsGroup::new_with_group_id(
        &provider,
        &signer,
        &config,
        GroupId::from_slice(GROUP),
        credential,
    )?;
    tx.execute("INSERT INTO heads(group_id) VALUES(?1)", [GROUP])?;
    tx.commit()?;
    Ok(())
}
fn package(db: &mut Connection) -> Result<Vec<u8>> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let provider = Provider::new(&tx);
    let (signer, credential) = keys(&tx, &provider)?;
    let package = KeyPackage::builder()
        .build(SUITE, &provider, &signer, credential)?
        .key_package()
        .tls_serialize_detached()?;
    tx.commit()?;
    Ok(package)
}
fn add(db: &mut Connection, packages: &[Vec<u8>]) -> Result<(Vec<u8>, Vec<u8>)> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let provider = Provider::new(&tx);
    let (signer, _) = keys(&tx, &provider)?;
    let mut group = load(&provider)?;
    let packages = packages
        .iter()
        .map(|bytes| {
            let mut input = bytes.as_slice();
            let package = KeyPackageIn::tls_deserialize(&mut input)?
                .validate(provider.crypto(), ProtocolVersion::Mls10)?;
            if !input.is_empty() {
                return Err("trailing KeyPackage bytes".into());
            }
            Ok(package)
        })
        .collect::<Result<Vec<_>>>()?;
    let (commit, welcome, _) = group.add_members(&provider, &signer, &packages)?;
    let wire = commit.tls_serialize_detached()?;
    let welcome = welcome.tls_serialize_detached()?;
    tx.execute(
        "INSERT INTO outbox VALUES('add',?1,'commit',x'',?2,?3)",
        params![GROUP, wire, welcome],
    )?;
    drop(group);
    tx.commit()?;
    Ok((wire, welcome))
}
fn merge_pending(db: &mut Connection) -> Result {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let provider = Provider::new(&tx);
    let mut group = load(&provider)?;
    group.merge_pending_commit(&provider)?;
    drop(group);
    tx.commit()?;
    Ok(())
}
fn join(db: &mut Connection, bytes: &[u8]) -> Result {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let provider = Provider::new(&tx);
    let mut input = bytes;
    let message = MlsMessageIn::tls_deserialize(&mut input)?;
    if !input.is_empty() {
        return Err("trailing Welcome bytes".into());
    }
    let MlsMessageBodyIn::Welcome(welcome) = message.extract() else {
        return Err("not a Welcome".into());
    };
    let config = MlsGroupJoinConfig::builder().build();
    StagedWelcome::new_from_welcome(&provider, &config, welcome, None)?.into_group(&provider)?;
    tx.execute("INSERT INTO heads(group_id) VALUES(?1)", [GROUP])?;
    tx.commit()?;
    Ok(())
}
fn prepare_send(tx: &Transaction<'_>, id: &str, plaintext: &[u8]) -> Result<Vec<u8>> {
    let provider = Provider::new(tx);
    let mut request = b"echo-native-sqlite-lab-v1\0send\0".to_vec();
    request.extend_from_slice(&(GROUP.len() as u64).to_be_bytes());
    request.extend_from_slice(GROUP);
    request.extend_from_slice(plaintext);
    let digest = provider.crypto().hash(HashType::Sha2_256, &request)?;
    let original = tx
        .query_row(
            "SELECT group_id,kind,request_digest,wire FROM outbox WHERE id=?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Vec<u8>>(2)?,
                    row.get::<_, Vec<u8>>(3)?,
                ))
            },
        )
        .optional()?;
    if let Some((group, kind, prior_digest, wire)) = original {
        if group != GROUP || kind != "application" || prior_digest != digest {
            return Err("operation ID conflict".into());
        }
        return Ok(wire);
    }
    let (signer, _) = keys(tx, &provider)?;
    let mut group = load(&provider)?;
    let wire = group
        .create_message(&provider, &signer, plaintext)?
        .tls_serialize_detached()?;
    tx.execute(
        "INSERT INTO outbox VALUES(?1,?2,'application',?3,?4,NULL)",
        params![id, GROUP, digest, wire],
    )?;
    // No MLS object escapes this transaction helper, including on failure.
    Ok(wire)
}
fn send(db: &mut Connection, id: &str, plaintext: &[u8]) -> Result<Vec<u8>> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let wire = prepare_send(&tx, id, plaintext)?;
    tx.commit()?;
    Ok(wire)
}
fn receive(
    db: &mut Connection,
    seq: i64,
    message_id: &str,
    wire: &[u8],
) -> Result<(bool, Vec<u8>)> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let original = tx
        .query_row(
            "SELECT message_id,wire,event FROM inbox WHERE group_id=?1 AND seq=?2",
            params![GROUP, seq],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, Vec<u8>>(2)?,
                ))
            },
        )
        .optional()?;
    if let Some((id, original_wire, event)) = original {
        if id != message_id || original_wire != wire {
            return Err("inbox sequence conflict".into());
        }
        tx.commit()?;
        return Ok((false, event));
    }
    let cursor: i64 = tx.query_row(
        "SELECT cursor FROM heads WHERE group_id=?1",
        [GROUP],
        |row| row.get(0),
    )?;
    if cursor.checked_add(1) != Some(seq) {
        return Err("gap or cursor regression".into());
    }
    let provider = Provider::new(&tx);
    let mut group = load(&provider)?;
    let mut input = wire;
    let message = MlsMessageIn::tls_deserialize(&mut input)?;
    if !input.is_empty() {
        return Err("trailing MLS bytes".into());
    }
    let processed = group.process_message(&provider, message.try_into_protocol_message()?)?;
    let event = match processed.into_content() {
        ProcessedMessageContent::ApplicationMessage(message) => message.into_bytes(),
        ProcessedMessageContent::StagedCommitMessage(commit) => {
            group.merge_staged_commit(&provider, *commit)?;
            Vec::new()
        }
        ProcessedMessageContent::ProposalMessage(proposal) => {
            group.store_pending_proposal(provider.storage(), *proposal)?;
            Vec::new()
        }
        _ => return Err("unsupported message kind".into()),
    };
    tx.execute(
        "INSERT INTO inbox VALUES(?1,?2,?3,?4,?5)",
        params![GROUP, seq, message_id, wire, event],
    )?;
    tx.execute(
        "UPDATE heads SET cursor=?2 WHERE group_id=?1",
        params![GROUP, seq],
    )?;
    drop(group);
    tx.commit()?;
    Ok((true, event))
}
fn epoch(db: &Connection) -> Result<u64> {
    Ok(load(&Provider::new(db))?.epoch().as_u64())
}
fn cursor(db: &Connection) -> Result<i64> {
    Ok(
        db.query_row("SELECT cursor FROM heads WHERE group_id=?1", [GROUP], |r| {
            r.get(0)
        })?,
    )
}
fn wire(db: &Connection, id: &str) -> Result<Option<Vec<u8>>> {
    Ok(db
        .query_row("SELECT wire FROM outbox WHERE id=?1", [id], |r| r.get(0))
        .optional()?)
}
struct Pair {
    directory: tempfile::TempDir,
}
impl Pair {
    fn path(&self, name: &str) -> std::path::PathBuf {
        self.directory.path().join(format!("{name}.sqlite"))
    }
    fn new() -> Result<Self> {
        let pair = Self {
            directory: tempfile::tempdir()?,
        };
        let mut alice = open(&pair.path("alice"))?;
        let mut bob = open(&pair.path("bob"))?;
        identity(&mut alice, "synthetic-alice")?;
        identity(&mut bob, "synthetic-bob")?;
        create(&mut alice)?;
        let kp = package(&mut bob)?;
        // Reload KeyPackage secrets, signer and pending state from files only.
        drop(bob);
        let (_, welcome) = add(&mut alice, &[kp])?;
        drop(alice);
        let mut alice = open(&pair.path("alice"))?;
        assert!(load(&Provider::new(&alice))?.pending_commit().is_some());
        merge_pending(&mut alice)?;
        let mut bob = open(&pair.path("bob"))?;
        join(&mut bob, &welcome)?;
        assert_eq!(epoch(&alice)?, 1);
        assert_eq!(epoch(&bob)?, 1);
        Ok(pair)
    }
}

#[test]
fn persisted_pending_key_package_offline_inbox_and_replay() -> Result {
    let pair = Pair::new()?;
    let mut alice = open(&pair.path("alice"))?;
    let first = send(&mut alice, "first", b"offline one")?;
    let second = send(&mut alice, "second", b"offline two")?;
    assert_eq!(send(&mut alice, "first", b"offline one")?, first);
    assert!(send(&mut alice, "first", b"changed input").is_err());
    drop(alice);
    let mut bob = open(&pair.path("bob"))?;
    assert!(receive(&mut bob, 2, "two", &second).is_err());
    assert_eq!(cursor(&bob)?, 0);
    assert_eq!(
        receive(&mut bob, 1, "one", &first)?,
        (true, b"offline one".to_vec())
    );
    drop(bob);
    let mut bob = open(&pair.path("bob"))?;
    assert_eq!(
        receive(&mut bob, 1, "one", &first)?,
        (false, b"offline one".to_vec())
    );
    assert!(receive(&mut bob, 1, "one", &second).is_err());
    assert!(receive(&mut bob, 2, "one", &second).is_err());
    assert_eq!(cursor(&bob)?, 1);
    assert_eq!(
        receive(&mut bob, 2, "two", &second)?,
        (true, b"offline two".to_vec())
    );
    let provider = Provider::new(&bob);
    let mut group = load(&provider)?;
    let message = MlsMessageIn::tls_deserialize_exact(&first)?.try_into_protocol_message()?;
    assert!(group.process_message(&provider, message).is_err());
    Ok(())
}

#[test]
fn journal_failure_rolls_back_the_real_send_and_receive_ratchets() -> Result {
    let pair = Pair::new()?;
    let mut alice = open(&pair.path("alice"))?;
    alice.execute_batch("CREATE TEMP TRIGGER injected_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'synthetic I/O failure'); END;")?;
    assert!(send(&mut alice, "failed", b"never committed").is_err());
    assert!(wire(&alice, "failed")?.is_none());
    drop(alice);
    let mut alice = open(&pair.path("alice"))?;
    let first = send(&mut alice, "valid", b"after rollback")?;
    let mut bob = open(&pair.path("bob"))?;
    bob.execute_batch("CREATE TEMP TRIGGER injected_inbox BEFORE INSERT ON inbox BEGIN SELECT RAISE(ABORT,'synthetic I/O failure'); END;")?;
    assert!(receive(&mut bob, 1, "valid", &first).is_err());
    assert_eq!(cursor(&bob)?, 0);
    drop(bob);
    let mut bob = open(&pair.path("bob"))?;
    assert_eq!(receive(&mut bob, 1, "valid", &first)?.1, b"after rollback");
    Ok(())
}

#[test]
fn concurrent_retry_returns_original_wire_without_advancing_ratchet_twice() -> Result {
    let pair = Pair::new()?;
    let barrier = Arc::new(std::sync::Barrier::new(2));
    let mut tasks = Vec::new();
    for _ in 0..2 {
        let path = pair.path("alice");
        let barrier = barrier.clone();
        tasks.push(std::thread::spawn(move || {
            let mut db = open(&path).expect("open isolated DB");
            barrier.wait();
            send(&mut db, "concurrent", b"same request").expect("serialized send")
        }));
    }
    let first = tasks.remove(0).join().expect("writer one");
    let second = tasks.remove(0).join().expect("writer two");
    assert_eq!(first, second);
    let alice = open(&pair.path("alice"))?;
    let count: i64 = alice.query_row(
        "SELECT count(*) FROM outbox WHERE id='concurrent'",
        [],
        |r| r.get(0),
    )?;
    assert_eq!(count, 1);
    let mut bob = open(&pair.path("bob"))?;
    assert_eq!(
        receive(&mut bob, 1, "concurrent", &first)?.1,
        b"same request"
    );
    Ok(())
}

#[test]
fn three_device_group_remove_survives_reload_and_blocks_removed_member() -> Result {
    let directory = tempfile::tempdir()?;
    let paths: Vec<_> = ["alice", "bob", "carol"]
        .iter()
        .map(|n| directory.path().join(n))
        .collect();
    for (i, path) in paths.iter().enumerate() {
        identity(&mut open(path)?, &format!("synthetic-{i}"))?;
    }
    let mut alice = open(&paths[0])?;
    create(&mut alice)?;
    let packages = vec![
        package(&mut open(&paths[1])?)?,
        package(&mut open(&paths[2])?)?,
    ];
    let (_, welcome) = add(&mut alice, &packages)?;
    merge_pending(&mut alice)?;
    join(&mut open(&paths[1])?, &welcome)?;
    join(&mut open(&paths[2])?, &welcome)?;
    let tx = alice.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let provider = Provider::new(&tx);
    let (signer, _) = keys(&tx, &provider)?;
    let mut group = load(&provider)?;
    let (commit, _, _) = group.remove_members(&provider, &signer, &[LeafNodeIndex::new(1)])?;
    let commit = commit.tls_serialize_detached()?;
    tx.execute(
        "INSERT INTO outbox VALUES('remove',?1,'commit',x'',?2,NULL)",
        params![GROUP, commit],
    )?;
    drop(group);
    tx.commit()?;
    drop(alice);
    let mut alice = open(&paths[0])?;
    assert_eq!(epoch(&alice)?, 1); // A transport receipt must not merge this.
    merge_pending(&mut alice)?;
    assert_eq!(epoch(&alice)?, 2);
    for path in &paths[1..] {
        receive(&mut open(path)?, 1, "remove", &commit)?;
    }
    let future = send(&mut alice, "new-epoch", b"remaining members only")?;
    let mut carol = open(&paths[2])?;
    assert_eq!(epoch(&carol)?, 2);
    assert_eq!(
        receive(&mut carol, 2, "new-epoch", &future)?.1,
        b"remaining members only"
    );
    let mut bob = open(&paths[1])?;
    assert!(!load(&Provider::new(&bob))?.is_active());
    assert!(send(&mut bob, "revoked", b"must reject").is_err());
    assert!(receive(&mut bob, 2, "new-epoch", &future).is_err());
    assert_eq!(cursor(&bob)?, 1);
    Ok(())
}

#[test]
#[ignore = "subprocess checkpoint; invoked only by process_crash_recovery"]
fn crash_child() -> Result {
    let path = std::env::var("ECHO_SYNTHETIC_CRASH_DB")?;
    let ready = std::env::var("ECHO_SYNTHETIC_CRASH_READY")?;
    let phase = std::env::var("ECHO_SYNTHETIC_CRASH_PHASE")?;
    let mut db = open(Path::new(&path))?;
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    prepare_send(&tx, "crash-operation", b"crash recovery message")?;
    if phase == "committed" {
        tx.commit()?;
    } else {
        std::fs::write(&ready, b"prepared")?;
        loop {
            std::thread::park();
        }
    }
    std::fs::write(&ready, b"committed")?;
    loop {
        std::thread::park();
    }
}

#[test]
fn process_crash_recovery_before_commit_and_after_unknown_result() -> Result {
    for phase in ["prepared", "committed"] {
        let pair = Pair::new()?;
        let ready = pair.directory.path().join("ready");
        let mut child = Command::new(std::env::current_exe()?)
            .args(["--ignored", "--exact", "crash_child", "--nocapture"])
            .env("ECHO_SYNTHETIC_CRASH_DB", pair.path("alice"))
            .env("ECHO_SYNTHETIC_CRASH_READY", &ready)
            .env("ECHO_SYNTHETIC_CRASH_PHASE", phase)
            .spawn()?;
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while !ready.exists() && std::time::Instant::now() < deadline {
            if let Some(status) = child.try_wait()? {
                return Err(format!("child exited before checkpoint: {status}").into());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let checkpoint = ready.exists();
        child.kill()?;
        let status = child.wait()?;
        assert!(checkpoint, "child did not reach checkpoint");
        assert!(!status.success());
        let mut alice = open(&pair.path("alice"))?;
        let prior = wire(&alice, "crash-operation")?;
        assert_eq!(prior.is_some(), phase == "committed");
        let recovered = send(&mut alice, "crash-operation", b"crash recovery message")?;
        if let Some(prior) = prior {
            assert_eq!(prior, recovered);
        }
        let mut bob = open(&pair.path("bob"))?;
        assert_eq!(
            receive(&mut bob, 1, "crash-operation", &recovered)?.1,
            b"crash recovery message"
        );
        // An old backup/OS power failure is NOT simulated by killing this child.
    }
    Ok(())
}

#[test]
fn self_update_proposal_keys_and_queue_survive_reload_before_commit() -> Result {
    let pair = Pair::new()?;
    let mut bob = open(&pair.path("bob"))?;
    let tx = bob.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let provider = Provider::new(&tx);
    let (signer, _) = keys(&tx, &provider)?;
    let mut group = load(&provider)?;
    let (proposal, _) =
        group.propose_self_update(&provider, &signer, LeafNodeParameters::default())?;
    let proposal = proposal.tls_serialize_detached()?;
    tx.execute(
        "INSERT INTO outbox VALUES('update',?1,'proposal',x'',?2,NULL)",
        params![GROUP, proposal],
    )?;
    drop(group);
    tx.commit()?;
    drop(bob);
    let mut alice = open(&pair.path("alice"))?;
    receive(&mut alice, 1, "update", &proposal)?;
    drop(alice);
    let mut alice = open(&pair.path("alice"))?;
    let tx = alice.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let provider = Provider::new(&tx);
    let (signer, _) = keys(&tx, &provider)?;
    let mut group = load(&provider)?;
    assert_eq!(group.pending_proposals().count(), 1);
    let (commit, _, _) = group.commit_to_pending_proposals(&provider, &signer)?;
    let commit = commit.tls_serialize_detached()?;
    tx.execute(
        "INSERT INTO outbox VALUES('update-commit',?1,'commit',x'',?2,NULL)",
        params![GROUP, commit],
    )?;
    drop(group);
    tx.commit()?;
    merge_pending(&mut alice)?;
    let mut bob = open(&pair.path("bob"))?;
    assert_eq!(load(&Provider::new(&bob))?.pending_proposals().count(), 1);
    receive(&mut bob, 1, "update-commit", &commit)?;
    assert_eq!(epoch(&bob)?, 2);
    assert_eq!(load(&Provider::new(&bob))?.pending_proposals().count(), 0);
    let message = send(&mut alice, "after-update", b"new leaf key works")?;
    assert_eq!(
        receive(&mut bob, 2, "after-update", &message)?.1,
        b"new leaf key works"
    );
    Ok(())
}
