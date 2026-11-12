import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = "migrations/baselines/echo-native-v1/manifest.json";
export async function loadManifest(path = resolve(root, manifestPath)) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (
    typeof manifest.baseline_id !== "string" ||
    !manifest.baseline_id ||
    !Number.isInteger(manifest.postgres_major_min) ||
    !Number.isInteger(manifest.postgres_major_max) ||
    manifest.postgres_major_min < 17 ||
    manifest.postgres_major_max < manifest.postgres_major_min ||
    !Array.isArray(manifest.migrations)
  )
    throw new Error(
      "Invalid manifest identity, version range or migration list",
    );
  const seen = new Set();
  for (const item of [manifest.source, ...manifest.migrations]) {
    if (
      !item ||
      typeof item.path !== "string" ||
      !item.path ||
      !/^[0-9a-f]{64}$/.test(item.sha256) ||
      (item.version &&
        (typeof item.migration_name !== "string" || !item.migration_name))
    )
      throw new Error("Invalid manifest file entry");
    const file = resolve(root, item.path);
    const sql = await readFile(file, "utf8");
    if (createHash("sha256").update(sql).digest("hex") !== item.sha256)
      throw new Error("Migration checksum mismatch: " + item.path);
    if (item.version) {
      if (seen.has(item.version))
        throw new Error("Duplicate migration version");
      seen.add(item.version);
      item.sql = sql;
    }
  }
  if (
    manifest.migrations.map((x) => x.version).join(",") !==
    "001,002,003,004,005,006,007"
  )
    throw new Error("Expected explicit ordered versions 001 through 007");
  return manifest;
}
export async function inspect(db) {
  const result = await db.query(`SELECT current_database() AS database,
    current_user AS role, current_setting('server_version_num')::int AS postgres_version,
    EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='echo') AS business_schema,
    to_regclass('echo_meta.schema_migrations') IS NOT NULL AS metadata`);
  return result.rows[0];
}
async function owner(db) {
  const { rows } =
    await db.query(`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls
    FROM pg_roles WHERE rolname=current_user`);
  const r = rows[0];
  if (
    r.rolname !== "echo_native_owner" ||
    r.rolsuper ||
    r.rolcreatedb ||
    r.rolcreaterole ||
    r.rolbypassrls
  )
    throw new Error(
      "Connect as the non-superuser echo_native_owner; do not use an administrator connection",
    );
}
async function metadataOwner(db) {
  const { rows } =
    await db.query(`SELECT n.nspowner=current_user::regrole AS schema_owner,
    c.relowner=current_user::regrole AS table_owner,
    has_schema_privilege('echo_native_api',n.oid,'USAGE') AS api_access,
    (SELECT count(*) FROM pg_class x WHERE x.relnamespace=n.oid AND x.relkind IN ('r','v','m','S')) AS objects
    FROM pg_namespace n JOIN pg_class c ON c.relnamespace=n.oid
    WHERE n.nspname='echo_meta' AND c.relname='schema_migrations'`);
  if (
    rows.length !== 1 ||
    !rows[0].schema_owner ||
    !rows[0].table_owner ||
    rows[0].api_access ||
    rows[0].objects !== "1"
  )
    throw new Error(
      "Unrecognized metadata ownership/ACL/objects; manual review required",
    );
  const model = await db.query(`SELECT 1 FROM pg_attribute
    WHERE attrelid='echo_meta.schema_migrations'::regclass AND attname='baseline_id'
    AND attnotnull AND atttypid='text'::regtype AND NOT attisdropped`);
  if (model.rowCount !== 1)
    throw new Error(
      "Legacy migration ledger requires explicitly reviewed upgrade; automatic adoption forbidden",
    );
  const acl = await db.query(`SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL
    aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    WHERE n.nspname='echo_meta' AND a.grantee<>n.nspowner
    UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE n.nspname='echo_meta' AND a.grantee<>c.relowner`);
  if (acl.rowCount)
    throw new Error("Metadata must be accessible only to owner");
}
async function emptyDatabase(db, allowMetadata) {
  const objects = await db.query(
    `SELECT 1 FROM pg_namespace n WHERE
      n.nspname NOT IN ('public','information_schema') AND n.nspname !~ '^pg_' AND NOT ($1::boolean AND n.nspname='echo_meta')
      UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public'
      UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
      UNION ALL SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public'`,
    [allowMetadata],
  );
  return objects.rowCount === 0;
}
export async function plan(db, manifest) {
  await owner(db);
  const info = await inspect(db);
  const major = Math.floor(info.postgres_version / 10000);
  if (
    major < manifest.postgres_major_min ||
    major > manifest.postgres_major_max
  )
    throw new Error("PostgreSQL version outside verified manifest range");
  if (!info.metadata) {
    const empty = await emptyDatabase(db, false);
    if (!empty || info.business_schema)
      throw new Error(
        "Nonempty or unrecorded database: automatic adoption forbidden",
      );
    return { info, records: [], pending: manifest.migrations };
  }
  await metadataOwner(db);
  const records = (
    await db.query("SELECT * FROM echo_meta.schema_migrations ORDER BY version")
  ).rows;
  if (!records.length && !(await emptyDatabase(db, true)))
    throw new Error(
      "Nonempty database with empty metadata; manual review required",
    );
  if (records.length > manifest.migrations.length)
    throw new Error("Unknown migration record");
  let awaiting = false;
  let completed = 0;
  for (const [i, row] of records.entries()) {
    const item = manifest.migrations[i];
    if (
      row.version !== item.version ||
      row.migration_name !== item.migration_name ||
      row.sha256 !== item.sha256 ||
      row.baseline_id !== manifest.baseline_id
    )
      throw new Error(
        "Migration record order/name/checksum mismatch; manual review required",
      );
    if (!["applied", "pending"].includes(row.status))
      throw new Error(
        "Failed/started outcome requires owner investigation; automatic retry forbidden",
      );
    if (row.status === "pending") awaiting = true;
    else {
      if (awaiting) throw new Error("Applied version after pending record");
      completed++;
    }
  }
  if (completed === 0 && !(await emptyDatabase(db, true)))
    throw new Error(
      "Pending baseline requires empty database; manual review required",
    );
  if (info.business_schema !== completed > 0)
    throw new Error("Schema and baseline record disagree");
  return { info, records, pending: manifest.migrations.slice(completed) };
}
export async function apply(db, manifest, confirmedDatabase) {
  await owner(db);
  if ((await inspect(db)).database !== confirmedDatabase)
    throw new Error("--confirm-database must match current_database()");
  const lock = await db.query(
    "SELECT pg_try_advisory_lock(170011, 6006) AS locked",
  );
  if (!lock.rows[0].locked)
    throw new Error("Another migration session holds the advisory lock");
  try {
    const work = await plan(db, manifest);
    if (!work.info.metadata) {
      await db.query(`BEGIN;
        CREATE SCHEMA echo_meta AUTHORIZATION echo_native_owner;
        REVOKE ALL ON SCHEMA echo_meta FROM PUBLIC, echo_native_api;
        CREATE TABLE echo_meta.schema_migrations (
          version text PRIMARY KEY, migration_name text NOT NULL, baseline_id text NOT NULL,
          sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
          status text NOT NULL CHECK(status IN ('pending','started','applied','failed')),
          started_at timestamptz,
          applied_at timestamptz, postgres_version text NOT NULL,
          error_code text, CHECK((status='applied')=(applied_at IS NOT NULL))
        );
        REVOKE ALL ON echo_meta.schema_migrations FROM PUBLIC, echo_native_api;
        `);
      for (const item of manifest.migrations)
        await db.query(
          `INSERT INTO echo_meta.schema_migrations
        (version,migration_name,sha256,baseline_id,status,postgres_version)
        VALUES($1,$2,$3,$4,'pending',current_setting('server_version'))`,
          [
            item.version,
            item.migration_name,
            item.sha256,
            manifest.baseline_id,
          ],
        );
      await db.query("COMMIT");
    }
    if (work.info.metadata) {
      for (const item of manifest.migrations.slice(work.records.length)) {
        await db.query(
          `INSERT INTO echo_meta.schema_migrations
          (version,migration_name,sha256,baseline_id,status,postgres_version)
          VALUES($1,$2,$3,$4,'pending',current_setting('server_version'))`,
          [
            item.version,
            item.migration_name,
            item.sha256,
            manifest.baseline_id,
          ],
        );
      }
    }
    for (const item of work.pending) {
      const started = await db.query(
        `UPDATE echo_meta.schema_migrations SET status='started',started_at=clock_timestamp()
        WHERE version=$1 AND baseline_id=$2 AND status='pending' RETURNING version`,
        [item.version, manifest.baseline_id],
      );
      if (started.rowCount !== 1)
        throw new Error(
          "Could not persist exactly one started receipt; manual review required",
        );
      try {
        // Each checked-in SQL file owns its BEGIN/COMMIT. The durable started receipt
        // intentionally precedes it so a lost acknowledgement cannot cause replay.
        await db.query(item.sql);
      } catch (error) {
        if (
          /^[0-9A-Z]{5}$/.test(error.code ?? "") &&
          !error.code.startsWith("08")
        ) {
          await db.query("ROLLBACK");
          await db.query(
            "UPDATE echo_meta.schema_migrations SET status='failed',error_code=$2 WHERE version=$1 AND status='started'",
            [item.version, error.code],
          );
        }
        throw new Error(
          "Migration " +
            item.version +
            " failed or has unknown outcome; inspect owner records; no subsequent file executed",
        );
      }
      // If this write fails after SQL COMMIT, leave started and require manual review.
      const applied = await db.query(
        "UPDATE echo_meta.schema_migrations SET status='applied',applied_at=clock_timestamp() WHERE version=$1 AND status='started'",
        [item.version],
      );
      if (applied.rowCount !== 1)
        throw new Error(
          "SQL committed but applied receipt unconfirmed; manual review required",
        );
      process.stdout.write(
        JSON.stringify({
          version: item.version,
          sha256: item.sha256,
          status: "applied",
          exitCode: 0,
        }) + "\n",
      );
    }
  } catch (error) {
    // Metadata initialization can fail inside its own transaction. Release the
    // aborted transaction before unlocking, and never leave a reusable connection
    // in failed-transaction state. A lost connection still requires investigation.
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await db.query("SELECT pg_advisory_unlock(170011, 6006)");
  }
}
export async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  let database;
  let selectedManifest;
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!value) throw new Error("Missing option value");
    if (flag === "--confirm-database" && !database) database = value;
    else if (flag === "--manifest" && !selectedManifest)
      selectedManifest = value;
    else throw new Error("Unknown or duplicate option");
  }
  if (
    !["inspect", "plan", "apply", "status"].includes(command) ||
    (command === "apply" && !database)
  )
    throw new Error(
      "Usage: node scripts/migrate.mjs inspect|plan|status|apply --confirm-database NAME",
    );
  const manifest = await loadManifest(selectedManifest);
  const db = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  await db.connect();
  try {
    if (command === "inspect") console.log(await inspect(db));
    if (command === "plan")
      console.log(
        (await plan(db, manifest)).pending.map(
          ({ version, migration_name, sha256 }) => ({
            version,
            migration_name,
            sha256,
          }),
        ),
      );
    if (command === "status") {
      await owner(db);
      const info = await inspect(db);
      if (!info.metadata) console.log([]);
      else {
        await metadataOwner(db);
        console.log(
          (
            await db.query(
              "SELECT * FROM echo_meta.schema_migrations ORDER BY version",
            )
          ).rows,
        );
      }
    }
    if (command === "apply") await apply(db, manifest, database);
  } finally {
    await db.end();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    // Driver/config errors can contain credentials; never print raw exceptions.
    process.stderr.write(
      "Migration command refused or failed. Check manifest, owner role, target, plan and status. Unknown outcomes require manual review.\n",
    );
    process.exitCode = 1;
  });
}
