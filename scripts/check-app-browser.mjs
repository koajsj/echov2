// Full real-account UI check against the explicitly confirmed temporary Cloud DB.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { chromium } from "playwright";
if (
  process.env.CONFIRM_CLOUD_AUTH !== "echo_native" ||
  !process.env.PGHOST?.startsWith("/workspace/") ||
  process.env.PGPORT !== "55432"
)
  throw new Error("Disposable Cloud target required");
const db = new pg.Client({
  database: "echo_native",
  user: "echo_native_owner",
});
await db.connect();
const priorAdmin = (
  await db.query(
    "SELECT superadmin_user_id FROM echo.site_settings WHERE singleton",
  )
).rows[0].superadmin_user_id;
if (priorAdmin !== null) {
  await db.end();
  throw new Error("Requires disposable fixture with no assigned administrator");
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
});
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const errors = [];
const consoleErrors = [];
const screenshots = [];
const httpErrors = [];
page.on("response", (response) => {
  if (response.status() >= 400)
    httpErrors.push({
      path: new URL(response.url()).pathname,
      status: response.status(),
    });
});
await mkdir("docs/screenshots", { recursive: true });
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => !document.querySelector('[aria-busy="true"]'),
  );
  await page.screenshot({
    path: `docs/screenshots/${name}.png`,
    fullPage: true,
  });
  screenshots.push(name);
}
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (e) => errors.push(e.message));
const username = "browser_" + randomBytes(5).toString("hex");
const password = randomBytes(24).toString("base64url");
const archivePassword = randomBytes(24).toString("base64url");
try {
  await db.query("UPDATE echo.site_settings SET registration_mode='open'");
  await page.goto("https://localhost:8443/");
  await page.getByText("当前开放注册", { exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture("user-auth-desktop");
  await page.getByRole("button", { name: "创建新账号", exact: true }).click();
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page
    .getByText("注册已完成，请登录。登录不会自动建立设备信任。", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM echo.users WHERE username=$1",
        [username],
      )
    ).rows[0].n,
    1,
  );
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "登出", exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "你的交流空间", exact: true })
    .waitFor();
  await capture("user-conversations-desktop");
  await page.getByRole("link", { name: "设备", exact: true }).click();
  await page
    .getByRole("heading", { name: "设备与身份", exact: true })
    .waitFor();
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "重新认证", exact: true }).click();
  await page
    .getByText("已重新认证，敏感操作有效期五分钟。", { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("user-devices-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "数据与备份", exact: true }).click();
  await page.evaluate(() => {
    window.urlEvents = { created: [], revoked: [] };
    const c = URL.createObjectURL.bind(URL),
      r = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (b) => {
      const u = c(b);
      window.urlEvents.created.push(u);
      return u;
    };
    URL.revokeObjectURL = (u) => {
      window.urlEvents.revoked.push(u);
      r(u);
    };
  });
  const exportForm = page.locator("form").filter({
    has: page.getByRole("button", {
      name: "创建加密元数据文件",
      exact: true,
    }),
  });
  await exportForm
    .locator('input[name="archivePassword"]')
    .fill(archivePassword);
  await exportForm.locator('input[name="confirmation"]').fill(archivePassword);
  await page
    .getByRole("button", { name: "创建加密元数据文件", exact: true })
    .click();
  const downloadWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载加密元数据归档", exact: true })
    .click();
  const download = await downloadWait;
  assert.equal(download.suggestedFilename(), "echo-service-metadata.echo");
  const bytes = await readFile(await download.path());
  assert.equal(bytes.subarray(0, 8).toString(), "ECHOMD01");
  assert(!bytes.includes(Buffer.from(password)));
  const preview = page.locator("form").filter({
    has: page.getByRole("button", { name: "认证文件并预览", exact: true }),
  });
  await preview.locator('input[type="file"]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  await preview.locator('input[name="archivePassword"]').fill(archivePassword);
  await page
    .getByRole("button", { name: "认证文件并预览", exact: true })
    .click();
  await page
    .getByText(
      "文件认证、账号、来源与结构检查通过；仅本地预览，未恢复或更改任何状态。",
      { exact: true },
    )
    .waitFor();
  await page.waitForFunction(
    () => window.urlEvents.created.length === window.urlEvents.revoked.length,
  );
  assert.equal(await page.evaluate(() => window.urlEvents.created.length), 1);
  for (const label of [
    "联系人",
    "私人收藏",
    "密钥与恢复",
    "消息回收站",
    "设置",
    "隐私",
  ]) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === "main");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.equal(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    true,
  );
  await page.getByRole("button", { name: "登出", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "欢迎回来", exact: true }).waitFor();
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM echo.sessions s JOIN echo.users u ON u.id=s.user_id WHERE u.username=$1",
        [username],
      )
    ).rows[0].n,
    0,
  );
  // Explicit owner setup is confined to this disposable fixture, never production.
  const account = (
    await db.query("SELECT id FROM echo.users WHERE username=$1", [username])
  ).rows[0];
  await db.query(
    "UPDATE echo.site_settings SET superadmin_user_id=$1 WHERE singleton",
    [account.id],
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "独立管理员登录", exact: true }).click();
  await page
    .getByRole("heading", { name: "管理员登录", exact: true })
    .waitFor();
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "登出", exact: true }).waitFor();
  await page.getByRole("heading", { name: "管理概览", exact: true }).waitFor();
  await capture("admin-dashboard-desktop");
  await page.getByRole("link", { name: "用户管理", exact: true }).click();
  await page
    .getByRole("button", { name: "准备当前页 CSV", exact: true })
    .waitFor();
  await capture("admin-users-desktop");
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "准备当前页 CSV", exact: true })
    .click();
  for (let i = 0; i < 3; i++) {
    const waiting = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "下载已准备的 CSV 快照", exact: true })
      .click();
    const file = await waiting;
    assert.equal(file.suggestedFilename(), "echo-users-current-page.csv");
    const content = await readFile(await file.path());
    assert(content.toString().includes(username));
    assert(content.toString().includes('"id","username","status"'));
  }
  await page.waitForFunction(
    () =>
      window.urlEvents.created.length === 4 &&
      window.urlEvents.revoked.length === 4,
  );
  await page.getByRole("link", { name: "设备管理", exact: true }).click();
  await page.getByRole("heading", { name: "设备管理", exact: true }).waitFor();
  await capture("admin-devices-desktop");
  await page.getByRole("link", { name: "安全中心", exact: true }).click();
  await page.getByRole("heading", { name: "安全中心", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("admin-security-mobile");
  const tableRegion = page.getByRole("region", {
    name: "安全中心记录表，可横向滚动",
  });
  await tableRegion.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () => document.querySelector(".table-scroll").scrollLeft > 0,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.getByRole("button", { name: "登出", exact: true }).click();
  await page
    .getByRole("heading", { name: "管理员登录", exact: true })
    .waitFor();
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM echo.sessions WHERE user_id=$1",
        [account.id],
      )
    ).rows[0].n,
    0,
  );
  assert.deepEqual(errors, []);
  const unexpectedConsole = consoleErrors.filter(
    (message) =>
      !/^Failed to load resource: the server responded with a status of (401|403) \(\)$/.test(
        message,
      ),
  );
  const unexpectedHttp = httpErrors.filter(
    ({ path, status }) =>
      !(
        (path === "/v1/session" && status === 401) ||
        (path === "/v1/conversations" && status === 403)
      ),
  );
  assert.deepEqual(unexpectedConsole, []);
  assert.deepEqual(unexpectedHttp, []);
  console.log(
    JSON.stringify({
      status: "PASS",
      registration: "201 plus real row",
      login: "real session",
      reauth: "PASS",
      metadataArchive: "authenticated export, download, encrypted preview",
      csv: "real admin query, correct filename and contents, 3 repeated downloads",
      urlCreated: 4,
      urlRevoked: 4,
      logout: "keyboard plus database row removed",
      navigation: 9,
      mobile390: "no horizontal overflow",
      reducedMotion: "media preference applied",
      pageErrors: errors,
      consoleErrors,
      httpErrors,
      unexpectedConsole,
      unexpectedHttp,
      screenshots,
      limitations:
        "Chromium only; no iOS hardware, comprehensive accessibility audit or messaging E2E",
    }),
  );
} finally {
  await db.query(
    "UPDATE echo.site_settings SET registration_mode='closed',superadmin_user_id=$1",
    [priorAdmin],
  );
  await context.close();
  await browser.close();
  await db.end();
}
