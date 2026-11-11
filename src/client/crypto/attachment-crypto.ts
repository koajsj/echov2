import { limits } from "../../shared/contracts";
export interface PreparedAttachment {
  ciphertext: ArrayBuffer;
  key: CryptoKey;
  iv: Uint8Array<ArrayBuffer>;
  name: string;
  mime: string;
  plaintextBytes: number;
}
// One whole-file WebCrypto AEAD call. No chunking, MLS or recovery protocol here.
// This in-memory object is sensitive: never send it to a JSON/API/logger or persist it.
export async function prepareAttachment(
  file: File,
): Promise<PreparedAttachment> {
  if (!isSecureContext || !crypto.subtle)
    throw new Error("附件加密需要安全上下文与 WebCrypto。");
  if (file.size < 1 || file.size > limits.attachmentBytes)
    throw new Error("附件大小必须为 1 byte 至 10 MiB。");
  if (file.name.length > 255 || file.type.length > 255)
    throw new Error("附件元数据超过允许长度。");
  const key = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = await file.arrayBuffer();
  try {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128,
      },
      key,
      plaintext,
    );
    return {
      ciphertext,
      key,
      iv,
      name: file.name,
      mime: file.type,
      plaintextBytes: file.size,
    };
  } finally {
    new Uint8Array(plaintext).fill(0);
  }
}
export async function openPreparedAttachment(
  attachment: PreparedAttachment,
): Promise<Blob> {
  if (
    attachment.ciphertext.byteLength !== attachment.plaintextBytes + 16 ||
    attachment.iv.byteLength !== 12
  )
    throw new Error("附件密文大小或 IV 无效。");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: attachment.iv,
      tagLength: 128,
    },
    attachment.key,
    attachment.ciphertext,
  );
  try {
    // Never execute an untrusted MIME as active browser content.
    return new Blob([plaintext], {
      type: "application/octet-stream",
    });
  } finally {
    new Uint8Array(plaintext).fill(0);
  }
}
export function discardPreparedAttachment(
  attachment: PreparedAttachment,
): void {
  new Uint8Array(attachment.ciphertext).fill(0);
  attachment.iv.fill(0);
  // JS/WASM/OS copies and CryptoKey destruction cannot be guaranteed by this overwrite.
}
