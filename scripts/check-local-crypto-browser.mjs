// Real browser storage/AEAD prerequisites, not application MLS persistence.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
});
const context = await browser.newContext();
try {
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  const namespace = "test-" + crypto.randomUUID();
  for (const page of pages) {
    await page.goto("http://127.0.0.1:5173/");
    await page.evaluate(async (namespace) => {
      window.storeModule =
        await import("/src/client/crypto/operation-store.ts");
      window.db = await window.storeModule.openOperationStore(namespace);
      // Opaque synthetic bytes test the storage boundary, not MLS state encryption.
      window.input = (id, expectedVersion) => ({
        id,
        group: "synthetic",
        expectedVersion,
        sealedState: new Uint8Array(64).fill(7).buffer,
        ciphertext: new Uint8Array([1, 2, 3]).buffer,
      });
    }, namespace);
  }
  const results = await Promise.allSettled(
    pages.map((page, i) =>
      page.evaluate(
        (i) =>
          window.storeModule.commitCryptoOperation(
            window.db,
            window.input("race-" + i, 0),
          ),
        i,
      ),
    ),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const winner = results.findIndex((x) => x.status === "fulfilled");
  await pages[0].reload();
  await pages[0].evaluate(async (namespace) => {
    window.storeModule = await import("/src/client/crypto/operation-store.ts");
    window.db = await window.storeModule.openOperationStore(namespace);
  }, namespace);
  const recovered = await pages[0].evaluate(async (id) => {
    const op = await window.storeModule.readCryptoOperation(window.db, id);
    const group = await window.storeModule.readCryptoGroup(
      window.db,
      "synthetic",
    );
    return {
      version: op.version,
      groupVersion: group.version,
      stateBytes: group.sealedState.byteLength,
      bytes: [...new Uint8Array(op.ciphertext)],
    };
  }, "race-" + winner);
  assert.deepEqual(recovered, {
    version: 1,
    groupVersion: 1,
    stateBytes: 64,
    bytes: [1, 2, 3],
  });
  await assert.rejects(
    pages[1].evaluate(
      (id) =>
        window.storeModule.commitCryptoOperation(
          window.db,
          window.input(id, 1),
        ),
      "race-" + winner,
    ),
  );
  const aborted = await pages[1].evaluate(async () => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function () {
      throw new DOMException("Synthetic quota failure", "QuotaExceededError");
    };
    let rejected = false;
    try {
      await window.storeModule.commitCryptoOperation(
        window.db,
        window.input("aborted", 1),
      );
    } catch {
      rejected = true;
    } finally {
      IDBObjectStore.prototype.add = add;
    }
    const missing = await window.storeModule.readCryptoOperation(
      window.db,
      "aborted",
    );
    const version = await window.storeModule.commitCryptoOperation(
      window.db,
      window.input("after-abort", 1),
    );
    return { rejected, missing: missing === undefined, version };
  });
  assert.deepEqual(aborted, { rejected: true, missing: true, version: 2 });
  const outbox = await pages[1].evaluate(async (winner) => {
    const store = window.storeModule;
    const receipt = {
      messageId: crypto.randomUUID(),
      seq: "42",
      routeVersion: "7",
      ciphertextSha256: [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", new Uint8Array([1, 2, 3])),
        ),
      ]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join(""),
    };
    const before = await store.pendingCryptoOperations(window.db, null, 1);
    let mismatch = false,
      conflict = false,
      rollback = false;
    try {
      await store.acknowledgeCryptoOperation(window.db, winner, {
        ...receipt,
        ciphertextSha256: "0".repeat(64),
      });
    } catch {
      mismatch = true;
    }
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function () {
      throw new DOMException("Injected I/O failure", "UnknownError");
    };
    try {
      await store.acknowledgeCryptoOperation(window.db, winner, receipt);
    } catch {
      rollback = true;
    } finally {
      IDBObjectStore.prototype.delete = remove;
    }
    const original = await store.readCryptoOperation(window.db, winner);
    const retained = await store.pendingCryptoOperations(window.db);
    await store.acknowledgeCryptoOperation(window.db, winner, receipt);
    await store.acknowledgeCryptoOperation(window.db, winner, receipt);
    try {
      await store.acknowledgeCryptoOperation(window.db, winner, {
        ...receipt,
        seq: "43",
      });
    } catch {
      conflict = true;
    }
    const remaining = await store.pendingCryptoOperations(window.db);
    return {
      paginated: before.ids.length === 1 && before.next !== null,
      mismatch,
      conflict,
      rollback,
      retained: retained.ids.includes(winner) && !original.receipt,
      pending: remaining.ids,
      groupVersion: (await store.readCryptoGroup(window.db, "synthetic"))
        .version,
    };
  }, "race-" + winner);
  assert.deepEqual(outbox, {
    paginated: true,
    mismatch: true,
    conflict: true,
    rollback: true,
    retained: true,
    pending: ["after-abort"],
    groupVersion: 2,
  });
  const workerRecovery = await pages[0].evaluate(async (namespace) => {
    const moduleUrl = new URL(
      "/src/client/crypto/operation-store.ts",
      location.origin,
    ).href;
    const source = `import * as store from ${JSON.stringify(moduleUrl)};
      const db = await store.openOperationStore(${JSON.stringify(namespace)});
      await store.commitCryptoOperation(db, {id:"worker-unknown",group:"synthetic",expectedVersion:2,sealedState:new Uint8Array(64).buffer,ciphertext:new Uint8Array([4,5,6]).buffer});
      postMessage("committed");`;
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    const worker = new Worker(url, { type: "module" });
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Worker timed out")),
          10000,
        );
        worker.onmessage = () => {
          clearTimeout(timeout);
          resolve();
        };
        worker.onerror = (e) => {
          clearTimeout(timeout);
          reject(new Error(e.message));
        };
      });
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
    // Discard the caller's result and reconcile only from the durable operation.
    const op = await window.storeModule.readCryptoOperation(
      window.db,
      "worker-unknown",
    );
    const pending = await window.storeModule.pendingCryptoOperations(window.db);
    return {
      version: op.version,
      bytes: [...new Uint8Array(op.ciphertext)],
      pending: pending.ids.includes(op.id),
    };
  }, namespace);
  assert.deepEqual(workerRecovery, {
    version: 3,
    bytes: [4, 5, 6],
    pending: true,
  });
  const upgrade = await pages[0].evaluate(async () => {
    const namespace = "upgrade-" + crypto.randomUUID();
    const name = "echo-crypto-" + namespace;
    const old = await new Promise((resolve, reject) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("groups");
        r.result.createObjectStore("operations");
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise((resolve, reject) => {
      const tx = old.transaction(["groups", "operations"], "readwrite");
      tx.objectStore("groups").put(
        { version: 1, sealedState: new Uint8Array(64).buffer },
        "old-group",
      );
      tx.objectStore("operations").add(
        {
          id: "old-operation",
          group: "old-group",
          expectedVersion: 0,
          version: 1,
          sealedState: new Uint8Array(64).buffer,
          ciphertext: new Uint8Array([9]).buffer,
        },
        "old-operation",
      );
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    let blocked = false;
    try {
      await window.storeModule.openOperationStore(namespace);
    } catch {
      blocked = true;
    }
    old.close();
    const upgraded = await window.storeModule.openOperationStore(namespace);
    const pending = await window.storeModule.pendingCryptoOperations(upgraded);
    const op = await window.storeModule.readCryptoOperation(
      upgraded,
      "old-operation",
    );
    const result = {
      blocked,
      version: upgraded.version,
      pending: pending.ids,
      bytes: [...new Uint8Array(op.ciphertext)],
    };
    upgraded.close();
    await new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = resolve;
      r.onerror = () => reject(r.error);
    });
    return result;
  });
  assert.deepEqual(upgrade, {
    blocked: true,
    version: 2,
    pending: ["old-operation"],
    bytes: [9],
  });
  const queuedDelete = await pages[0].evaluate(async () => {
    const namespace = "delete-wait-" + crypto.randomUUID();
    const name = "echo-crypto-" + namespace;
    const held = await window.storeModule.openOperationStore(namespace);
    held.onversionchange = null;
    const deleting = new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = resolve;
      r.onerror = () => reject(r.error);
    });
    let rejected = false;
    try {
      await window.storeModule.openOperationStore(namespace);
    } catch {
      rejected = true;
    }
    held.close();
    await deleting;
    const reopened = await window.storeModule.openOperationStore(namespace);
    const empty =
      (await window.storeModule.pendingCryptoOperations(reopened)).ids
        .length === 0;
    reopened.close();
    await new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = resolve;
      r.onerror = () => reject(r.error);
    });
    return { rejected, empty };
  });
  assert.deepEqual(queuedDelete, { rejected: true, empty: true });
  const aead = await pages[0].evaluate(async () => {
    const {
      prepareAttachment,
      openPreparedAttachment,
      discardPreparedAttachment,
    } = await import("/src/client/crypto/attachment-crypto.ts");
    const original = "synthetic attachment";
    const first = await prepareAttachment(
      new File([original], "synthetic.txt", { type: "text/plain" }),
    );
    const second = await prepareAttachment(
      new File([original], "synthetic.txt", { type: "text/plain" }),
    );
    const roundtrip = await (await openPreparedAttachment(first)).text();
    const unique =
      first.key !== second.key && first.iv.some((v, i) => v !== second.iv[i]);
    new Uint8Array(first.ciphertext)[0] ^= 1;
    let tamperRejected = false;
    try {
      await openPreparedAttachment(first);
    } catch {
      tamperRejected = true;
    }
    let oversizeRejected = false;
    try {
      await prepareAttachment(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.bin"),
      );
    } catch {
      oversizeRejected = true;
    }
    discardPreparedAttachment(first);
    discardPreparedAttachment(second);
    return { roundtrip, unique, tamperRejected, oversizeRejected };
  });
  assert.deepEqual(aead, {
    roundtrip: "synthetic attachment",
    unique: true,
    tamperRejected: true,
    oversizeRejected: true,
  });
  for (const page of pages) await page.evaluate(() => window.db.close());
  await pages[0].evaluate(
    (namespace) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.deleteDatabase("echo-crypto-" + namespace);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      }),
    namespace,
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      multiTabCAS: "one winner",
      reload: "state and ciphertext recovered together",
      duplicateOperation: "rejected",
      injectedQuotaFailure: "atomic rollback",
      outbox:
        "pagination, hash binding, idempotent receipt, conflicting receipt rejection, atomic acknowledgment rollback",
      queuedDelete: "open timeout rejects and late connection is closed",
      upgrade:
        "blocked upgrade rejects; v1 operation backfilled without regenerating ciphertext",
      workerRecovery:
        "committed bytes recovered after Worker termination with unknown caller result",
      attachmentAEAD:
        "roundtrip, independent key/IV, tamper and 10MiB boundary",
      limitations:
        "no physical disk exhaustion, OS crash or provider snapshot recovery; synthetic opaque state only",
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
