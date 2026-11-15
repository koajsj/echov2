// Versioned, domain-separated public statements. No private material crosses this contract.
export interface IdentityChallenge {
  id: string;
  origin: string;
  accountId: string;
  publicId: string;
  deviceId: string;
  devicePublicKey: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  credentialExpiresAt: string;
}
export interface RootStatement {
  origin: string;
  accountId: string;
  publicId: string;
  version: 1;
  publicKey: string;
  deviceId: string;
  challengeId: string;
}
export interface SignedRoot {
  statement: RootStatement;
  signature: string;
}
export interface DeviceCredential {
  challenge: IdentityChallenge;
  rootVersion: 1;
  rootPublicKey: string;
}
export interface AuthorizationRequest {
  credential: DeviceCredential;
  deviceSignature: string;
}
export interface SignedAuthorization extends AuthorizationRequest {
  rootSignature: string;
}
export interface IdentitySnapshot {
  root: SignedRoot | null;
  authorizations: {
    authorization: SignedAuthorization;
    state: "authorized" | "revoked" | "expired";
  }[];
  communication: "BLOCKED";
}
export const identityUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const publicKeyHex = /^[0-9a-f]{64}$/;
export const signatureHex = /^[0-9a-f]{128}$/;
function exact(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== keys.sort().join(",")
  )
    throw new Error("IDENTITY_INVALID_STATEMENT");
}
function text(value: unknown, pattern: RegExp): asserts value is string {
  if (typeof value !== "string" || !pattern.test(value))
    throw new Error("IDENTITY_INVALID_FIELD");
}
function origin(value: unknown): void {
  if (
    typeof value !== "string" ||
    !value.startsWith("https://") ||
    new URL(value).origin !== value
  )
    throw new Error("IDENTITY_INVALID_ORIGIN");
}
function timestamp(value: unknown): void {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error("IDENTITY_INVALID_TIME");
}
export function validateChallenge(
  value: unknown,
): asserts value is IdentityChallenge {
  exact(value, [
    "id",
    "origin",
    "accountId",
    "publicId",
    "deviceId",
    "devicePublicKey",
    "nonce",
    "issuedAt",
    "expiresAt",
    "credentialExpiresAt",
  ]);
  for (const k of ["id", "accountId", "deviceId"]) text(value[k], identityUuid);
  text(value.publicId, /^[A-Z2-7]{12}$/);
  text(value.devicePublicKey, publicKeyHex);
  text(value.nonce, publicKeyHex);
  origin(value.origin);
  for (const k of ["issuedAt", "expiresAt", "credentialExpiresAt"])
    timestamp(value[k]);
  const issued = Date.parse(value.issuedAt as string);
  if (
    Date.parse(value.expiresAt as string) - issued !== 300_000 ||
    Date.parse(value.credentialExpiresAt as string) - issued !== 30 * 86_400_000
  )
    throw new Error("IDENTITY_INVALID_LIFETIME");
}
export function rootText(value: RootStatement): string {
  exact(value, [
    "origin",
    "accountId",
    "publicId",
    "version",
    "publicKey",
    "deviceId",
    "challengeId",
  ]);
  origin(value.origin);
  text(value.accountId, identityUuid);
  text(value.deviceId, identityUuid);
  text(value.challengeId, identityUuid);
  text(value.publicId, /^[A-Z2-7]{12}$/);
  text(value.publicKey, publicKeyHex);
  if (value.version !== 1) throw new Error("ROOT_VERSION_UNSUPPORTED");
  return JSON.stringify([
    "echo/account-root/v1",
    value.origin,
    value.accountId,
    value.publicId,
    value.version,
    value.publicKey,
    value.deviceId,
    value.challengeId,
  ]);
}
export function credentialText(value: DeviceCredential): string {
  exact(value, ["challenge", "rootVersion", "rootPublicKey"]);
  validateChallenge(value.challenge);
  text(value.rootPublicKey, publicKeyHex);
  if (value.rootVersion !== 1) throw new Error("ROOT_VERSION_UNSUPPORTED");
  const c = value.challenge;
  return JSON.stringify([
    "echo/device-credential/v1",
    c.origin,
    c.accountId,
    c.publicId,
    value.rootVersion,
    value.rootPublicKey,
    c.deviceId,
    c.devicePublicKey,
    c.id,
    c.nonce,
    c.issuedAt,
    c.expiresAt,
    c.credentialExpiresAt,
  ]);
}
export function bytesHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function hexBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})+$/.test(value)) throw new Error("INVALID_HEX");
  return Uint8Array.from(value.match(/../g)!, (b) => parseInt(b, 16));
}

export interface IdentitySessionChallenge {
  id: string;
  origin: string;
  accountId: string;
  publicId: string;
  deviceId: string;
  sessionId: string;
  nonce: string;
  expiresAt: string;
}
export function sessionBindingText(c: IdentitySessionChallenge): string {
  exact(c, [
    "id",
    "origin",
    "accountId",
    "publicId",
    "deviceId",
    "sessionId",
    "nonce",
    "expiresAt",
  ]);
  for (const k of [c.id, c.accountId, c.deviceId, c.sessionId])
    text(k, identityUuid);
  origin(c.origin);
  text(c.publicId, /^[A-Z2-7]{12}$/);
  text(c.nonce, publicKeyHex);
  timestamp(c.expiresAt);
  return JSON.stringify([
    "echo/device-session-binding/v1",
    c.origin,
    c.accountId,
    c.publicId,
    c.deviceId,
    c.sessionId,
    c.id,
    c.nonce,
    c.expiresAt,
  ]);
}
