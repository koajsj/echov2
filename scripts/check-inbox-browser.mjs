// Real IndexedDB transactions; synthetic sealed bytes are NOT an MLS Provider.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
});
const context = await browser.newContext();
try {
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  const namespace = "inbox-" + crypto.randomUUID();
  for (const page of pages) {
    await page.goto("http://127.0.0.1:5173/");
    await page.evaluate(async (namespace) => {
      window.store = await import("/src/client/crypto/operation-store.ts");
      window.db = await window.store.openOperationStore(namespace);
      window.incoming = (
        group,
        expectedVersion,
        expectedCursor,
        seq,
        messageId,
      ) => ({
        group,
        expectedVersion,
        expectedCursor,
        seq,
        messageId,
        ciphertext: new Uint8Array([3, 4, 5]).buffer,
        sealedState: new Uint8Array(64).fill(8).buffer,
        sealedEvent: new Uint8Array(64).fill(9).buffer,
      });
    }, namespace);
  }
  const id = crypto.randomUUID();
  const first = await pages[0].evaluate(async (id) => {
    const input = window.incoming("inbox", 0, "0", "1", id);
    window.originalInput = input;
    return window.store.commitIncomingCryptoOperation(window.db, input);
  }, id);
  assert.deepEqual(first, { outcome: "committed", version: 1 });
  const rejectionCases = await pages[1].evaluate(async (id) => {
    const reject = async (input) => {
      try {
        await window.store.commitIncomingCryptoOperation(window.db, input);
        return false;
      } catch {
        return true;
      }
    };
    const same = window.incoming("inbox", 0, "0", "1", id);
    const duplicate = await window.store.commitIncomingCryptoOperation(
      window.db,
      same,
    );
    const conflict = await reject({
      ...same,
      ciphertext: new Uint8Array([6]).buffer,
    });
    const changedId = await reject({ ...same, messageId: crypto.randomUUID() });
    const gap = await reject(
      window.incoming("inbox", 1, "1", "3", crypto.randomUUID()),
    );
    const reuseId = await reject(window.incoming("inbox", 1, "1", "2", id));
    const stale = await reject(
      window.incoming("inbox", 0, "1", "2", crypto.randomUUID()),
    );
    const overflow = await reject(
      window.incoming(
        "inbox",
        1,
        "9223372036854775807",
        "9223372036854775808",
        crypto.randomUUID(),
      ),
    );
    return {
      duplicate,
      conflict,
      changedId,
      gap,
      reuseId,
      stale,
      overflow,
      cursor: await window.store.readCryptoCursor(window.db, "inbox"),
      version: (await window.store.readCryptoGroup(window.db, "inbox")).version,
    };
  }, id);
  assert.deepEqual(rejectionCases, {
    duplicate: { outcome: "duplicate", version: 1 },
    conflict: true,
    changedId: true,
    gap: true,
    reuseId: true,
    stale: true,
    overflow: true,
    cursor: "1",
    version: 1,
  });
  const damaged = await pages[0].evaluate(async (id) => {
    const setCursor = (value) =>
      new Promise((resolve, reject) => {
        const tx = window.db.transaction("cursors", "readwrite");
        tx.objectStore("cursors").put(value, "inbox");
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    const rejected = [];
    try {
      for (const cursor of ["0", "01", 1]) {
        await setCursor(cursor);
        try {
          await window.store.commitIncomingCryptoOperation(
            window.db,
            window.incoming("inbox", 0, "0", "1", id),
          );
          rejected.push(false);
        } catch {
          rejected.push(true);
        }
      }
    } finally {
      await setCursor("1");
    }
    return rejected;
  }, id);
  assert.deepEqual(damaged, [true, true, true]);
  const injected = await pages[0].evaluate(async () => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "cursors")
        throw new DOMException("Synthetic I/O failure", "UnknownError");
      return put.apply(this, args);
    };
    let rejected = false;
    try {
      await window.store.commitIncomingCryptoOperation(
        window.db,
        window.incoming("inbox", 1, "1", "2", crypto.randomUUID()),
      );
    } catch {
      rejected = true;
    } finally {
      IDBObjectStore.prototype.put = put;
    }
    return {
      rejected,
      cursor: await window.store.readCryptoCursor(window.db, "inbox"),
      version: (await window.store.readCryptoGroup(window.db, "inbox")).version,
      missing:
        (await window.store.readCryptoInbox(window.db, "inbox", "2")) ===
        undefined,
    };
  });
  assert.deepEqual(injected, {
    rejected: true,
    cursor: "1",
    version: 1,
    missing: true,
  });
  const raceId = crypto.randomUUID();
  const raced = await Promise.all(
    pages.map((page) =>
      page.evaluate(
        async (messageId) =>
          window.store.commitIncomingCryptoOperation(
            window.db,
            window.incoming("race", 0, "0", "1", messageId),
          ),
        raceId,
      ),
    ),
  );
  assert.equal(raced.filter((r) => r.outcome === "committed").length, 1);
  assert.equal(raced.filter((r) => r.outcome === "duplicate").length, 1);
  const sendReceiveRace = await Promise.allSettled([
    pages[0].evaluate(() =>
      window.store.commitIncomingCryptoOperation(
        window.db,
        window.incoming("mixed", 0, "0", "1", crypto.randomUUID()),
      ),
    ),
    pages[1].evaluate(() =>
      window.store.commitCryptoOperation(window.db, {
        id: "mixed-send",
        group: "mixed",
        expectedVersion: 0,
        ciphertext: new Uint8Array([1]).buffer,
        sealedState: new Uint8Array(64).buffer,
      }),
    ),
  ]);
  assert.equal(
    sendReceiveRace.filter((r) => r.status === "fulfilled").length,
    1,
  );
  const crash = await pages[0].evaluate(async (namespace) => {
    const code = `
      import * as store from ${JSON.stringify(new URL("/src/client/crypto/operation-store.ts", location.origin).href)};
      const db = await store.openOperationStore(${JSON.stringify(namespace)});
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) {
        if(this.name === 'cursors') { postMessage('before-cursor'); for(;;) {} }
        return put.apply(this,args);
      };
      await store.commitIncomingCryptoOperation(db, {
        group:'worker-abort', expectedVersion:0, expectedCursor:'0', seq:'1',
        messageId:crypto.randomUUID(), ciphertext:new Uint8Array([1]).buffer,
        sealedState:new Uint8Array(64).buffer, sealedEvent:new Uint8Array(64).buffer
      });
    `;
    const url = URL.createObjectURL(
      new Blob([code], { type: "text/javascript" }),
    );
    const worker = new Worker(url, { type: "module" });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Worker checkpoint timeout")),
          5000,
        );
        worker.onerror = (event) => {
          clearTimeout(timer);
          reject(new Error(event.message));
        };
        worker.onmessage = (event) => {
          if (event.data !== "before-cursor") return;
          clearTimeout(timer);
          worker.terminate();
          resolve();
        };
      });
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
    return {
      cursor: await window.store.readCryptoCursor(window.db, "worker-abort"),
      missingGroup:
        (await window.store.readCryptoGroup(window.db, "worker-abort")) ===
        undefined,
      missingInbox:
        (await window.store.readCryptoInbox(window.db, "worker-abort", "1")) ===
        undefined,
    };
  }, namespace);
  assert.deepEqual(crash, {
    cursor: "0",
    missingGroup: true,
    missingInbox: true,
  });
  await pages[0].reload();
  const recovered = await pages[0].evaluate(
    async ({ namespace, id }) => {
      const store = await import("/src/client/crypto/operation-store.ts");
      const db = await store.openOperationStore(namespace);
      const entry = await store.readCryptoInbox(db, "inbox", "1");
      const cursor = await store.readCryptoCursor(db, "inbox");
      const group = await store.readCryptoGroup(db, "inbox");
      const result = {
        id: entry.messageId,
        event: [...new Uint8Array(entry.sealedEvent)],
        cursor,
        version: group.version,
        state: [...new Uint8Array(group.sealedState)],
        matches: entry.messageId === id,
      };
      db.close();
      return result;
    },
    { namespace, id },
  );
  assert.deepEqual(recovered, {
    id,
    event: Array(64).fill(9),
    cursor: "1",
    version: 1,
    state: Array(64).fill(8),
    matches: true,
  });
  const upgrade = await pages[0].evaluate(async () => {
    const name = "upgrade-v2-" + crypto.randomUUID();
    const old = await new Promise((resolve, reject) => {
      const r = indexedDB.open("echo-crypto-" + name, 2);
      r.onupgradeneeded = () => {
        for (const table of ["groups", "operations", "outbox"])
          r.result.createObjectStore(table);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise((resolve, reject) => {
      const tx = old.transaction(["operations", "outbox"], "readwrite");
      tx.objectStore("operations").add(
        { id: "acked", receipt: { seq: "1" } },
        "acked",
      );
      tx.objectStore("operations").add(
        {
          id: "pending",
          group: "legacy-group",
          expectedVersion: 0,
          version: 1,
          sealedState: new Uint8Array(64).buffer,
          ciphertext: new Uint8Array([1]).buffer,
        },
        "pending",
      );
      tx.objectStore("outbox").add("pending", "pending");
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    old.close();
    const store = await import("/src/client/crypto/operation-store.ts");
    const db = await store.openOperationStore(name);
    const result = {
      version: db.version,
      pending: (await store.pendingCryptoOperations(db)).ids,
      cursor: await store.readCryptoCursor(db, "new-group"),
      ack: (await store.readCryptoOperation(db, "acked")).receipt.seq,
    };
    db.close();
    await new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase("echo-crypto-" + name);
      r.onsuccess = resolve;
      r.onerror = () => reject(r.error);
    });
    return result;
  });
  assert.deepEqual(upgrade, {
    version: 4,
    pending: ["pending"],
    cursor: "0",
    ack: "1",
  });
  await pages[1].evaluate(() => window.db.close());
  await pages[0].evaluate(
    (namespace) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.deleteDatabase("echo-crypto-" + namespace);
        r.onsuccess = resolve;
        r.onerror = () => reject(r.error);
      }),
    namespace,
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      realChromium: true,
      atomicInboxCursorState: "PASS",
      reload: "PASS",
      duplicate: "PASS",
      sequenceAndIdentityConflicts: "rejected without advancement",
      gapAndOverflow: "rejected",
      concurrentDuplicate: "one commit, one replay",
      sendReceiveCAS: "one winner",
      injectedFailure: "all three stores rolled back",
      workerTerminatedInsideTransaction: "all three stores rolled back",
      v2Migration: "pending and acknowledged state preserved",
      limitations:
        "Synthetic sealed bytes; no MLS Provider, network sync, tombstones, OS power loss or backup freshness proof.",
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
