# Native MLS persistence laboratory

**PARTIAL; not a product or browser Provider.** This crate verifies the actual OpenMLS storage contract with the official `openmls_sqlite_storage =0.3.0`, `RustCrypto =0.6.0`, and `OpenMLS =0.9.2`. `Provider` uses the complete SQLite StorageProvider directly; it never constructs `MemoryStorage`. That crate remains a transitive dependency of RustCrypto. Identities are explicitly synthetic BasicCredential labels without account/root authorization.

The SQLite database contains **unencrypted synthetic secrets**. Tests create disposable directories and never open imported backups or external database/WAL files. Do not point the helper subprocess at an existing database or use this code with real identities. The official SQLite adapter does **not support WASM**. This crate is not imported by the server or client and cannot open the application's crypto gate.

## What is exercised

Each mutable operation acquires a SQLite `IMMEDIATE` transaction **before loading the group and signer**. OpenMLS storage writes, immutable wire records, receive deduplication and cursor advancement use the same connection/transaction. On any failure all loaded MLS objects are dropped and the transaction rolls back. `WAL` and `synchronous=FULL` are requested; this is not a guarantee against OS, filesystem or hardware failure.

Six integration tests cover persisted signer and KeyPackage private material, pending Add Commit reload, ordered offline processing, replay rejection, unique message/sequence conflicts, changed-request rejection, send/receive journal failure rollback, two competing writers recovering the same original ciphertext, persisted self-update proposal/own-leaf keys, and three-device Remove with epoch 1→2. The removed device cannot send or decrypt the new epoch. The crash test kills a real child process before commit and after commit with an unknown result, then reloads the original database. The ignored `crash_child` entry is a helper selected explicitly twice by the parent test; it is not an excluded acceptance test.

This tests two/three instances of **the same OpenMLS implementation**, not cross-library interoperability, browser device enrollment, HTTP synchronization or encrypted disaster recovery. The journal helpers intentionally model a single synthetic group and are not a generalized product transport.

## Security blockers

`cargo audit --file crypto/mls-persistence/Cargo.lock --json` exits **1**: the existing three vulnerabilities and one maintenance warning remain, and the SQLite candidate adds **RUSTSEC-2026-0459** (`libsqlite3-sys 0.35.0`, bundled SQLite before 3.54.0). A less trusted database/WAL pair can expose page-cache memory. Tests only open freshly generated local files, but this does not fix the affected dependency or make backup import safe. The official adapter pins the rusqlite 0.37 family; patched `libsqlite3-sys >=0.39.0` belongs to a different rusqlite release family. No incompatible patch, vendoring or audit ignore was applied. Do not promote this candidate to product use before an audited compatible upgrade and storage encryption.

## Reproduce in Codex Cloud

```sh
cargo +1.99.1 test --locked --manifest-path crypto/mls-persistence/Cargo.toml
cargo +1.99.1 fmt --manifest-path crypto/mls-persistence/Cargo.toml --all -- --check
cargo +1.99.1 audit --file crypto/mls-persistence/Cargo.lock --json
```

The audit command is expected to fail until the actual dependencies are fixed; never use its failure as a passing check. Rust 1.99.1 is pinned in `rust-toolchain.toml`. All resolved dependencies are fixed by `Cargo.lock`. See the [current continuation report](../../docs/ci-mls-continuation-report.md) and [cryptography boundary](../../docs/native-cryptography.md).
