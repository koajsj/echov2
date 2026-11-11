// Explicit Cloud-only regression harness. Never discovers or adopts external databases.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { loadManifest, apply, plan, root } from "./migrate.mjs";

const newName = process.env.TEST_NEW_DATABASE ?? "echo_native";
const legacyName = process.env.TEST_LEGACY_DATABASE ?? "echo_legacy";
if (
  ![newName, legacyName].every((x) => /^echo_[a-z0-9_]+$/.test(x)) ||
  newName === legacyName
)
  throw new Error("Distinct disposable database names required");
if (
  process.env.CONFIRM_CLOUD_TEST_DATABASES !== `${newName},${legacyName}` ||
  !process.env.PGHOST?.startsWith("/workspace/") ||
  process.env.PGPORT !== "55432"
)
  throw new Error(
    "Requires explicit disposable Cloud socket/port and database confirmation",
  );
const connect = async (database, user = "echo_native_owner") => {
  const db = new pg.Client({ database, user });
  await db.connect();
  return db;
};
const manifest = await loadManifest();
const directory = await mkdtemp(join(tmpdir(), "echo-synthetic-legacy-"));
const legacy = structuredClone(manifest);
const original = await readFile(
  join(root, "migrations/001-initial.sql"),
  "utf8",
);
const fixture = original
  .replaceAll("authorization bytea", '"authorization" bytea')
  .replaceAll("octet_length(authorization)", 'octet_length("authorization")');
