// Owner-authored synthetic authorization rows exercise SQL concurrency only.
// They never stand in for verified MLS credentials or application trust admission.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
const { DeletionService } = await import(
  new URL(
    "../dist/server/server/lifecycle/deletion-service.js",
    import.meta.url,
  ).href
);
const database = process.env.TEST_DELETION_DATABASE;
if (
  !/^echo_final[0-9]+_new$/.test(database ?? "") ||
  process.env.CONFIRM_CLOUD_DELETION !== database ||
  !process.env.PGHOST?.startsWith("/workspace/") ||
  process.env.PGPORT !== "55432"
)
  throw new Error("Explicit disposable Cloud database required");
const owner = new pg.Client({ database, user: "echo_native_owner" });
await owner.connect();
const observer = new pg.Client({ database, user: "agent" });
await observer.connect();
const pool = new pg.Pool({
  database,
  user: "echo_native_api",
  max: 2,
  application_name: "echo-deletion-race",
  lock_timeout: 5000,
});
try {
  const fixtures = [];
  for (let i = 0; i < 2; i++) {
    const f = {
      user: randomUUID(),
      device: randomUUID(),
      session: randomUUID(),
      conversation: randomUUID(),
      message: randomUUID(),
    };
    fixtures.push(f);
    await owner.query(
      "INSERT INTO echo.users(id,username,password_hash) VALUES($1,$2,'$argon2id$synthetic')",
      [f.user, "race_" + randomBytes(5).toString("hex")],
    );
    await owner.query(
      "INSERT INTO echo.devices(id,user_id,label,status) VALUES($1,$2,'synthetic SQL fixture','active')",
      [f.device, f.user],
    );
    await owner.query(
      "INSERT INTO echo.sessions(id,token_hash,user_id,device_id,audience,expires_at) VALUES($1,$2,$3,$4,'user',now()+interval '1 hour')",
      [f.session, randomBytes(32).toString("hex"), f.user, f.device],
    );
    await owner.query(
      "INSERT INTO echo.account_identity_keys(user_id,version,public_key,authorization_proof) VALUES($1,1,$2,$3)",
      [f.user, Buffer.alloc(32, 7), Buffer.from([1])],
    );
    await owner.query(
      "INSERT INTO echo.device_credentials(id,user_id,device_id,root_version,credential,signature_public_key,expires_at) VALUES($1,$2,$3,1,$4,$5,now()+interval '1 hour')",
      [randomUUID(), f.user, f.device, Buffer.from([1]), Buffer.alloc(32, 8)],
    );
    await owner.query(
      "INSERT INTO echo.conversations(id,mls_group_id,kind) VALUES($1,$2,'group')",
      [f.conversation, randomBytes(16)],
    );
    await owner.query(
      "INSERT INTO echo.messages(id,conversation_id,seq,route_version,sender_user_id,sender_device_id,operation_id,request_hash,wire_kind,ciphertext) VALUES($1,$2,1,0,$3,$4,$5,$6,'application',$7)",
      [
        f.message,
        f.conversation,
        f.user,
        f.device,
        randomUUID(),
        "synthetic",
        Buffer.from([9]),
      ],
    );
  }
  const service = new DeletionService(pool);
  const operation = randomUUID();
  await owner.query("BEGIN; LOCK TABLE echo.deletion_records IN SHARE MODE");
  const pending = fixtures.map((f) =>
    service.request(f.user, f.session, f.message, operation),
  );
  const settled = Promise.allSettled(pending);
  let blocked = 0;
  for (let i = 0; i < 100; i++) {
    blocked = (
      await observer.query(
        "SELECT count(*)::int n FROM pg_stat_activity WHERE application_name='echo-deletion-race' AND wait_event_type='Lock'",
      )
    ).rows[0].n;
    if (blocked === 2) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  await owner.query("COMMIT");
  assert.equal(
    blocked,
    2,
    "both requests must race after their initial operation lookup",
  );
  const result = await settled;
  assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  const failure = result.find((x) => x.status === "rejected");
  assert.equal(failure.reason.code, "OPERATION_CONFLICT");
  const rows = (
    await owner.query(
      "SELECT id,deletion_requested_at FROM echo.messages WHERE id=ANY($1::uuid[]) ORDER BY id",
      [fixtures.map((f) => f.message)],
    )
  ).rows;
  assert.equal(rows.filter((x) => x.deletion_requested_at !== null).length, 1);
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int n FROM echo.deletion_records WHERE operation_id=$1",
        [operation],
      )
    ).rows[0].n,
    1,
  );
  const winner = fixtures[result.findIndex((x) => x.status === "fulfilled")];
  assert.equal(
    (
      await service.request(
        winner.user,
        winner.session,
        winner.message,
        operation,
      )
    ).state,
    "pending-anchor",
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      concurrentRequests: 2,
      operationRows: 1,
      hiddenMessages: 1,
      conflict: "409 OPERATION_CONFLICT",
      retry: "pending-anchor",
      scope:
        "SQL transaction test only; no deletion anchor, purge or offline propagation",
    }),
  );
} finally {
  await owner.query("ROLLBACK");
  await pool.end();
  await owner.end();
  await observer.end();
}
