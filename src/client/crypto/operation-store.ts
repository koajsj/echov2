// Storage prerequisite only. Not wired to sending until the MLS provider can
// produce a complete encrypted snapshot inside the same operation boundary.
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
  const opening = indexedDB.open(`echo-crypto-${namespace}`, 1);
  opening.onupgradeneeded = () => {
    opening.result.createObjectStore("groups");
    opening.result.createObjectStore("operations");
  };
  const db = await request(opening);
  db.onversionchange = () => db.close();
  return db;
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
    const transaction = db.transaction(["groups", "operations"], "readwrite", {
      durability: "strict",
    });
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
