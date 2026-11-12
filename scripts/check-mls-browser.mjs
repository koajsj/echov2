// Synthetic provider lab; never enables the application's crypto gate.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
});
const contexts = await Promise.all([
  browser.newContext(),
  browser.newContext(),
]);
try {
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  for (const page of pages) {
    await page.goto("http://127.0.0.1:5173/");
    await page.evaluate(async (bindingUrl) => {
      const wasm = await import(bindingUrl);
      await wasm.default();
      window.lab = wasm;
    }, "/crypto/mls-lab/pkg/echo_mls_lab.js");
  }
  const [a, b] = pages;
  await a.evaluate(() => {
    window.client = new window.lab.Client("synthetic-alice");
    window.client.create(new Uint8Array(16).fill(1));
  });
  const kp = await b.evaluate(() => {
    window.client = new window.lab.Client("synthetic-bob");
    return [...window.client.key_package()];
  });
  const welcome = await a.evaluate((kp) => {
    const add = window.client.add(new Uint8Array(kp));
    window.client.merge_pending();
    return [...add.welcome()];
  }, kp);
  await b.evaluate(
    (welcome) => window.client.join(new Uint8Array(welcome)),
    welcome,
  );
  assert.equal(await a.evaluate(() => Number(window.client.epoch())), 1);
  assert.equal(await b.evaluate(() => Number(window.client.epoch())), 1);
  const encrypted = await a.evaluate(() => [
    ...window.client.encrypt(
      new TextEncoder().encode("synthetic private message"),
    ),
  ]);
  const plain = await b.evaluate(
    (bytes) =>
      new TextDecoder().decode(
        window.client.process(new Uint8Array(bytes), true),
      ),
    encrypted,
  );
  assert.equal(plain, "synthetic private message");
  await assert.rejects(
    b.evaluate(
      (bytes) => window.client.process(new Uint8Array(bytes), true),
      encrypted,
    ),
  );
  const removed = await a.evaluate(() => {
    const commit = window.client.remove(1);
    return [...commit];
  });
  const corrupt = [...removed];
  corrupt[0] ^= 255;
  await assert.rejects(
    b.evaluate(
      (bytes) => window.client.process(new Uint8Array(bytes), true),
      corrupt,
    ),
  );
  assert.equal(await b.evaluate(() => Number(window.client.epoch())), 1);
  await b.evaluate(
    (bytes) => window.client.process(new Uint8Array(bytes), false),
    removed,
  );
  assert.equal(await b.evaluate(() => Number(window.client.epoch())), 1);
  await a.evaluate(() => window.client.discard_pending());
  assert.equal(await a.evaluate(() => Number(window.client.epoch())), 1);
  const finalCommit = await a.evaluate(() => {
    const bytes = window.client.remove(1);
    window.client.merge_pending();
    return [...bytes];
  });
  await b.evaluate(
    (bytes) => window.client.process(new Uint8Array(bytes), true),
    finalCommit,
  );
  assert.equal(await a.evaluate(() => Number(window.client.epoch())), 2);
  await assert.rejects(
    b.evaluate(() =>
      window.client.encrypt(new TextEncoder().encode("removed member")),
    ),
  );
  console.log(
    JSON.stringify({
      provider: "OpenMLS 0.9.2/RustCrypto 0.6.0",
      suite: 1,
      independentBrowserContexts: 2,
      KeyPackage: "PASS",
      Welcome: "PASS",
      Commit: "PASS",
      Application: "PASS",
      ReplayRejected: "PASS",
      InvalidCommitRejected: "PASS",
      DiscardPending: "PASS",
      DiscardReceivedStagedCommit: "PASS",
      Remove: "PASS",
      Epoch: "1->2",
      removedSenderRejected: true,
      scope:
        "provider laboratory only; no account binding or production persistence",
    }),
  );
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
}