assert.notEqual(fixture, original);
await writeFile(join(directory, "001-synthetic-legacy.sql"), fixture);
legacy.migrations[0] = {
  version: "001",
  migration_name: "synthetic-legacy-fixture",
  path: join(directory, "001-synthetic-legacy.sql"),
  sha256: createHash("sha256").update(fixture).digest("hex"),
  sql: fixture,
};
const newDb = await connect(newName);
const oldDb = await connect(legacyName);
try {
  await apply(newDb, manifest, newName);
  assert.equal((await plan(newDb, manifest)).pending.length, 0);
  // Apply the explicitly authored fixture only; no adoption of an existing database.
  const first = structuredClone(legacy);
  first.migrations = first.migrations.slice(0, 5);
  await apply(oldDb, first, legacyName);
  const id = randomUUID();
  await oldDb.query(
    "INSERT INTO echo.users(id,username,password_hash) VALUES($1,'synthetic_key_owner','$argon2id$synthetic')",
    [id],
  );
  await oldDb.query(
    'INSERT INTO echo.account_identity_keys(user_id,version,public_key,"authorization") VALUES($1,1,$2,$3)',
    [id, Buffer.alloc(32, 7), Buffer.from([0, 1, 2, 255])],
  );
  const before = (
    await oldDb.query(
      'SELECT encode("authorization",\'hex\') AS value,octet_length("authorization") AS length FROM echo.account_identity_keys WHERE user_id=$1',
      [id],
    )
  ).rows[0];
  await apply(oldDb, legacy, legacyName);
  const after = (
    await oldDb.query(
      "SELECT encode(authorization_proof,'hex') AS value,octet_length(authorization_proof) AS length FROM echo.account_identity_keys WHERE user_id=$1",
      [id],
    )
  ).rows[0];
  assert.deepEqual(after, before);
  const dump = (db) =>
    execFileSync(
      "pg_dump",
      ["--schema-only", "--schema=echo", "-U", "echo_native_owner", "-d", db],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter((x) => !/^\\(?:un)?restrict /.test(x))
      .join("\n");
  const newDump = dump(newName),
    oldDump = dump(legacyName);
  await writeFile(join(directory, "new-schema.sql"), newDump);
  await writeFile(join(directory, "old-schema.sql"), oldDump);
  assert.equal(
    newDump,
    oldDump,
    "Business schema dumps must match, including ACL and function definitions",
  );
  const catalog = `SELECT c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,
    a.attnum,a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,a.attacl::text,
    pg_get_expr(d.adbin,d.adrelid) AS default_value
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='echo' ORDER BY c.relname,a.attnum`;
  assert.deepEqual(
    (await newDb.query(catalog)).rows,
    (await oldDb.query(catalog)).rows,
  );
  assert.equal(
    (
      await newDb.query(
        "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='echo'",
      )
    ).rows[0].n,
    23,
  );
  const roles = (
    await newDb.query(
      "SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname IN ('echo_native_owner','echo_native_api') ORDER BY rolname",
    )
  ).rows;
  assert.equal(roles.length, 2);
  assert(
    roles.every(
      (r) =>
        !r.rolsuper && !r.rolcreatedb && !r.rolcreaterole && !r.rolbypassrls,
    ),
  );
  const databaseAcl = (
    await newDb.query(
      "SELECT has_database_privilege('echo_native_api',current_database(),'TEMP') AS temp, pg_has_role('echo_native_api','echo_native_owner','MEMBER') AS owner_member",
    )
  ).rows[0];
  assert.deepEqual(databaseAcl, { temp: false, owner_member: false });
  const api = await connect(newName, "echo_native_api");
  try {
    for (const sql of [
      "CREATE SCHEMA forbidden",
      "CREATE ROLE forbidden",
      "SELECT * FROM echo_meta.schema_migrations",
      "UPDATE echo_meta.schema_migrations SET status='applied'",
      "INSERT INTO echo.account_identity_keys(user_id,version,public_key,authorization_proof) VALUES(gen_random_uuid(),1,'x','x')",
      "UPDATE echo.messages SET ciphertext='x'",
      "UPDATE echo.deletion_records SET state='complete'",
      "SELECT private_key FROM echo.account_identity_keys",
    ]) {
      await assert.rejects(api.query(sql));
    }
    const u = randomUUID(),
      device = randomUUID(),
      conversation = randomUUID();
    await newDb.query(
      "INSERT INTO echo.users(id,username,password_hash) VALUES($1,'privilege_test','$argon2id$synthetic')",
      [u],
    );
    await newDb.query(
      "INSERT INTO echo.devices(id,user_id,label) VALUES($1,$2,'synthetic')",
      [device, u],
    );
    await newDb.query(
      "INSERT INTO echo.conversations(id,mls_group_id,kind) VALUES($1,$2,'group')",
      [conversation, Buffer.alloc(16, 4)],
    );
    await assert.rejects(
      api.query("UPDATE echo.devices SET status='active' WHERE id=$1", [
        device,
      ]),
      /Runtime role/,
    );
    await assert.rejects(
      api.query("UPDATE echo.conversations SET status='active' WHERE id=$1", [
        conversation,
      ]),
      /Runtime role/,
    );
    const acl = (
      await newDb.query(`SELECT has_schema_privilege('echo_native_api','echo_meta','USAGE') AS metadata,
      has_table_privilege('echo_native_api','echo.users','INSERT') AS registration,
      has_column_privilege('echo_native_api','echo.messages','ciphertext','UPDATE') AS ciphertext,
      has_table_privilege('echo_native_api','echo.account_identity_keys','INSERT') AS keys`)
    ).rows[0];
    assert.deepEqual(acl, {
      metadata: false,
      registration: true,
      ciphertext: false,
      keys: false,
    });
  } finally {
    await api.end();
  }
  // Advisory lock and record/name/checksum integrity.
  await newDb.query("SELECT pg_advisory_lock(170011,6006)");
  const competing = await connect(newName);
  try {
    await assert.rejects(apply(competing, manifest, newName), /advisory lock/);
  } finally {
    await newDb.query("SELECT pg_advisory_unlock(170011,6006)");
    await competing.end();
  }
  const bad = structuredClone(manifest);
  bad.migrations[0].sha256 = "0".repeat(64);
  await assert.rejects(plan(newDb, bad), /checksum mismatch/);
  const badPath = join(directory, "bad-manifest.json");
  await writeFile(badPath, JSON.stringify(bad));
  await assert.rejects(loadManifest(badPath), /checksum mismatch/);
  const admin = await connect(
    "postgres",
    process.env.TEST_ADMIN_USER ?? "agent",
  );
  const created = [];
  try {
    const fresh = async () => {
      const name = "echo_check_" + randomUUID().replaceAll("-", "");
      await admin.query(`CREATE DATABASE ${name} OWNER echo_native_owner`);
      created.push(name);
      return connect(name);
    };
    // Failure receipt and rollback; never proceed to 002 or retry.
    const failed = await fresh();
    try {
      const m = structuredClone(manifest);
      m.migrations[0].sql = "BEGIN; CREATE SCHEMA echo; SELECT 1/0; COMMIT;";
      await assert.rejects(apply(failed, m, failed.database), /Migration 001/);
      assert.equal(
        (await failed.query("SELECT status FROM echo_meta.schema_migrations"))
          .rows[0].status,
        "failed",
      );
      assert.equal(
        (await failed.query("SELECT to_regnamespace('echo') AS schema")).rows[0]
          .schema,
        null,
      );
      await assert.rejects(plan(failed, m), /investigation/);
    } finally {
      await failed.end();
    }
    const unknown = await fresh();
    try {
      await unknown.query("CREATE SCHEMA echo");
      await assert.rejects(plan(unknown, manifest), /adoption forbidden/);
      await unknown.query("DROP SCHEMA echo");
      for (const [create, drop] of [
        ["CREATE SCHEMA pgcustom", "DROP SCHEMA pgcustom"],
        [
          "CREATE FUNCTION public.unrecorded() RETURNS int LANGUAGE sql AS 'SELECT 1'",
          "DROP FUNCTION public.unrecorded()",
        ],
        [
          "CREATE TYPE public.unrecorded AS ENUM ('synthetic')",
          "DROP TYPE public.unrecorded",
        ],
      ]) {
        await unknown.query(create);
        await assert.rejects(plan(unknown, manifest), /adoption forbidden/);
        await unknown.query(drop);
      }
    } finally {
      await unknown.end();
    }
    // 003 legacy data guard: fail atomically and preserve history.
    const guarded = await fresh();
    try {
      const m = structuredClone(legacy);
      m.migrations = m.migrations.slice(0, 2);
      await apply(guarded, m, guarded.database);
      const cid = randomUUID();
      await guarded.query(
        "INSERT INTO echo.conversations(id,mls_group_id,kind) VALUES($1,$2,'group')",
        [cid, Buffer.alloc(16, 8)],
      );
      await guarded.query(
        "INSERT INTO echo.group_heads(conversation_id,route_epoch,last_seq) VALUES($1,1,1)",
        [cid],
      );
      await assert.rejects(
        apply(guarded, legacy, guarded.database),
        /Migration 003/,
      );
      assert.equal(
        (await guarded.query("SELECT route_epoch FROM echo.group_heads"))
          .rows[0].route_epoch,
        "1",
      );
      assert.equal(
        (
          await guarded.query(
            "SELECT status FROM echo_meta.schema_migrations WHERE version='003'",
          )
        ).rows[0].status,
        "failed",
      );
    } finally {
      await guarded.end();
    }
    for (const [label, mutation] of [
      [
        "both columns",
        "ALTER TABLE echo.account_identity_keys ADD COLUMN authorization_proof bytea",
      ],
      [
        "missing columns",
        'ALTER TABLE echo.account_identity_keys DROP COLUMN "authorization"',
      ],
      [
        "wrong type",
        'ALTER TABLE echo.account_identity_keys DROP CONSTRAINT account_identity_keys_authorization_check; ALTER TABLE echo.account_identity_keys ALTER COLUMN "authorization" TYPE text',
      ],
      [
        "wrong check",
        "ALTER TABLE echo.account_identity_keys DROP CONSTRAINT account_identity_keys_authorization_check",
      ],
      [
        "column ACL",
        'GRANT UPDATE ("authorization") ON echo.account_identity_keys TO echo_native_api',
      ],
      [
        "unknown view",
        'CREATE VIEW echo.proof_view AS SELECT "authorization" FROM echo.account_identity_keys',
      ],
      [
        "unrecorded new column",
        'ALTER TABLE echo.account_identity_keys RENAME COLUMN "authorization" TO authorization_proof',
      ],
    ]) {
      const invalid = await fresh();
      try {
        const m = structuredClone(legacy);
        m.migrations = m.migrations.slice(0, 5);
        await apply(invalid, m, invalid.database);
        await invalid.query(mutation);
        await assert.rejects(
          apply(invalid, legacy, invalid.database),
          /Migration 006/,
          label,
        );
        assert.equal(
          (
            await invalid.query(
              "SELECT status FROM echo_meta.schema_migrations WHERE version='006'",
            )
          ).rows[0].status,
          "failed",
        );
      } finally {
        await invalid.end();
      }
    }
    // Simulate a lost bookkeeping write after committed DDL; retain started and stop.
    const lost = await fresh();
    try {
      const m = structuredClone(manifest);
      m.migrations = m.migrations.slice(0, 1);
      m.migrations[0].sql = `BEGIN; CREATE SCHEMA echo;
        CREATE FUNCTION echo_meta.reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic receipt outage'; END;$$;
        CREATE TRIGGER reject_receipt BEFORE UPDATE ON echo_meta.schema_migrations FOR EACH ROW EXECUTE FUNCTION echo_meta.reject_receipt(); COMMIT;`;
      await assert.rejects(
        apply(lost, m, lost.database),
        /synthetic receipt outage/,
      );
      assert.equal(
        (await lost.query("SELECT status FROM echo_meta.schema_migrations"))
          .rows[0].status,
        "started",
      );
      await assert.rejects(plan(lost, m), /investigation/);
    } finally {
      await lost.end();
    }
  } finally {
    for (const database of created)
      await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  }
  console.log(
    JSON.stringify({
      newPath: "PASS",
      legacyPath: "PASS",
      proof: after,
      schemaDump: "identical",
      catalog: "identical",
      baseTables: 23,
      permissionDenials: 10,
      advisoryLock: "PASS",
      checksums: "PASS",
      failedReceipt: "PASS",
      unknownOutcome: "PASS",
      noAdoption: "PASS",
      legacy003Guard: "PASS",
      invalid006States: 7,
      fixture: legacy.migrations[0].sha256,
      artifacts: directory,
    }),
  );
} finally {
  await newDb.end();
  await oldDb.end();
  await rm(join(directory, "bad-manifest.json"), { force: true });
}
