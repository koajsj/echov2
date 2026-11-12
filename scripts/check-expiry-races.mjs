// Locks deliberately cross expiry boundaries in disposable Cloud PostgreSQL.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import { DeviceService } from "../src/server/devices/device-service.ts";
import {
  AccountService,
  tokenHash,
} from "../src/server/accounts/account-service.ts";
if (
  process.env.CONFIRM_CLOUD_AUTH !== "echo_native" ||
  !process.env.PGHOST?.startsWith("/workspace/") ||
  process.env.PGPORT !== "55432"
)
  throw new Error("Disposable Cloud target required");
const owner = new pg.Client({
  database: "echo_native",
  user: "echo_native_owner",
});
const observer = new pg.Client({
  database: "echo_native",
  user: "agent",
});
const pool = new pg.Pool({
  database: "echo_native",
  user: "echo_native_api",
  application_name: "echo-expiry-race",
  statement_timeout: 5000,
});
await owner.connect();
await observer.connect();
async function waiting() {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const result = await observer.query(
      "SELECT 1 FROM pg_stat_activity WHERE application_name='echo-expiry-race' AND wait_event_type='Lock'",
    );
    if (result.rowCount) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Expected lock wait was not observed");
}
const id = randomUUID(),
  session = randomUUID(),
  invitation = randomBytes(32).toString("base64url");
try {
  await owner.query(
    "INSERT INTO echo.users(id,username,password_hash) VALUES($1,$2,'$argon2id$synthetic')",
    [id, "expiry_" + randomBytes(5).toString("hex")],
  );
  await owner.query(
    "INSERT INTO echo.sessions(id,token_hash,user_id,audience,expires_at) VALUES($1,$2,$3,'user',clock_timestamp()+interval '1 hour')",
    [session, tokenHash(randomBytes(32).toString("hex")), id],
  );
  await owner.query("BEGIN");
  await owner.query("SELECT id FROM echo.users WHERE id=$1 FOR UPDATE", [id]);
  const device = new DeviceService(pool)
    .register(id, session, "Expired session must not register")
    .then(
      () => null,
      (e) => e.code,
    );
  await waiting();
  await owner.query(
    "UPDATE echo.sessions SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE id=$1",
    [session],
  );
  await owner.query("COMMIT");
  assert.equal(await device, "SESSION_EXPIRED");
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int n FROM echo.devices WHERE user_id=$1",
        [id],
      )
    ).rows[0].n,
    0,
  );
  await owner.query(
    "UPDATE echo.site_settings SET registration_mode='invite' WHERE singleton",
  );
  await owner.query(
    "INSERT INTO echo.invitations(id,token_hash,max_uses,expires_at,created_by) VALUES($1,$2,1,clock_timestamp()+interval '1 hour',$3)",
    [randomUUID(), tokenHash(invitation), id],
  );
  await owner.query("BEGIN");
  await owner.query(
    "SELECT singleton FROM echo.site_settings WHERE singleton FOR UPDATE",
  );
  const operation = randomUUID();
  const registration = new AccountService(pool, "unused")
    .register({
      operationId: operation,
      username: "race_" + randomBytes(5).toString("hex"),
      password: randomBytes(24).toString("base64url"),
      invitation,
    })
    .then(
      () => null,
      (e) => e.code,
    );
  await waiting();
  await owner.query(
    "UPDATE echo.invitations SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE token_hash=$1",
    [tokenHash(invitation)],
  );
  await owner.query("COMMIT");
  assert.equal(await registration, "INVITATION_INVALID");
  assert.equal(
    (
      await owner.query(
        "SELECT uses FROM echo.invitations WHERE token_hash=$1",
        [tokenHash(invitation)],
      )
    ).rows[0].uses,
    0,
  );
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int n FROM echo.users WHERE registration_id=$1",
        [operation],
      )
    ).rows[0].n,
    0,
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      deviceExpiry: "rejected after observed account lock wait",
      invitationExpiry: "rejected after observed settings lock wait",
      createdDevices: 0,
      consumedInvitations: 0,
      registeredAccounts: 0,
    }),
  );
} finally {
  await owner.query("ROLLBACK");
  await owner.query(
    "UPDATE echo.site_settings SET registration_mode='closed' WHERE singleton",
  );
  await pool.end();
  await observer.end();
  await owner.end();
}
