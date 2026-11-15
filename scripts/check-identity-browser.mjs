// Actual Ed25519 Worker + IndexedDB + Fastify + least-privilege PostgreSQL, synthetic accounts only.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { chromium } from "playwright";
if (
  process.env.CONFIRM_CLOUD_AUTH !== "echo_native" ||
  !process.env.PGHOST?.startsWith("/workspace/") ||
  process.env.PGPORT !== "55432"
)
  throw new Error("Explicit disposable Cloud target required");
const owner = new pg.Client({
  database: "echo_native",
  user: "echo_native_owner",
});
const apiDb = new pg.Client({
  database: "echo_native",
  user: "echo_native_api",
});
await owner.connect();
await apiDb.connect();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
});
const contexts = [];
const results = [];
const prefix = "identity_" + randomBytes(4).toString("hex");
const password = randomBytes(24).toString("base64url");
const site = (
  await owner.query(
    "SELECT registration_mode FROM echo.site_settings WHERE singleton",
  )
).rows[0].registration_mode;
const origin = "https://localhost:8443";
async function page() {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      "X-Forwarded-For": "192.0.2." + (contexts.length + 40),
    },
  });
  contexts.push(context);
  const p = await context.newPage();
  await p.goto(origin + "/#login");
  await p.evaluate(async () => {
    window.api = (await import("/src/client/app/api.ts")).api;
    window.IdentityClient = (
      await import("/src/client/crypto/identity-client.ts")
    ).IdentityClient;
    window.client = new window.IdentityClient();
  });
  return p;
}
async function call(p, path, body) {
  return p.evaluate(
    async ({ path, body }) =>
      window.api(path, {
        ...(body ? { method: "POST", body } : {}),
        ...(window.session ? { sessionId: window.session.sessionId } : {}),
      }),
    { path, body },
  );
}
async function rejection(label, action) {
  await assert.rejects(action);
  results.push(label);
}
async function run(p, command) {
  return p.evaluate(
    (command) => window.client.run({ ...command, binding: window.binding }),
    command,
  );
}
async function session(p, name) {
  await call(p, "/v1/sessions", { username: name, password, audience: "user" });
  const s = await call(p, "/v1/session");
  await p.evaluate((s) => (window.session = s), s);
  return s;
}
async function device(p) {
  const r = await call(p, "/v1/devices", {
    label: "Synthetic independent browser",
  });
  const s = await call(p, "/v1/session");
  await p.evaluate((s) => {
    window.session = s;
    window.binding = {
      accountId: s.account.id,
      publicId: s.account.publicId,
      deviceId: s.deviceId,
      origin: location.origin,
    };
  }, s);
  assert.equal(r.status, "pending");
  return r.id;
}
async function challenge(p, operationId = randomUUID(), devicePublicKey) {
  const local = await run(p, { kind: "open" });
  return call(p, "/v1/crypto-identity/challenges", {
    operationId,
    devicePublicKey: devicePublicKey ?? local.devicePublicKey,
  });
}
async function recycle(p) {
  await p.evaluate(() => {
    window.client.close();
    window.client = new window.IdentityClient();
  });
}
try {
  await owner.query("UPDATE echo.site_settings SET registration_mode='open'");
  const a = await page(),
    b = await page(),
    stranger = await page();
  await call(a, "/v1/accounts", {
    operationId: randomUUID(),
    username: prefix,
    password,
  });
  await session(a, prefix);
  await session(b, prefix);
  const aid = await device(a),
    bid = await device(b);
  const c = await challenge(a);
  assert.deepEqual(await challenge(a, c.id), c);
  await rejection("challenge operation ID cannot replace bound key", () =>
    challenge(a, c.id, "ab".repeat(32)),
  );
  await rejection("registered device key immutable across operations", () =>
    challenge(a, randomUUID(), "ab".repeat(32)),
  );
  const signed = await run(a, { kind: "bootstrap", challenge: c });
  // Terminate/reopen before publication; exact signed request and nonextractable keys survive.
  await recycle(a);
  assert.deepEqual(await run(a, { kind: "bootstrap", challenge: c }), signed);
  results.push("worker restart preserves exact root initialization operation");
  const flipped = (s) => (s[0] === "0" ? "1" : "0") + s.slice(1);
  await rejection("tampered root self-signature refused", () =>
    call(a, "/v1/crypto-identity/initialize", {
      ...signed,
      root: { ...signed.root, signature: flipped(signed.root.signature) },
    }),
  );
  await rejection("tampered device possession signature refused", () =>
    call(a, "/v1/crypto-identity/initialize", {
      ...signed,
      authorization: {
        ...signed.authorization,
        deviceSignature: flipped(signed.authorization.deviceSignature),
      },
    }),
  );
  const concurrent = await Promise.all([
    call(a, "/v1/crypto-identity/initialize", signed),
    call(a, "/v1/crypto-identity/initialize", signed),
  ]);
  assert(
    concurrent.every(
      (r) => r.state === "authorized" && r.communication === "BLOCKED",
    ),
  );
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int AS n FROM echo.identity_roots WHERE user_id=$1",
        [c.accountId],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await owner.query(
        "SELECT consumed_at IS NOT NULL AS used FROM echo.identity_challenges WHERE id=$1",
        [c.id],
      )
    ).rows[0].used,
    true,
  );
  results.push(
    "concurrent root initialize has one root, one credential and consumed challenge",
  );
  let snapshot = await call(a, "/v1/crypto-identity");
  await run(a, { kind: "accept", snapshot });
  const root = snapshot.root;
  assert.equal(root.statement.publicKey, signed.root.statement.publicKey);
  const tampered = {
    ...snapshot,
    root: {
      ...root,
      statement: { ...root.statement, publicKey: "cd".repeat(32) },
    },
  };
  await rejection("pinned root substitution refused by Worker", () =>
    run(a, { kind: "accept", snapshot: tampered }),
  );
  const nonextractable = await a.evaluate(async (accountId) => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("echo-client-identities-v1", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const local = await new Promise((resolve, reject) => {
      const r = db
        .transaction("identities")
        .objectStore("identities")
        .get(accountId);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    let refused = 0;
    for (const k of [
      local.device.pair.privateKey,
      local.root.pair.privateKey,
    ]) {
      try {
        await crypto.subtle.exportKey("pkcs8", k);
      } catch {
        refused++;
      }
    }
    return {
      refused,
      rootExtractable: local.root.pair.privateKey.extractable,
      deviceExtractable: local.device.pair.privateKey.extractable,
    };
  }, c.accountId);
  assert.deepEqual(nonextractable, {
    refused: 2,
    rootExtractable: false,
    deviceExtractable: false,
  });
  results.push(
    "root and device private keys are persisted nonextractable CryptoKeys",
  );
  const bc = await challenge(b);
  await rejection(
    "new device rejects wrong independently supplied root key",
    () =>
      run(b, {
        kind: "request",
        challenge: bc,
        root,
        expectedRootKey: "ef".repeat(32),
      }),
  );
  const request = await run(b, {
    kind: "request",
    challenge: bc,
    root,
    expectedRootKey: root.statement.publicKey,
  });
  await rejection("authorizer rejects incorrect full request fingerprint", () =>
    run(a, {
      kind: "authorize",
      request: request.request,
      expectedFingerprint: "00".repeat(32),
    }),
  );
  await rejection("authorizer rejects substituted new-device key", () =>
    run(a, {
      kind: "authorize",
      request: {
        ...request.request,
        credential: {
          ...request.request.credential,
          challenge: { ...bc, devicePublicKey: "ab".repeat(32) },
        },
      },
      expectedFingerprint: request.fingerprint,
    }),
  );
  const authorization = await run(a, {
    kind: "authorize",
    request: request.request,
    expectedFingerprint: request.fingerprint,
  });
  await rejection("pending device cannot publish its own authorization", () =>
    call(b, "/v1/crypto-identity/authorize", { authorization }),
  );
  await rejection("server refuses altered root signature", () =>
    call(a, "/v1/crypto-identity/authorize", {
      authorization: {
        ...authorization,
        rootSignature: flipped(authorization.rootSignature),
      },
    }),
  );
  await rejection("server refuses changed credential key", () =>
    call(a, "/v1/crypto-identity/authorize", {
      authorization: {
        ...authorization,
        credential: {
          ...authorization.credential,
          challenge: { ...bc, devicePublicKey: "ab".repeat(32) },
        },
      },
    }),
  );
  // Inject a real SQL failure after authorization INSERT, before challenge consumption.
  await owner.query(`CREATE FUNCTION echo.synthetic_identity_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic identity transaction failure'; END; $$;
 CREATE TRIGGER synthetic_identity_abort BEFORE UPDATE ON echo.identity_challenges FOR EACH ROW EXECUTE FUNCTION echo.synthetic_identity_abort();`);
  try {
    await rejection("SQL failure prevents authorization acknowledgement", () =>
      call(a, "/v1/crypto-identity/authorize", { authorization }),
    );
    assert.equal(
      (
        await owner.query(
          "SELECT count(*)::int AS n FROM echo.identity_authorizations WHERE device_id=$1",
          [bid],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await owner.query(
          "SELECT consumed_at FROM echo.identity_challenges WHERE id=$1",
          [bc.id],
        )
      ).rows[0].consumed_at,
      null,
    );
  } finally {
    await owner.query(
      "DROP TRIGGER synthetic_identity_abort ON echo.identity_challenges; DROP FUNCTION echo.synthetic_identity_abort()",
    );
  }
  results.push("authorization and challenge consumption rollback atomically");
  assert.equal(
    (await call(a, "/v1/crypto-identity/authorize", { authorization })).state,
    "authorized",
  );
  // Discard original response to simulate an unknown HTTP outcome; reconcile exact request.
  assert.equal(
    (await call(a, "/v1/crypto-identity/authorize", { authorization })).state,
    "authorized",
  );
  await recycle(b);
  snapshot = await call(b, "/v1/crypto-identity");
  assert.equal(
    (await run(b, { kind: "accept", snapshot })).state,
    "authorized",
  );
  const localB = await run(b, { kind: "open" });
  assert.equal(localB.hasRootKey, false);
  assert.equal(localB.locallyVerified, true);
  results.push(
    "independent browser verifies authorization; root private key never shared",
  );
  const tab = await contexts[1].newPage();
  await tab.goto(origin + "/#devices");
  await tab.evaluate(
    async (binding) => {
      window.IdentityClient = (
        await import("/src/client/crypto/identity-client.ts")
      ).IdentityClient;
      window.client = new window.IdentityClient();
      window.binding = binding;
    },
    await b.evaluate(() => window.binding),
  );
  const simultaneous = await Promise.all([
    run(b, { kind: "open" }),
    run(tab, { kind: "open" }),
  ]);
  assert.equal(
    simultaneous[0].devicePublicKey,
    simultaneous[1].devicePublicKey,
  );
  assert.notEqual(
    localB.devicePublicKey,
    (await run(a, { kind: "open" })).devicePublicKey,
  );
  results.push(
    "two tabs load same persisted device; two contexts have distinct device keys",
  );
  await call(stranger, "/v1/accounts", {
    operationId: randomUUID(),
    username: prefix + "x",
    password,
  });
  await session(stranger, prefix + "x");
  await device(stranger);
  await rejection("cross-account authorization replay refused", () =>
    call(stranger, "/v1/crypto-identity/authorize", { authorization }),
  );
  // A fresh, unconsumed signed request expires while waiting for the account lock.
  const expired = await challenge(b);
  const expRequest = await run(b, {
    kind: "request",
    challenge: expired,
    root,
    expectedRootKey: root.statement.publicKey,
  });
  const expAuth = await run(a, {
    kind: "authorize",
    request: expRequest.request,
    expectedFingerprint: expRequest.fingerprint,
  });
  // Existing credential deliberately remains a different operation, so use a third same-account device.
  const third = await page();
  await session(third, prefix);
  const thirdId = await device(third);
  const tc = await challenge(third),
    tr = await run(third, {
      kind: "request",
      challenge: tc,
      root,
      expectedRootKey: root.statement.publicKey,
    });
  const ta = await run(a, {
    kind: "authorize",
    request: tr.request,
    expectedFingerprint: tr.fingerprint,
  });
  await owner.query(
    "UPDATE echo.identity_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [tc.id],
  );
  await rejection("expired challenge refused even with valid signatures", () =>
    call(a, "/v1/crypto-identity/authorize", { authorization: ta }),
  );
  await rejection(
    "consumed device cannot replace prior credential with another challenge",
    () => call(a, "/v1/crypto-identity/authorize", { authorization: expAuth }),
  );
  // No key packages, legacy credentials or active devices created by identity authorization.
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int AS n FROM echo.devices WHERE id=ANY($1::uuid[]) AND status<>'pending'",
        [[aid, bid, thirdId]],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int AS n FROM echo.device_credentials WHERE user_id=$1",
        [c.accountId],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await owner.query(
        "SELECT count(*)::int AS n FROM echo.key_packages WHERE device_id=ANY($1::uuid[])",
        [[aid, bid, thirdId]],
      )
    ).rows[0].n,
    0,
  );
  results.push(
    "identity authorization cannot activate MLS or release KeyPackages",
  );
  for (const sql of [
    "UPDATE echo.identity_roots SET public_key=public_key",
    "DELETE FROM echo.identity_roots",
    "UPDATE echo.identity_device_keys SET public_key=public_key",
    "UPDATE echo.identity_authorizations SET root_signature=root_signature",
    "SELECT private_key FROM echo.identity_roots",
    "SELECT echo.revoke_identity_authorization()",
  ])
    await rejection(
      "minimum database privilege denial: " +
        sql.split(" ").slice(0, 3).join(" "),
      () => apiDb.query(sql),
    );
  const revoke = await call(a, `/v1/devices/${bid}/revoke`, {});
  assert.equal(revoke.serviceAccessRevoked, true);
  assert.equal(
    (
      await owner.query(
        "SELECT revoked_at IS NOT NULL AS revoked FROM echo.identity_authorizations WHERE device_id=$1",
        [bid],
      )
    ).rows[0].revoked,
    true,
  );
  await rejection("revoked device session rejected", () =>
    call(b, "/v1/crypto-identity"),
  );
  const revoked = await call(a, "/v1/crypto-identity");
  await rejection("Worker rejects fresh server revoked credential", () =>
    run(b, { kind: "accept", snapshot: revoked }),
  );
  assert.equal((await run(b, { kind: "open" })).locallyVerified, false);
  await rejection("revoked credential cannot be reauthorized by retry", () =>
    call(a, "/v1/crypto-identity/authorize", { authorization }),
  );
  results.push(
    "service revocation withdraws public authorization, does not claim MLS Remove",
  );
  // Password login has no device binding; restore it only with current-session device proof.
  await a.evaluate(async () => {
    await window.api("/v1/sessions/current?audience=user", {
      method: "DELETE",
      sessionId: window.session.sessionId,
    });
    delete window.session;
  });
  const relogin = await session(a, prefix);
  assert.equal(relogin.deviceId, null);
  const located = await a.evaluate(
    (binding) => window.client.run({ kind: "locate", binding }),
    { accountId: c.accountId, publicId: c.publicId, origin },
  );
  assert.equal(located.deviceId, aid);
  const sc = await call(a, "/v1/crypto-identity/session-challenges", {
    operationId: randomUUID(),
    deviceId: aid,
  });
  const proof = await run(a, { kind: "bind-session", challenge: sc });
  await rejection("password alone cannot restore device session", () =>
    call(a, "/v1/crypto-identity/bind-session", {
      challenge: sc,
      signature: "00".repeat(64),
    }),
  );
  await rejection("session proof cannot be replayed into another session", () =>
    call(third, "/v1/crypto-identity/bind-session", proof),
  );
  assert.equal(
    (await call(a, "/v1/crypto-identity/bind-session", proof)).deviceId,
    aid,
  );
  assert.equal(
    (await call(a, "/v1/crypto-identity/bind-session", proof)).deviceId,
    aid,
  );
  assert.equal((await call(a, "/v1/session")).deviceId, aid);
  results.push(
    "relogin requires device signature over one-time current-session challenge",
  );
  // Verify the actual React page renders new controls and current API state.
  await a.goto(origin + "/#devices");
  await a.reload();
  await a
    .getByRole("heading", { name: "账户根身份与设备签名授权", exact: true })
    .waitFor();
  await a.getByRole("button", { name: "验证本机授权链", exact: true }).click();
  await a
    .getByText("本机密钥、固定根公钥与授权签名已核实。通信仍为 BLOCKED。", {
      exact: true,
    })
    .waitFor();
  results.push(
    "React device UI verifies the actual locally pinned authorization chain",
  );
  // Initialization and bilateral fingerprint authorization through actual product forms.
  const uiA = await page(),
    uiB = await page();
  const uiName = prefix + "ui";
  await call(uiA, "/v1/accounts", {
    operationId: randomUUID(),
    username: uiName,
    password,
  });
  await session(uiA, uiName);
  await session(uiB, uiName);
  async function registerInUi(p, label) {
    await p.goto(origin + "/#devices");
    await p.reload();
    await p.locator('input[name="label"]').fill(label);
    await p
      .getByRole("button", { name: "登记为待授权设备", exact: true })
      .click();
    await p
      .getByRole("button", { name: "登记为待授权设备", exact: true })
      .waitFor({ state: "hidden" });
  }
  await registerInUi(uiA, "Synthetic root browser");
  uiA.once("dialog", (dialog) => dialog.accept());
  await uiA
    .getByRole("button", { name: "初始化根身份与本机授权", exact: true })
    .click();
  await uiA
    .getByText("根身份与本机授权链已验证。加密通信仍未开放。", { exact: true })
    .waitFor();
  const trustedKey = await uiA
    .locator("p")
    .filter({ hasText: "本机已核实根公钥（供独立核对）：" })
    .locator("code")
    .textContent();
  await registerInUi(uiB, "Synthetic second browser");
  await uiB.locator('input[name="rootKey"]').fill(trustedKey);
  await uiB
    .getByRole("button", { name: "生成本机签名请求", exact: true })
    .click();
  const publicRequest = uiB.locator("textarea[readonly]");
  await publicRequest.waitFor();
  const uiRequest = await publicRequest.inputValue();
  const uiFingerprint = await uiB
    .locator("p")
    .filter({ hasText: /^本机请求指纹：$/ })
    .locator("+ code")
    .textContent();
  await uiA.locator('textarea[name="request"]').fill(uiRequest);
  await uiA.locator('input[name="fingerprint"]').fill(uiFingerprint);
  await uiA
    .getByRole("button", { name: "核对并签发设备授权", exact: true })
    .click();
  await uiA
    .getByText(
      "设备签名授权已登记。请在新设备点击验证本机授权链；加密通信仍未开放。",
      { exact: true },
    )
    .waitFor();
  await uiB
    .getByRole("button", { name: "验证本机授权链", exact: true })
    .click();
  await uiB
    .getByText("本机密钥、固定根公钥与授权签名已核实。通信仍为 BLOCKED。", {
      exact: true,
    })
    .waitFor();
  results.push(
    "product forms initialize root and authorize independent browser using bilateral full fingerprints",
  );
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        checks: results,
        contexts: contexts.length,
        privateKeysSentToServer: false,
        communication: "BLOCKED",
        sasQr: "NOT_RUN",
        rootRotationRecovery: "NOT_AVAILABLE",
        productMls: "BLOCKED",
      },
      null,
      2,
    ),
  );
} finally {
  await owner.query("UPDATE echo.site_settings SET registration_mode=$1", [
    site,
  ]);
  for (const context of contexts) await context.close();
  await browser.close();
  await apiDb.end();
  await owner.end();
}
