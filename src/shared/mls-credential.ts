import {
  credentialText,
  hexBytes,
  identityUuid,
  publicKeyHex,
  rootText,
  signatureHex,
} from "./crypto-identity.js";
import type { SignedAuthorization, SignedRoot } from "./crypto-identity.js";

export const MLS_SUITE = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";
export interface MlsAuthorization {
  version: 1;
  origin: string;
  accountId: string;
  publicId: string;
  deviceId: string;
  rootVersion: 1;
  rootPublicKey: string;
  deviceCredentialId: string;
  mlsPublicKey: string;
  suite: typeof MLS_SUITE;
  signatureAlgorithm: "Ed25519";
  purpose: "mls-signature";
  issuedAt: string;
  expiresAt: string;
}

function exact(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== [...keys].sort().join(",")
  )
    throw new Error("MLS_INVALID_FIELDS");
}
function time(value: unknown): number {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error("MLS_INVALID_TIME");
  return Date.parse(value);
}
export function mlsAuthorizationText(a: MlsAuthorization): string {
  exact(a, [
    "version",
    "origin",
    "accountId",
    "publicId",
    "deviceId",
    "rootVersion",
    "rootPublicKey",
    "deviceCredentialId",
    "mlsPublicKey",
    "suite",
    "signatureAlgorithm",
    "purpose",
    "issuedAt",
    "expiresAt",
  ]);
  if (
    a.version !== 1 ||
    a.rootVersion !== 1 ||
    a.suite !== MLS_SUITE ||
    a.signatureAlgorithm !== "Ed25519" ||
    a.purpose !== "mls-signature" ||
    typeof a.origin !== "string" ||
    !a.origin.startsWith("https://") ||
    new URL(a.origin).origin !== a.origin ||
    !identityUuid.test(a.accountId) ||
    !identityUuid.test(a.deviceId) ||
    !identityUuid.test(a.deviceCredentialId) ||
    !/^[A-Z2-7]{12}$/.test(a.publicId) ||
    !publicKeyHex.test(a.rootPublicKey) ||
    !publicKeyHex.test(a.mlsPublicKey) ||
    time(a.issuedAt) >= time(a.expiresAt)
  )
    throw new Error("MLS_INVALID_AUTHORIZATION");
  return JSON.stringify([
    "echo/mls-signature-authorization/v1",
    a.version,
    a.origin,
    a.accountId,
    a.publicId,
    a.deviceId,
    a.rootVersion,
    a.rootPublicKey,
    a.deviceCredentialId,
    a.mlsPublicKey,
    a.suite,
    a.signatureAlgorithm,
    a.purpose,
    a.issuedAt,
    a.expiresAt,
  ]);
}
async function verify(
  key: string,
  signature: string,
  message: string,
): Promise<void> {
  if (!publicKeyHex.test(key) || !signatureHex.test(signature))
    throw new Error("MLS_INVALID_SIGNATURE");
  const publicKey = await crypto.subtle.importKey(
    "raw",
    hexBytes(key),
    "Ed25519",
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      "Ed25519",
      publicKey,
      hexBytes(signature),
      new TextEncoder().encode(message),
    ))
  )
    throw new Error("MLS_INVALID_SIGNATURE");
}

/** The caller must independently authenticate the current device status and freshness.
 * This module does not fetch or establish revocation status. */
export async function verifyMlsCredential(input: {
  root: SignedRoot;
  trustedRootPublicKey: string;
  device: SignedAuthorization;
  authorization: MlsAuthorization;
  rootSignature: string;
  leafSignatureKey: Uint8Array;
  currentDeviceStatus: {
    state: "authorized";
    credentialId: string;
    validUntil: string;
  } | null;
}): Promise<void> {
  // Keep the binding checks and asynchronous signature checks on one snapshot.
  const snapshot = structuredClone(input);
  const {
    root,
    device,
    authorization: a,
    currentDeviceStatus: status,
  } = snapshot;
  exact(root, ["statement", "signature"]);
  exact(device, ["credential", "deviceSignature", "rootSignature"]);
  const rootMessage = rootText(root.statement);
  const deviceMessage = credentialText(device.credential);
  const mlsMessage = mlsAuthorizationText(a);
  const r = root.statement,
    c = device.credential.challenge;
  if (
    !publicKeyHex.test(snapshot.trustedRootPublicKey) ||
    r.publicKey !== snapshot.trustedRootPublicKey ||
    device.credential.rootPublicKey !== r.publicKey ||
    device.credential.rootVersion !== r.version ||
    c.origin !== r.origin ||
    c.accountId !== r.accountId ||
    c.publicId !== r.publicId ||
    a.origin !== c.origin ||
    a.accountId !== c.accountId ||
    a.publicId !== c.publicId ||
    a.deviceId !== c.deviceId ||
    a.deviceCredentialId !== c.id ||
    a.rootPublicKey !== r.publicKey ||
    a.rootVersion !== r.version ||
    !(snapshot.leafSignatureKey instanceof Uint8Array) ||
    snapshot.leafSignatureKey.length !== 32 ||
    a.mlsPublicKey !==
      Array.from(snapshot.leafSignatureKey, (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("")
  )
    throw new Error("MLS_BINDING_MISMATCH");
  const now = Date.now();
  if (
    time(a.issuedAt) < time(c.issuedAt) ||
    time(a.issuedAt) > now ||
    time(a.expiresAt) > time(c.credentialExpiresAt) ||
    time(a.expiresAt) <= now
  )
    throw new Error("MLS_AUTHORIZATION_EXPIRED");
  if (!status) throw new Error("MLS_STATUS_UNAVAILABLE");
  exact(status, ["state", "credentialId", "validUntil"]);
  if (
    status.state !== "authorized" ||
    status.credentialId !== c.id ||
    time(status.validUntil) <= now
  )
    throw new Error("MLS_STATUS_UNAVAILABLE");
  await verify(r.publicKey, root.signature, rootMessage);
  await verify(c.devicePublicKey, device.deviceSignature, deviceMessage);
  await verify(r.publicKey, device.rootSignature, deviceMessage);
  await verify(r.publicKey, snapshot.rootSignature, mlsMessage);
  if (time(a.expiresAt) <= Date.now() || time(status.validUntil) <= Date.now())
    throw new Error("MLS_AUTHORIZATION_EXPIRED");
}
