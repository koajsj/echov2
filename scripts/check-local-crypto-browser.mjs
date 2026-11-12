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
