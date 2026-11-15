// Imported by the dedicated Worker. A Worker does not protect keys from same-origin XSS.
import {
  bytesHex,
  hexBytes,
  rootText,
  credentialText,
  validateChallenge,
  publicKeyHex,
  signatureHex,
  identityUuid,
  sessionBindingText,
} from "../../shared/crypto-identity";
import type {
  IdentityChallenge,
  SignedRoot,
  RootStatement,
  AuthorizationRequest,
  SignedAuthorization,
  IdentitySnapshot,
  IdentitySessionChallenge,
} from "../../shared/crypto-identity";
export interface IdentityBinding {
  accountId: string;
  publicId: string;
  deviceId: string;
  origin: string;
}
interface StoredKey {
  pair: CryptoKeyPair;
  publicKey: string;
}
interface LocalIdentity {
  binding: IdentityBinding;
  device: StoredKey;
  root?: StoredKey;
  pin?: SignedRoot;
  authorization?: SignedAuthorization;
  bootstrap?: { root: SignedRoot; authorization: SignedAuthorization };
}
const databaseName = "echo-client-identities-v1";
const encoder = new TextEncoder();
function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error("IDENTITY_STORAGE_FAILED"));
  });
}
function done(t: IDBTransaction): Promise<void> {
  const completion = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onabort = () => reject(new Error("IDENTITY_STORAGE_ABORTED"));
    t.onerror = () => {};
  });
  void completion.catch(() => {});
  return completion;
}
async function database(): Promise<IDBDatabase> {
  const r = indexedDB.open(databaseName, 1);
  r.onupgradeneeded = () => r.result.createObjectStore("identities");
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new Error("IDENTITY_STORAGE_TIMEOUT"));
    }, 5000);
    r.onerror = () => {
      clearTimeout(timer);
      reject(new Error("IDENTITY_STORAGE_FAILED"));
    };
    // A blocked request can subsequently succeed; never retain that connection.
    r.onblocked = () => {
      expired = true;
      clearTimeout(timer);
      reject(new Error("IDENTITY_STORAGE_BLOCKED"));
    };
    r.onsuccess = () => {
      clearTimeout(timer);
      if (expired) {
        r.result.close();
        return;
      }
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
  });
}
async function load(
  db: IDBDatabase,
  id: string,
): Promise<LocalIdentity | undefined> {
  const t = db.transaction("identities", "readonly");
  const completion = done(t);
  const r = (await request(t.objectStore("identities").get(id))) as
    LocalIdentity | undefined;
  await completion;
  return r;
}
async function save(
  db: IDBDatabase,
  id: string,
  value: LocalIdentity,
): Promise<void> {
  const t = db.transaction("identities", "readwrite", { durability: "strict" });
  const completion = done(t);
  try {
    t.objectStore("identities").put(value, id);
    await completion;
  } catch (error) {
    try {
      t.abort();
    } catch {
      /* Already finished or aborted. */
    }
    await completion.catch(() => {});
    throw error;
  }
}
async function key(): Promise<StoredKey> {
  const pair = (await crypto.subtle.generateKey("Ed25519", false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return {
    pair,
    publicKey: bytesHex(await crypto.subtle.exportKey("raw", pair.publicKey)),
  };
}
async function sign(k: StoredKey, text: string): Promise<string> {
  return bytesHex(
    await crypto.subtle.sign(
      "Ed25519",
      k.pair.privateKey,
      encoder.encode(text),
    ),
  );
}
async function verifySignature(
  k: string,
  s: string,
  text: string,
): Promise<void> {
  if (!publicKeyHex.test(k) || !signatureHex.test(s))
    throw new Error("IDENTITY_SIGNATURE_INVALID");
  const pub = await crypto.subtle.importKey(
    "raw",
    hexBytes(k),
    "Ed25519",
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      "Ed25519",
      pub,
      hexBytes(s),
      encoder.encode(text),
    ))
  )
    throw new Error("IDENTITY_SIGNATURE_INVALID");
}
async function validateKey(k: StoredKey): Promise<void> {
  if (
    k.pair.privateKey.extractable ||
    k.pair.privateKey.type !== "private" ||
    k.pair.privateKey.algorithm.name !== "Ed25519"
  )
    throw new Error("IDENTITY_KEY_INVALID");
  if (
    bytesHex(await crypto.subtle.exportKey("raw", k.pair.publicKey)) !==
    k.publicKey
  )
    throw new Error("IDENTITY_KEY_INVALID");
  await verifySignature(
    k.publicKey,
    await sign(k, "echo/local-key-check/v1"),
    "echo/local-key-check/v1",
  );
}
function scope(b: IdentityBinding, c: IdentityChallenge): void {
  validateChallenge(c);
  if (
    c.origin !== b.origin ||
    c.accountId !== b.accountId ||
    c.publicId !== b.publicId
  )
    throw new Error("IDENTITY_SCOPE_MISMATCH");
}
function live(c: IdentityChallenge): void {
  if (
    Date.parse(c.issuedAt) > Date.now() + 30_000 ||
    Date.parse(c.expiresAt) <= Date.now()
  )
    throw new Error("IDENTITY_CHALLENGE_EXPIRED");
}
async function checkRoot(root: SignedRoot, b: IdentityBinding): Promise<void> {
  const r = root.statement;
  if (
    r.origin !== b.origin ||
    r.accountId !== b.accountId ||
    r.publicId !== b.publicId
  )
    throw new Error("IDENTITY_SCOPE_MISMATCH");
  await verifySignature(r.publicKey, root.signature, rootText(r));
}
async function checkAuthorization(
  a: SignedAuthorization,
  root: SignedRoot,
  b: IdentityBinding,
): Promise<void> {
  await checkRoot(root, b);
  scope(b, a.credential.challenge);
  if (
    a.credential.rootPublicKey !== root.statement.publicKey ||
    a.credential.rootVersion !== root.statement.version
  )
    throw new Error("ROOT_PIN_MISMATCH");
  const text = credentialText(a.credential);
  await verifySignature(
    a.credential.challenge.devicePublicKey,
    a.deviceSignature,
    text,
  );
  await verifySignature(root.statement.publicKey, a.rootSignature, text);
  if (Date.parse(a.credential.challenge.credentialExpiresAt) <= Date.now())
    throw new Error("CREDENTIAL_EXPIRED");
}
export type IdentityCommand =
  | { kind: "locate"; binding: Omit<IdentityBinding, "deviceId"> }
  | {
      kind: "bind-session";
      binding: IdentityBinding;
      challenge: IdentitySessionChallenge;
    }
  | { kind: "open"; binding: IdentityBinding }
  | {
      kind: "bootstrap";
      binding: IdentityBinding;
      challenge: IdentityChallenge;
    }
  | {
      kind: "request";
      binding: IdentityBinding;
      challenge: IdentityChallenge;
      root: SignedRoot;
      expectedRootKey: string;
    }
  | {
      kind: "authorize";
      binding: IdentityBinding;
      request: AuthorizationRequest;
      expectedFingerprint: string;
    }
  | { kind: "accept"; binding: IdentityBinding; snapshot: IdentitySnapshot };
