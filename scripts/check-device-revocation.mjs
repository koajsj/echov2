// SQL authorization fixtures only; these bytes are not trusted MLS credentials.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import WebSocket from "ws";
import { DeviceService } from "../dist/server/server/devices/device-service.js";
if (
  process.env.CONFIRM_CLOUD_AUTH !== "echo_native" ||
  !process.env.PGHOST?.startsWith("/workspace/") ||
  process.env.PGPORT !== "55432"
)
  throw new Error("Explicit disposable Cloud database required");
const owner = new pg.Client({
  database: "echo_native",
  user: "echo_native_owner",
});
const api = new pg.Pool({
  database: "echo_native",
  user: "echo_native_api",
  max: 2,
});
await owner.connect();
const tokens = new Map();
let socket;
const user = randomUUID(),
  device = randomUUID(),
  credential = randomUUID(),
  session = randomUUID(),
  targetSession = randomUUID(),
  conversation = randomUUID();
try {
  await owner.query(
    "INSERT INTO echo.users(id,username,password_hash) VALUES($1,$2,'$argon2id$synthetic')",
    [user, "revoke_" + randomBytes(5).toString("hex")],
  );
  await owner.query(
    "INSERT INTO echo.devices(id,user_id,label,status) VALUES($1,$2,'synthetic SQL fixture','active')",
    [device, user],
  );
  for (const [id, bound] of [
    [session, null],
    [targetSession, device],
  ]) {
    const token = randomBytes(32).toString("base64url");
    tokens.set(id, token);
    await owner.query(
      "INSERT INTO echo.sessions(id,user_id,device_id,token_hash,audience,expires_at) VALUES($1,$2,$3,$4,'user',now()+interval '1 hour')",
      [id, user, bound, createHash("sha256").update(token).digest("hex")],
    );
  }
  await owner.query(
    "INSERT INTO echo.account_identity_keys(user_id,version,public_key,authorization_proof) VALUES($1,1,$2,$3)",
    [user, Buffer.alloc(32, 1), Buffer.from([1])],
  );
  await owner.query(
    "INSERT INTO echo.device_credentials(id,user_id,device_id,root_version,credential,signature_public_key,expires_at) VALUES($1,$2,$3,1,$4,$5,now()+interval '1 hour')",
    [credential, user, device, Buffer.from([1]), Buffer.alloc(32, 2)],
  );
  for (const claimed of [false, true])
    await owner.query(
      "INSERT INTO echo.key_packages(reference,device_id,credential_id,public_package,expires_at,claimed_operation,claimed_at) VALUES($1,$2,$3,$4,now()+interval '1 hour',$5,$6)",
      [
        randomBytes(32),
        device,
        credential,
        Buffer.from([1]),
        claimed ? randomUUID() : null,
        claimed ? new Date() : null,
      ],
    );
  await owner.query(
    "INSERT INTO echo.conversations(id,mls_group_id,kind,status) VALUES($1,$2,'group','active')",
    [conversation, randomBytes(16)],
  );
  await owner.query(
    "INSERT INTO echo.conversation_members(conversation_id,user_id,role) VALUES($1,$2,'owner')",
    [conversation, user],
  );
  await owner.query(
    "INSERT INTO echo.conversation_devices(conversation_id,user_id,device_id,joined_seq) VALUES($1,$2,$3,0)",
    [conversation, user, device],
  );
  const connection = await api.connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      "UPDATE echo.devices SET status='revoked',revoked_at=clock_timestamp() WHERE id=$1",
      [device],
    );
    await connection.query("ROLLBACK");
  } finally {
    connection.release();
  }
  assert.equal(
    (
      await owner.query(
        "SELECT revoked_at FROM echo.device_credentials WHERE id=$1",
        [credential],
      )
    ).rows[0].revoked_at,
    null,
  );
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int n FROM echo.key_packages WHERE device_id=$1",
        [device],
      )
    ).rows[0].n,
    2,
  );
  await assert.rejects(api.query("SELECT echo.revoke_device_material()"));
  const actor = { id: session, audience: "user", account: { id: user } };
  const service = new DeviceService(api);
  socket = new WebSocket(
    "ws://127.0.0.1:3001/v1/events?context=" + targetSession,
    {
      origin: "https://localhost:8443",
      headers: { Cookie: "__Host-echo-user=" + tokens.get(targetSession) },
    },
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("WebSocket authentication timeout")),
      5000,
    );
    socket.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    socket.once("message", (bytes) => {
      clearTimeout(timer);
      try {
        assert.equal(JSON.parse(bytes.toString()).type, "connected");
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Revoked WebSocket remained open")),
      5000,
    );
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  void closed.catch(() => {});
  const csrf = randomBytes(32).toString("base64url");
  const response = await fetch(
    "http://127.0.0.1:3001/v1/devices/" + device + "/revoke",
    {
      method: "POST",
      headers: {
        Origin: "https://localhost:8443",
        Cookie:
          "__Host-echo-user=" +
          tokens.get(session) +
          "; __Host-echo-csrf-user=" +
          csrf,
        "X-Echo-CSRF": csrf,
        "X-Echo-Session": session,
      },
    },
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.serviceAccessRevoked, true);
  assert.equal(result.groupRemoval, "BLOCKED");
  await closed;
  const denied = await fetch("http://127.0.0.1:3001/v1/session?audience=user", {
    headers: { Cookie: "__Host-echo-user=" + tokens.get(targetSession) },
  });
  assert.equal(denied.status, 401);
  assert.deepEqual(await service.revoke(actor, device), []);
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int n FROM echo.sessions WHERE id=$1",
        [targetSession],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await owner.query(
        "SELECT revoked_at IS NOT NULL AS revoked FROM echo.device_credentials WHERE id=$1",
        [credential],
      )
    ).rows[0].revoked,
    true,
  );
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int n FROM echo.key_packages WHERE device_id=$1 AND claimed_at IS NULL",
        [device],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int n FROM echo.key_packages WHERE device_id=$1 AND claimed_at IS NOT NULL",
        [device],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await owner.query("SELECT status FROM echo.conversations WHERE id=$1", [
        conversation,
      ])
    ).rows[0].status,
    "frozen",
  );
  await assert.rejects(
    api.query(
      "UPDATE echo.devices SET status='active',revoked_at=NULL WHERE id=$1",
      [device],
    ),
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      serviceSessions: "revoked",
      websocket:
        "authenticated socket disconnected after HTTP revoke; old session rejected",
      directoryCredentials: "revoked atomically",
      unclaimedPackages: "deleted",
      claimedPackages: "retained",
      conversation: "frozen",
      transactionRollback: "PASS",
      reactivationDenied: "PASS",
      cryptographicRemoval: "BLOCKED: no MLS Remove/epoch or trusted admission",
    }),
  );
} finally {
  socket?.terminate();
  await owner.end();
  await api.end();
}
