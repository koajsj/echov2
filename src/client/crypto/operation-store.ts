// Storage prerequisite only. Not wired to sending until the MLS provider can
// produce a complete encrypted snapshot inside the same operation boundary.
import { uuidPattern } from "../../shared/validation";
export interface CryptoOperation {
  id: string;
  group: string;
  expectedVersion: number;
  sealedState: ArrayBuffer;
  ciphertext: ArrayBuffer;
}
interface GroupRecord {
  version: number;
  sealedState: ArrayBuffer;
}
interface OperationRecord extends CryptoOperation {
  version: number;
  receipt?: TransportReceipt;
}
// A transport receipt proves neither MLS validation nor decryption by recipients.
export interface TransportReceipt {
  messageId: string;
  seq: string;
  routeVersion: string;
  ciphertextSha256: string;
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error("本地存储请求失败"));
  });
}
export async function openOperationStore(
  namespace: string,
): Promise<IDBDatabase> {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(namespace))
    throw new Error("存储命名空间无效");
  if (!navigator.locks || typeof indexedDB === "undefined")
    throw new Error("浏览器缺少可靠的本地存储或单写者锁");
  const opening = indexedDB.open(`echo-crypto-${namespace}`, 3);
  return new Promise((resolve, reject) => {
    let refused = false;
    // An open queued behind a blocked delete receives no blocked event itself.
    const timer = setTimeout(() => {
      refused = true;
      reject(new Error("本地存储打开超时；请关闭旧连接后重试，禁止发送"));
    }, 10000);
    opening.onblocked = () => {
      refused = true;
      clearTimeout(timer);
      reject(new Error("本地存储被其他标签阻塞；请关闭旧连接后重试，禁止发送"));
    };
    opening.onupgradeneeded = () => {
      if (refused) {
        opening.transaction?.abort();
        return;
      }
      const db = opening.result;
      if (!db.objectStoreNames.contains("groups"))
        db.createObjectStore("groups");
      if (!db.objectStoreNames.contains("operations"))
        db.createObjectStore("operations");
      const needsOutbox = !db.objectStoreNames.contains("outbox");
      const outbox = needsOutbox ? db.createObjectStore("outbox") : null;
      const inbox = db.createObjectStore("inbox");
      inbox.createIndex("message", ["group", "messageId"], { unique: true });
      db.createObjectStore("cursors");
      // Upgrading never assumes an older operation was delivered. Retrying must
      // use its original ID and bytes, after reconciling the server's result.
      if (!outbox) return;
      const cursor = opening
        .transaction!.objectStore("operations")
        .openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        outbox.add(row.key, row.key);
        row.continue();
      };
    };
    opening.onerror = () => {
      clearTimeout(timer);
      reject(opening.error ?? new Error("无法打开本地密码学存储，禁止发送"));
    };
    opening.onsuccess = () => {
      clearTimeout(timer);
      const db = opening.result;
      if (refused) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
export async function commitCryptoOperation(
  db: IDBDatabase,
  input: CryptoOperation,
): Promise<number> {
  if (
    !input.id ||
    input.id.length > 128 ||
    !input.group ||
    input.group.length > 512 ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0 ||
    input.expectedVersion >= Number.MAX_SAFE_INTEGER ||
    input.sealedState.byteLength < 29 ||
    input.sealedState.byteLength > 8 * 1024 * 1024 ||
    input.ciphertext.byteLength < 1 ||
    input.ciphertext.byteLength > 360448
  )
    throw new Error("密码学操作输入无效");
  const operation = {
    ...input,
    sealedState: input.sealedState.slice(0),
    ciphertext: input.ciphertext.slice(0),
  };
  return navigator.locks.request(db.name, { mode: "exclusive" }, async () => {
    const transaction = db.transaction(
      ["groups", "operations", "outbox"],
      "readwrite",
      {
        durability: "strict",
      },
    );
    const finished = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("本地原子提交已中止，禁止发送"));
      transaction.onerror = () => {
        /* onabort owns the outcome; never turn a failed transaction into success. */
      };
    });
    // Attach rejection handling before awaiting any request to avoid an unhandled
    // rejection if quota failure aborts while a request is still being observed.
    void finished.catch(() => {});
    try {
      const operations = transaction.objectStore("operations");
      if (await request(operations.get(operation.id)))
        throw new Error(
          "操作 ID 已存在；必须读取原操作，不得重新推进密码学状态",
        );
      const groups = transaction.objectStore("groups");
      const prior = await request<GroupRecord | undefined>(
        groups.get(operation.group),
      );
      if ((prior?.version ?? 0) !== operation.expectedVersion)
        throw new Error("本地版本已变化；丢弃未提交的 provider 实例并重新加载");
      const version = operation.expectedVersion + 1;
      await request(
        groups.put(
          { version, sealedState: operation.sealedState },
          operation.group,
        ),
      );
      await request(
        operations.add(
          { ...operation, version } satisfies OperationRecord,
          operation.id,
        ),
      );
      await request(
        transaction.objectStore("outbox").add(operation.id, operation.id),
      );
      await finished;
      return version;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* Transaction may already be aborted. */
      }
      await finished.catch(() => {});
      throw error;
    }
  });
}

