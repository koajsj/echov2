// Owner-controlled migration/collision fixtures in a disposable Cloud database only.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import { loadManifest, apply } from "./migrate.mjs";
import { AccountService } from "../src/server/accounts/account-service.ts";
if (
  process.env.CONFIRM_CLOUD_PUBLIC_IDS !== "echo_public_ids" ||
  !process.env.PGHOST?.startsWith("/workspace/") ||
  process.env.PGPORT !== "55432"
)
  throw new Error("Explicit disposable Cloud target required");
const owner = new pg.Client({
  database: "echo_public_ids",
  user: "echo_native_owner",
});
const pool = new pg.Pool({
  database: "echo_public_ids",
  user: "echo_native_api",
});
await owner.connect();
const manifest = await loadManifest();
try {
  const prior = structuredClone(manifest);
  prior.migrations = prior.migrations.slice(0, 6);
  await apply(owner, prior, "echo_public_ids");
  const id = randomUUID(),
    device = randomUUID();
  await owner.query(
    "INSERT INTO echo.users(id,username,password_hash) VALUES($1,'existing_account','$argon2id$synthetic')",
    [id],
  );
  await owner.query(
    "INSERT INTO echo.devices(id,user_id,label) VALUES($1,$2,'existing device')",
    [device, id],
  );
  const before = (
    await owner.query("SELECT id,user_id,label FROM echo.devices WHERE id=$1", [
      device,
    ])
  ).rows[0];
  await apply(owner, manifest, "echo_public_ids");
  const backfill = (
    await owner.query("SELECT public_id FROM echo.users WHERE id=$1", [id])
  ).rows[0].public_id;
  assert.match(backfill, /^[A-Z2-7]{12}$/);
  assert.deepEqual(
    (
      await owner.query(
        "SELECT id,user_id,label FROM echo.devices WHERE id=$1",
        [device],
      )
    ).rows[0],
    before,
  );
  const generated = (
    await owner.query(
      "SELECT echo.new_public_user_id() AS id FROM generate_series(1,5000)",
    )
  ).rows.map((row) => row.id);
  assert(generated.every((value) => /^[A-Z2-7]{12}$/.test(value)));
  assert.equal(new Set(generated).size, 5000);
  await owner.query("UPDATE echo.site_settings SET registration_mode='open'");
  // A nontransactional sequence makes exactly the first candidate collide, even after SAVEPOINT rollback.
  await owner.query("CREATE SEQUENCE public.collision_candidates");
  await owner.query(
    "GRANT USAGE ON SEQUENCE public.collision_candidates TO echo_native_api",
  );
  await owner.query(
    "ALTER TABLE echo.users ALTER COLUMN public_id SET DEFAULT CASE WHEN nextval('public.collision_candidates')=1 THEN '" +
      backfill +
      "' ELSE echo.new_public_user_id() END",
  );
  const service = new AccountService(pool, "unused");
  const input = {
    operationId: randomUUID(),
    username: "id_" + randomBytes(5).toString("hex"),
    password: randomBytes(24).toString("base64url"),
  };
  const account = await service.register(input);
  assert.notEqual(account.publicId, backfill);
  assert.match(account.publicId, /^[A-Z2-7]{12}$/);
  assert.equal(
    (
      await owner.query(
        "SELECT last_value::int FROM public.collision_candidates",
      )
    ).rows[0].last_value,
    2,
  );
  assert.deepEqual(await service.register(input), account);
  await assert.rejects(
    pool.query("UPDATE echo.users SET public_id='AAAAAAAAAAAA' WHERE id=$1", [
      account.id,
    ]),
    (error) => error.code === "42501",
  );
  await assert.rejects(
    owner.query(
      "INSERT INTO echo.users(id,username,password_hash,public_id) VALUES($1,'duplicate_id','$argon2id$synthetic',$2)",
      [randomUUID(), backfill],
    ),
    (error) =>
      error.code === "23505" && error.constraint === "users_public_id_key",
  );
  await owner.query(
    "ALTER TABLE echo.users ALTER COLUMN public_id SET DEFAULT '" +
      backfill +
      "'",
  );
  const rejectedId = randomUUID();
  await assert.rejects(
    service.register({
      ...input,
      operationId: rejectedId,
      username: input.username + "x",
    }),
    (error) => error.code === "PUBLIC_ID_RETRY_REQUIRED",
  );
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int n FROM echo.users WHERE registration_id=$1",
        [rejectedId],
      )
    ).rows[0].n,
    0,
  );
  await owner.query(
    "ALTER TABLE echo.users ALTER COLUMN public_id SET DEFAULT echo.new_public_user_id()",
  );
  const concurrent = {
    ...input,
    operationId: randomUUID(),
    username: input.username + "c",
  };
  const [a, b] = await Promise.all([
    service.register(concurrent),
    service.register(concurrent),
  ]);
  assert.deepEqual(a, b);
  console.log(
    JSON.stringify({
      status: "PASS",
      backfill: "UUID and device FK preserved",
      generated: 5000,
      unique: 5000,
      collisionRetry: "second candidate succeeds",
      idempotent: true,
      concurrentIdempotent: true,
      exhaustion: "503 and zero rows",
      apiUpdateDenied: true,
      uniqueConstraint: true,
    }),
  );
} finally {
  await owner.query("ROLLBACK");
  await owner
    .query(
      "ALTER TABLE echo.users ALTER COLUMN public_id SET DEFAULT echo.new_public_user_id()",
    )
    .catch(() => {});
  await owner.query("DROP SEQUENCE IF EXISTS public.collision_candidates");
  await pool.end();
  await owner.end();
}
