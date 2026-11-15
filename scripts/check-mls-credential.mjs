import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { register } from "tsx/esm/api";
register();
globalThis.crypto ??= webcrypto;
const { bytesHex, credentialText, rootText } =
  await import("../src/shared/crypto-identity.ts");
const { MLS_SUITE, mlsAuthorizationText, verifyMlsCredential } =
  await import("../src/shared/mls-credential.ts");
const enc = new TextEncoder();
const makeKey = () =>
  crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]);
const pub = async (k) =>
  bytesHex(await crypto.subtle.exportKey("raw", k.publicKey));
const sign = async (k, text) =>
  bytesHex(await crypto.subtle.sign("Ed25519", k.privateKey, enc.encode(text)));
const [rootKey, deviceKey, mlsKey] = await Promise.all([
  makeKey(),
  makeKey(),
  makeKey(),
]);
const now = Date.now();
const iso = (n) => new Date(n).toISOString();
const rootPublicKey = await pub(rootKey),
  devicePublicKey = await pub(deviceKey),
  mlsPublicKey = await pub(mlsKey);
const origin = "https://example.com",
  accountId = "11111111-1111-4111-8111-111111111111",
  deviceId = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333",
  publicId = "ABCDEFGHIJKL";
const challenge = {
  id,
  origin,
  accountId,
  publicId,
  deviceId,
  devicePublicKey,
  nonce: "ab".repeat(32),
  issuedAt: iso(now - 1000),
  expiresAt: iso(now + 299000),
  credentialExpiresAt: iso(now - 1000 + 30 * 86400000),
};
const statement = {
  origin,
  accountId,
  publicId,
  version: 1,
  publicKey: rootPublicKey,
  deviceId,
  challengeId: id,
};
const root = { statement, signature: await sign(rootKey, rootText(statement)) };
const credential = { challenge, rootVersion: 1, rootPublicKey };
const device = {
  credential,
  deviceSignature: await sign(deviceKey, credentialText(credential)),
  rootSignature: await sign(rootKey, credentialText(credential)),
};
const authorization = {
  version: 1,
  origin,
  accountId,
  publicId,
  deviceId,
  rootVersion: 1,
  rootPublicKey,
  deviceCredentialId: id,
  mlsPublicKey,
  suite: MLS_SUITE,
  signatureAlgorithm: "Ed25519",
  purpose: "mls-signature",
  issuedAt: iso(now),
  expiresAt: iso(now + 60000),
};
const input = {
  root,
  trustedRootPublicKey: rootPublicKey,
  device,
  authorization,
  rootSignature: await sign(rootKey, mlsAuthorizationText(authorization)),
  leafSignatureKey: new Uint8Array(
    await crypto.subtle.exportKey("raw", mlsKey.publicKey),
  ),
  currentDeviceStatus: {
    state: "authorized",
    credentialId: id,
    validUntil: iso(now + 60000),
  },
};
await verifyMlsCredential(input);
const bad = [
  { ...input, trustedRootPublicKey: "00".repeat(32) },
  { ...input, root: { ...root, signature: "00".repeat(64) } },
  { ...input, device: { ...device, deviceSignature: "00".repeat(64) } },
  { ...input, device: { ...device, rootSignature: "00".repeat(64) } },
  { ...input, rootSignature: "00".repeat(64) },
  { ...input, leafSignatureKey: new Uint8Array(32) },
  { ...input, authorization: { ...authorization, deviceId: accountId } },
  { ...input, authorization: { ...authorization, suite: "other" } },
  {
    ...input,
    authorization: { ...authorization, signatureAlgorithm: "other" },
  },
  { ...input, authorization: { ...authorization, extra: 1 } },
  {
    ...input,
    authorization: { ...authorization, expiresAt: iso(now + 31 * 86400000) },
  },
  { ...input, currentDeviceStatus: null },
  {
    ...input,
    currentDeviceStatus: {
      ...input.currentDeviceStatus,
      validUntil: iso(now - 1),
    },
  },
  {
    ...input,
    currentDeviceStatus: { ...input.currentDeviceStatus, state: "revoked" },
  },
];
for (const dates of [
  { issuedAt: iso(now - 900), expiresAt: iso(now - 1) },
  { issuedAt: iso(now + 60000), expiresAt: iso(now + 120000) },
  { issuedAt: iso(now), expiresAt: iso(now + 31 * 86400000) },
]) {
  const altered = { ...authorization, ...dates };
  bad.push({
    ...input,
    authorization: altered,
    rootSignature: await sign(rootKey, mlsAuthorizationText(altered)),
  });
}
bad.push({
  ...input,
  currentDeviceStatus: {
    ...input.currentDeviceStatus,
    credentialId: accountId,
  },
});
for (const test of bad) await assert.rejects(verifyMlsCredential(test));
console.log(`PASS: real Ed25519 chain and ${bad.length} rejection cases`);