export async function identityCommand(
  command: IdentityCommand,
): Promise<unknown> {
  if (command.kind === "locate") {
    const a = command.binding;
    if (
      a.origin !== location.origin ||
      !a.origin.startsWith("https://") ||
      !identityUuid.test(a.accountId) ||
      !/^[A-Z2-7]{12}$/.test(a.publicId)
    )
      throw new Error("IDENTITY_SCOPE_MISMATCH");
    return navigator.locks.request(`echo-identity:${a.accountId}`, async () => {
      const db = await database();
      try {
        const stored = await load(db, a.accountId);
        if (!stored) return null;
        if (
          stored.binding.origin !== a.origin ||
          stored.binding.publicId !== a.publicId ||
          stored.binding.accountId !== a.accountId
        )
          throw new Error("IDENTITY_SCOPE_MISMATCH");
        return { deviceId: stored.binding.deviceId };
      } finally {
        db.close();
      }
    });
  }
  const b = command.binding;
  if (
    b.origin !== location.origin ||
    !b.origin.startsWith("https://") ||
    !identityUuid.test(b.accountId) ||
    !identityUuid.test(b.deviceId) ||
    !/^[A-Z2-7]{12}$/.test(b.publicId)
  )
    throw new Error("IDENTITY_ORIGIN_MISMATCH");
  return navigator.locks.request(`echo-identity:${b.accountId}`, async () => {
    const db = await database();
    try {
      let stored = await load(db, b.accountId);
      if (
        stored &&
        (stored.binding.accountId !== b.accountId ||
          stored.binding.publicId !== b.publicId ||
          stored.binding.deviceId !== b.deviceId ||
          stored.binding.origin !== b.origin)
      )
        throw new Error("LOCAL_DEVICE_BINDING_MISMATCH");
      if (!stored) {
        stored = { binding: b, device: await key() };
        await save(db, b.accountId, stored);
      }
      await validateKey(stored.device);
      if (stored.root) await validateKey(stored.root);
      if (command.kind === "open")
        return {
          devicePublicKey: stored.device.publicKey,
          root: stored.pin ?? null,
          hasRootKey: !!stored.root,
          locallyVerified: !!stored.authorization,
          pendingInitialization: stored.bootstrap ?? null,
        };
      if (command.kind === "bind-session") {
        const c = command.challenge,
          text = sessionBindingText(c);
        if (
          c.origin !== b.origin ||
          c.accountId !== b.accountId ||
          c.publicId !== b.publicId ||
          c.deviceId !== b.deviceId ||
          Date.parse(c.expiresAt) <= Date.now() ||
          Date.parse(c.expiresAt) > Date.now() + 300_000
        )
          throw new Error("IDENTITY_SCOPE_MISMATCH");
        if (!stored.pin || !stored.authorization)
          throw new Error("DEVICE_AUTHORIZATION_UNAVAILABLE");
        await checkAuthorization(stored.authorization, stored.pin, b);
        return { challenge: c, signature: await sign(stored.device, text) };
      }
      if (command.kind === "bootstrap") {
        const c = command.challenge;
        scope(b, c);
        if (
          c.deviceId !== b.deviceId ||
          c.devicePublicKey !== stored.device.publicKey
        )
          throw new Error("DEVICE_KEY_MISMATCH");
        if (stored.bootstrap) {
          if (
            credentialText(stored.bootstrap.authorization.credential) !==
            credentialText({
              challenge: c,
              rootVersion: 1,
              rootPublicKey: stored.bootstrap.root.statement.publicKey,
            })
          )
            throw new Error("BOOTSTRAP_RECONCILIATION_REQUIRED");
          return stored.bootstrap;
        }
        live(c);
        if (stored.pin || stored.authorization)
          throw new Error("ROOT_ALREADY_PINNED");
        stored.root ??= await key();
        const statement: RootStatement = {
          origin: b.origin,
          accountId: b.accountId,
          publicId: b.publicId,
          version: 1,
          publicKey: stored.root.publicKey,
          deviceId: b.deviceId,
          challengeId: c.id,
        };
        const root = {
          statement,
          signature: await sign(stored.root, rootText(statement)),
        };
        const credential = {
          challenge: c,
          rootVersion: 1 as const,
          rootPublicKey: statement.publicKey,
        };
        const text = credentialText(credential);
        const authorization = {
          credential,
          deviceSignature: await sign(stored.device, text),
          rootSignature: await sign(stored.root, text),
        };
        stored.pin = root;
        stored.bootstrap = { root, authorization };
        await save(db, b.accountId, stored);
        return stored.bootstrap;
      }
      if (command.kind === "request") {
        const { challenge: c, root } = command;
        scope(b, c);
        live(c);
        await checkRoot(root, b);
        if (command.expectedRootKey !== root.statement.publicKey)
          throw new Error("ROOT_FINGERPRINT_MISMATCH");
        if (
          stored.pin &&
          rootText(stored.pin.statement) !== rootText(root.statement)
        )
          throw new Error("ROOT_PIN_MISMATCH");
        if (
          c.deviceId !== b.deviceId ||
          c.devicePublicKey !== stored.device.publicKey
        )
          throw new Error("DEVICE_KEY_MISMATCH");
        const credential = {
          challenge: c,
          rootVersion: 1 as const,
          rootPublicKey: root.statement.publicKey,
        };
        const text = credentialText(credential);
        const result = {
          credential,
          deviceSignature: await sign(stored.device, text),
        };
        stored.pin = root;
        await save(db, b.accountId, stored);
        return {
          request: result,
          fingerprint: bytesHex(
            await crypto.subtle.digest("SHA-256", encoder.encode(text)),
          ),
        };
      }
      if (command.kind === "authorize") {
        if (!stored.root || !stored.pin || !stored.authorization)
          throw new Error("ROOT_AUTHORITY_UNAVAILABLE");
        await checkAuthorization(stored.authorization, stored.pin, b);
        const r = command.request,
          c = r.credential.challenge;
        scope(b, c);
        live(c);
        if (r.credential.rootPublicKey !== stored.root.publicKey)
          throw new Error("ROOT_PIN_MISMATCH");
        const text = credentialText(r.credential);
        await verifySignature(c.devicePublicKey, r.deviceSignature, text);
        if (
          command.expectedFingerprint !==
          bytesHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)))
        )
          throw new Error("DEVICE_FINGERPRINT_MISMATCH");
        return { ...r, rootSignature: await sign(stored.root, text) };
      }
      const { snapshot } = command;
      if (
        !snapshot.root ||
        !stored.pin ||
        rootText(snapshot.root.statement) !== rootText(stored.pin.statement)
      )
        throw new Error("ROOT_PIN_MISMATCH");
      await checkRoot(snapshot.root, b);
      const a = snapshot.authorizations.find(
        (r) => r.authorization.credential.challenge.deviceId === b.deviceId,
      );
      if (!a || a.state !== "authorized") {
        delete stored.authorization;
        await save(db, b.accountId, stored);
        throw new Error("DEVICE_AUTHORIZATION_UNAVAILABLE");
      }
      await checkAuthorization(a.authorization, snapshot.root, b);
      if (
        a.authorization.credential.challenge.devicePublicKey !==
        stored.device.publicKey
      )
        throw new Error("DEVICE_KEY_MISMATCH");
      stored.authorization = a.authorization;
      await save(db, b.accountId, stored);
      return {
        state: "authorized",
        communication: "BLOCKED",
        rootPublicKey: stored.pin.statement.publicKey,
        hasRootKey: !!stored.root,
      };
    } finally {
      db.close();
    }
  });
}