export async function pendingCryptoOperations(
  db: IDBDatabase,
  after: string | null = null,
  limit = 50,
): Promise<{ ids: string[]; next: string | null }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Outbox 分页大小无效");
  const ids = await request<IDBValidKey[]>(
    db
      .transaction("outbox", "readonly")
      .objectStore("outbox")
      .getAllKeys(
        after === null ? undefined : IDBKeyRange.lowerBound(after, true),
        limit + 1,
      ),
  );
  if (!ids.every((id) => typeof id === "string"))
    throw new Error("Outbox 损坏，禁止发送");
  return {
    ids: ids.slice(0, limit) as string[],
    next: ids.length > limit ? (ids[limit - 1] as string) : null,
  };
}

export async function acknowledgeCryptoOperation(
  db: IDBDatabase,
  id: string,
  receipt: TransportReceipt,
): Promise<void> {
  const validSequence = (v: string) =>
    /^(0|[1-9][0-9]{0,18})$/.test(v) && BigInt(v) <= 9223372036854775807n;
  if (
    !new RegExp(uuidPattern).test(receipt.messageId) ||
    !validSequence(receipt.seq) ||
    receipt.seq === "0" ||
    !validSequence(receipt.routeVersion) ||
    !/^[0-9a-f]{64}$/.test(receipt.ciphertextSha256)
  )
    throw new Error("发送确认格式无效");
  const confirmed = { ...receipt };
  await navigator.locks.request(db.name, { mode: "exclusive" }, async () => {
    const operation = await readCryptoOperation(db, id);
    if (!operation) throw new Error("找不到原操作；禁止重新加密");
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", operation.ciphertext),
    );
    const hash = Array.from(digest, (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== confirmed.ciphertextSha256)
      throw new Error("确认密文与原操作不一致");
    if (
      operation.receipt &&
      (operation.receipt.messageId !== confirmed.messageId ||
        operation.receipt.seq !== confirmed.seq ||
        operation.receipt.routeVersion !== confirmed.routeVersion ||
        operation.receipt.ciphertextSha256 !== confirmed.ciphertextSha256)
    )
      throw new Error("发送确认冲突；必须冻结并核实原操作");
    // Immutable operations are only written by commitCryptoOperation. All writes
    // share this Web Lock; no transaction is kept alive across WebCrypto awaits.
    const tx = db.transaction(["operations", "outbox"], "readwrite", {
      durability: "strict",
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error ?? new Error("发送确认未持久化；保留原操作"));
      tx.onerror = () => {};
      try {
        tx.objectStore("operations").put(
          { ...operation, receipt: confirmed },
          id,
        );
        tx.objectStore("outbox").delete(id);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  });
}
export async function readCryptoOperation(
  db: IDBDatabase,
  id: string,
): Promise<OperationRecord | undefined> {
  const transaction = db.transaction("operations", "readonly");
  return request<OperationRecord | undefined>(
    transaction.objectStore("operations").get(id),
  );
}

export async function readCryptoGroup(
  db: IDBDatabase,
  group: string,
): Promise<GroupRecord | undefined> {
  return request<GroupRecord | undefined>(
    db.transaction("groups", "readonly").objectStore("groups").get(group),
  );
}

// Storage prerequisite only: the caller must authenticate and process the MLS
// wire before supplying sealed state/event. This does not implement a Provider.
export interface IncomingCryptoOperation {
  group: string;
  expectedVersion: number;
  expectedCursor: string;
  seq: string;
  messageId: string;
  ciphertext: ArrayBuffer;
  sealedState: ArrayBuffer;
  sealedEvent: ArrayBuffer;
}
interface InboxRecord {
  group: string;
  seq: string;
  messageId: string;
  ciphertextSha256: string;
  version: number;
  sealedEvent: ArrayBuffer;
}
function validCursor(value: string): boolean {
  return (
    typeof value === "string" &&
    /^(0|[1-9][0-9]{0,18})$/.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}
export async function readCryptoCursor(
  db: IDBDatabase,
  group: string,
): Promise<string> {
  const cursor = await request<string | undefined>(
    db.transaction("cursors", "readonly").objectStore("cursors").get(group),
  );
  if (cursor !== undefined && !validCursor(cursor))
    throw new Error("本地游标损坏；禁止跳过消息");
  return cursor ?? "0";
}
export async function readCryptoInbox(
  db: IDBDatabase,
  group: string,
  seq: string,
): Promise<InboxRecord | undefined> {
  return request<InboxRecord | undefined>(
    db.transaction("inbox", "readonly").objectStore("inbox").get([group, seq]),
  );
}
export async function commitIncomingCryptoOperation(
  db: IDBDatabase,
  input: IncomingCryptoOperation,
): Promise<{ outcome: "committed" | "duplicate"; version: number }> {
  if (
    !input.group ||
    input.group.length > 512 ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0 ||
    input.expectedVersion >= Number.MAX_SAFE_INTEGER ||
    !validCursor(input.expectedCursor) ||
    !validCursor(input.seq) ||
    input.seq === "0" ||
    BigInt(input.seq) !== BigInt(input.expectedCursor) + 1n ||
    !new RegExp(uuidPattern).test(input.messageId) ||
    input.ciphertext.byteLength < 1 ||
    input.ciphertext.byteLength > 360448 ||
    input.sealedState.byteLength < 29 ||
    input.sealedState.byteLength > 8 * 1024 * 1024 ||
    input.sealedEvent.byteLength < 29 ||
    input.sealedEvent.byteLength > 1024 * 1024
  )
    throw new Error("收件操作无效；禁止跳过消息");
  const operation = {
    ...input,
    ciphertext: input.ciphertext.slice(0),
    sealedState: input.sealedState.slice(0),
    sealedEvent: input.sealedEvent.slice(0),
  };
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", operation.ciphertext),
  );
  const ciphertextSha256 = Array.from(digest, (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  return navigator.locks.request(db.name, { mode: "exclusive" }, async () => {
    const tx = db.transaction(["groups", "inbox", "cursors"], "readwrite", {
      durability: "strict",
    });
    const finished = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error ?? new Error("收件原子提交已中止；禁止确认游标"));
      tx.onerror = () => {};
    });
    void finished.catch(() => {});
    try {
      const inbox = tx.objectStore("inbox");
      const cursors = tx.objectStore("cursors");
      const cursor = await request<string | undefined>(
        cursors.get(operation.group),
      );
      if (cursor !== undefined && !validCursor(cursor))
        throw new Error("本地游标损坏；禁止确认收件");
      const groups = tx.objectStore("groups");
      const group = await request<GroupRecord | undefined>(
        groups.get(operation.group),
      );
      const prior = await request<InboxRecord | undefined>(
        inbox.get([operation.group, operation.seq]),
      );
      if (prior) {
        if (
          prior.group !== operation.group ||
          prior.seq !== operation.seq ||
          prior.messageId !== operation.messageId ||
          prior.ciphertextSha256 !== ciphertextSha256 ||
          !Number.isSafeInteger(prior.version) ||
          prior.version < 1 ||
          !group ||
          !Number.isSafeInteger(group.version) ||
          group.version < prior.version ||
          BigInt(cursor ?? "0") < BigInt(operation.seq)
        )
          throw new Error("同一序号收到不同消息；必须冻结并核实");
        await finished;
        return { outcome: "duplicate", version: prior.version };
      }
      if ((cursor ?? "0") !== operation.expectedCursor)
        throw new Error("游标已变化；重新加载，禁止跳过消息");
      if ((group?.version ?? 0) !== operation.expectedVersion)
        throw new Error("本地版本已变化；丢弃未提交的 provider 实例并重新加载");
      const version = operation.expectedVersion + 1;
      await request(
        groups.put(
          { version, sealedState: operation.sealedState },
          operation.group,
        ),
      );
      await request(
        inbox.add(
          {
            group: operation.group,
            seq: operation.seq,
            messageId: operation.messageId,
            ciphertextSha256,
            version,
            sealedEvent: operation.sealedEvent,
          } satisfies InboxRecord,
          [operation.group, operation.seq],
        ),
      );
      await request(cursors.put(operation.seq, operation.group));
      await finished;
      return { outcome: "committed", version };
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Transaction may already be aborted. */
      }
      await finished.catch(() => {});
      throw error;
    }
  });
}
