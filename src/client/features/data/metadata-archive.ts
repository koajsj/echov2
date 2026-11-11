import type { MetadataExport } from "../../../shared/contracts";

// Local service-metadata file format; never MLS state, a credential or a recovery key.
const magic = new TextEncoder().encode("ECHOMD01");
const maxBytes = 1024 * 1024;
const iterations = 600000;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const sequence = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[1-9][0-9]{0,18}$/.test(v) &&
  BigInt(v) <= 9223372036854775807n;
const date = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v));
export function validateMetadata(
  value: unknown,
  accountId: string,
  origin: string,
): MetadataExport {
  if (
    !record(value) ||
    !keys(value, [
      "version",
      "scope",
      "origin",
      "issuedAt",
      "account",
      "devices",
      "deletions",
    ]) ||
    value.version !== 1 ||
    value.scope !== "service-metadata-only" ||
    value.origin !== origin ||
    !date(value.issuedAt)
  )
    throw new Error("归档版本、来源或范围不匹配。");
  const account = value.account;
  if (
    !record(account) ||
    !keys(account, ["id", "username", "version"]) ||
    !uuid(account.id) ||
    account.id !== accountId ||
    typeof account.username !== "string" ||
    !/^[a-zA-Z0-9_]{3,32}$/.test(account.username) ||
    !sequence(account.version)
  )
    throw new Error("归档账号不匹配或账号字段无效。");
  if (
    !Array.isArray(value.devices) ||
    value.devices.length > 5000 ||
    !Array.isArray(value.deletions) ||
    value.deletions.length > 5000
  )
    throw new Error("元数据集合超出允许范围。");
  const deviceIds = new Set<string>();
  for (const d of value.devices) {
    if (
      !record(d) ||
      !keys(d, ["id", "label", "status", "createdAt"]) ||
      !uuid(d.id) ||
      deviceIds.has(d.id) ||
      typeof d.label !== "string" ||
      d.label.length < 1 ||
      d.label.length > 160 ||
      typeof d.status !== "string" ||
      !["pending", "active", "revoked"].includes(d.status) ||
      !date(d.createdAt)
    )
      throw new Error("设备元数据无效或重复。");
    deviceIds.add(d.id);
  }
  const deletionIds = new Set<string>();
  const targets = new Set<string>();
  for (const d of value.deletions) {
    if (
      !record(d) ||
      !keys(d, ["id", "messageId", "reason", "state", "createdAt"]) ||
      !sequence(d.id) ||
      deletionIds.has(d.id) ||
      !uuid(d.messageId) ||
      targets.has(d.messageId) ||
      typeof d.reason !== "string" ||
      !["sender", "expiry", "account-close"].includes(d.reason) ||
      typeof d.state !== "string" ||
      !["pending-anchor", "anchored", "purging", "complete"].includes(
        d.state,
      ) ||
      !date(d.createdAt)
    )
      throw new Error("删除元数据无效或重复；不能据此恢复内容。");
    deletionIds.add(d.id);
    targets.add(d.messageId);
  }
  return value as unknown as MetadataExport;
}
async function key(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  if (!isSecureContext || !crypto.subtle)
    throw new Error("元数据归档需要安全上下文与 WebCrypto。");
  if (password.length < 12 || password.length > 256)
    throw new Error("归档口令需12–256个字符；它不应与登录密码相同。");
  const encoded = new TextEncoder().encode(password);
  try {
    const material = await crypto.subtle.importKey(
      "raw",
      encoded,
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    encoded.fill(0);
  }
}
export async function sealMetadata(
  data: MetadataExport,
  password: string,
): Promise<Blob> {
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  try {
    if (plaintext.byteLength > maxBytes)
      throw new Error("归档超过1 MiB，未生成截断文件。");
    const header = new Uint8Array(36);
    header.set(magic);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    header.set(salt, 8);
    header.set(iv, 24);
    const derived = await key(password, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: header, tagLength: 128 },
      derived,
      plaintext,
    );
    return new Blob([header, ciphertext], { type: "application/octet-stream" });
  } finally {
    plaintext.fill(0);
  }
}
export async function openMetadata(
  file: File,
  password: string,
  accountId: string,
  origin: string,
): Promise<MetadataExport> {
  if (file.size < 53 || file.size > maxBytes + 52)
    throw new Error("归档大小无效。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!magic.every((value, index) => bytes[index] === value))
    throw new Error("不支持的归档类型或版本。");
  const header = bytes.slice(0, 36);
  const derived = await key(password, header.slice(8, 24));
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: header.slice(24, 36),
        additionalData: header,
        tagLength: 128,
      },
      derived,
      bytes.slice(36),
    );
  } catch {
    throw new Error("口令错误或文件认证失败；未导入任何数据。");
  }
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
    );
    return validateMetadata(value, accountId, origin);
  } finally {
    new Uint8Array(plaintext).fill(0);
  }
}
