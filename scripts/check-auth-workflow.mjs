// Real HTTP and PostgreSQL checks, exclusively against explicitly confirmed Cloud fixtures.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import pg from "pg";
if (
  process.env.CONFIRM_CLOUD_AUTH !== "echo_native" ||
  !process.env.PGHOST?.startsWith("/workspace/") ||
  process.env.PGPORT !== "55432"
)
  throw new Error("Explicit Cloud test target required");
const db = new pg.Client({
  database: "echo_native",
  user: "echo_native_owner",
});
await db.connect();
const password = randomBytes(24).toString("base64url");
const username = "cloud_" + randomBytes(5).toString("hex");
const registration = { operationId: randomUUID(), username, password };
let cookie = "",
  csrf = "",
  session = "";
const results = [];
async function request(
  label,
  path,
  method = "GET",
  body,
  expected = 200,
  ip = "192.0.2.10",
) {
  const response = await fetch("http://127.0.0.1:3001" + path, {
    method,
    headers: {
      Origin: "https://localhost:8443",
      "X-Forwarded-For": ip,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(session ? { "X-Echo-Session": session } : {}),
      ...(csrf ? { "X-Echo-CSRF": csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? null : await response.json();
  assert.equal(response.status, expected, label + ": " + JSON.stringify(data));
  if (path === "/v1/sessions" && expected === 200) {
    const cookies = response.headers.getSetCookie();
    assert(cookies.every((c) => /Secure/.test(c)));
    cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    csrf = decodeURIComponent(
      cookies
        .find((c) => c.startsWith("__Host-echo-csrf-user="))
        .split(";")[0]
        .split("=")[1],
    );
  }
  results.push({ label, status: response.status });
  return data;
}
try {
  assert.equal(
    (await request("registration mode", "/v1/registration")).mode,
    "closed",
  );
  await db.query("UPDATE echo.site_settings SET registration_mode='open'");
  const first = await request(
    "register",
    "/v1/accounts",
    "POST",
    registration,
    201,
  );
  assert.equal(
    (
      await request(
        "operation retry",
        "/v1/accounts",
        "POST",
        registration,
        201,
      )
    ).account.id,
    first.account.id,
  );
  const conflict = await request(
    "digest conflict",
    "/v1/accounts",
    "POST",
    { ...registration, username: username + "x" },
    409,
  );
  assert.equal(conflict.error.code, "OPERATION_CONFLICT");
  await request(
    "username unique",
    "/v1/accounts",
    "POST",
    { ...registration, operationId: randomUUID() },
    409,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM echo.users WHERE registration_id=$1",
        [registration.operationId],
      )
    ).rows[0].n,
    1,
  );
  const token = randomBytes(32).toString("base64url");
  const invitation = randomUUID();
  await db.query(
    "INSERT INTO echo.invitations(id,token_hash,max_uses,expires_at,created_by) VALUES($1,$2,1,now()+interval '1 hour',$3)",
    [
      invitation,
      createHash("sha256").update(token).digest("hex"),
      first.account.id,
    ],
  );
  await db.query("UPDATE echo.site_settings SET registration_mode='invite'");
  const invited = {
    operationId: randomUUID(),
    username: username + "i",
    password,
    invitation: token,
  };
  await request(
    "invite consume",
    "/v1/accounts",
    "POST",
    invited,
    201,
    "192.0.2.11",
  );
  await request(
    "invite retry",
    "/v1/accounts",
    "POST",
    invited,
    201,
    "192.0.2.11",
  );
  await request(
    "invite exhausted",
    "/v1/accounts",
    "POST",
    { ...invited, operationId: randomUUID(), username: username + "j" },
    403,
    "192.0.2.11",
  );
  assert.equal(
    (
      await db.query("SELECT uses FROM echo.invitations WHERE id=$1", [
        invitation,
      ])
    ).rows[0].uses,
    1,
  );
  await request("login", "/v1/sessions", "POST", {
    username,
    password,
    audience: "user",
  });
  const current = await request("session", "/v1/session");
  session = current.sessionId;
  assert.equal(current.account.id, first.account.id);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM echo.sessions WHERE id=$1",
        [session],
      )
    ).rows[0].n,
    1,
  );
  for (const path of [
    "overview",
    "users",
    "devices",
    "logins",
    "audit",
    "security",
    "growth",
    "invitations",
    "backups",
    "deletions",
    "storage",
    "trends",
  ]) {
    await request(
      `user denied admin ${path}`,
      `/v1/admin/${path}`,
      "GET",
      undefined,
      401,
    );
  }
  for (const [label, headers, expected, code] of [
    [
      "CSRF denied",
      {
        Origin: "https://localhost:8443",
        "X-Echo-CSRF": "invalid",
        "X-Echo-Session": session,
      },
      403,
      "CSRF_DENIED",
    ],
    [
      "origin denied",
      {
        Origin: "https://example.invalid",
        "X-Echo-CSRF": csrf,
        "X-Echo-Session": session,
      },
      403,
      "ORIGIN_DENIED",
    ],
    [
      "stale tab denied",
      {
        Origin: "https://localhost:8443",
        "X-Echo-CSRF": csrf,
        "X-Echo-Session": randomUUID(),
      },
      409,
      "SESSION_CHANGED",
    ],
  ]) {
    const response = await fetch("http://127.0.0.1:3001/v1/account/export", {
      method: "POST",
      headers: {
        ...headers,
        Cookie: cookie,
        "X-Forwarded-For": `192.0.2.${20 + results.length}`,
      },
    });
    // Each adversarial check uses a distinct synthetic source to preserve the export rate limit.
    assert.equal(response.status, expected, label);
    assert.equal((await response.json()).error.code, code);
    results.push({ label, status: response.status });
  }
  assert.match(current.account.publicId, /^[A-Z2-7]{12}$/);
  const lookup = await request(
    "public ID lookup",
    `/v1/accounts/lookup?publicId=${current.account.publicId.toLowerCase()}`,
  );
  assert.equal(lookup.id, current.account.id);
  assert.equal(lookup.publicId, current.account.publicId);
  const adminId = randomUUID();
  await db.query(
    "INSERT INTO echo.sessions(id,token_hash,user_id,audience,expires_at) VALUES($1,$2,$3,'admin',now()+interval '1 hour')",
    [
      adminId,
      createHash("sha256").update(randomBytes(32)).digest("hex"),
      first.account.id,
    ],
  );
  const userSessions = await request(
    "user audience isolation",
    "/v1/account/sessions",
  );
  assert(
    userSessions.items.every(
      (row) => row.audience === "user" && row.id !== adminId,
    ),
  );
  const deniedRevoke = await request(
    "user cannot revoke admin",
    "/v1/account/sessions/revoke",
    "POST",
    { sessionId: adminId },
  );
  assert.equal(deniedRevoke.revoked, 0);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM echo.sessions WHERE id=$1",
        [adminId],
      )
    ).rows[0].n,
    1,
  );
  await db.query("DELETE FROM echo.sessions WHERE id=$1", [adminId]);
  await request("reauthenticate", "/v1/sessions/reauthenticate", "POST", {
    password,
    audience: "user",
  });
  const renamed = await request("rename", "/v1/account/username", "PATCH", {
    username: username + "r",
    version: current.account.version,
  });
  assert.equal(renamed.account.username, username + "r");
  assert.equal(renamed.account.publicId, current.account.publicId);
  assert.equal(
    (
      await db.query("SELECT username FROM echo.users WHERE id=$1", [
        first.account.id,
      ])
    ).rows[0].username,
    username + "r",
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM echo.security_events WHERE user_id=$1 AND kind IN ('login-success','reauth-success')",
        [first.account.id],
      )
    ).rows[0].n,
    2,
  );
  await request(
    "logout",
    "/v1/sessions/current?audience=user",
    "DELETE",
    undefined,
    204,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM echo.sessions WHERE id=$1",
        [session],
      )
    ).rows[0].n,
    0,
  );
  await request("revoked session", "/v1/session", "GET", undefined, 401);
  await db.query("UPDATE echo.site_settings SET registration_mode='closed'");
  assert.equal(
    (await request("closed mode", "/v1/registration")).mode,
    "closed",
  );
  const closedId = randomUUID();
  await request(
    "closed rejection",
    "/v1/accounts",
    "POST",
    { operationId: closedId, username: username + "c", password },
    403,
    "192.0.2.12",
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM echo.users WHERE registration_id=$1",
        [closedId],
      )
    ).rows[0].n,
    0,
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      checks: results,
      invitationUses: 1,
      registrationRows: 1,
      sessionAfterLogout: 0,
      syntheticSources:
        "RFC 5737 addresses isolate rate-limit scenarios; rules unchanged",
    }),
  );
} finally {
  await db.query("UPDATE echo.site_settings SET registration_mode='closed'");
  await db.end();
}
