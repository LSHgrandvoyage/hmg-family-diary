import { connect } from "node:tls";
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { X509Certificate, createHash, randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
loadEnvFile(".env.runtime");
const fixture = JSON.parse(await readFile(".tools/runtime/qa.json", "utf8"));
const qa = { origin: process.env.APP_ORIGIN! };
import { qaRequest } from "./runtime-qa-client.ts";
const url = new URL(qa.origin);
const leaf = await new Promise<Buffer>((resolve, reject) => {
  // Verify the known CA with Node before allowing this exact leaf SPKI in the isolated browser.
  void readFile(".tools/runtime/local-ca.crt")
    .then((ca) => {
      const verified = connect(
        {
          host: url.hostname,
          port: Number(url.port),
          ca,
          rejectUnauthorized: true,
        },
        () => {
          const raw = verified.getPeerCertificate().raw;
          verified.end();
          resolve(raw);
        },
      );
      verified.on("error", reject);
    })
    .catch(reject);
});
const certificate = new X509Certificate(leaf);
const pin = createHash("sha256")
  .update(certificate.publicKey.export({ type: "spki", format: "der" }))
  .digest("base64");
// Trust only this local CA in the test browser. No product trust bypass or global ignoreHTTPSErrors.
// Launch a separate temporary profile; never attach to the user's Chrome session.
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [`--ignore-certificate-errors-spki-list=${pin}`],
});
await mkdir("docs/evidence/connected-ui", { recursive: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const id = randomUUID();
let device: any;
let created = false;
try {
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(qa.origin + "/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() => (window as any).DiaryTheme.set("dark"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(11, 13, 18)",
  );
  await expect(page.getByLabel("이메일", { exact: true })).toHaveCSS(
    "color",
    "rgb(242, 244, 248)",
  );
  await page.screenshot({
    path: "docs/evidence/connected-ui/c024-login-dark.png",
  });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() => (window as any).DiaryTheme.set("dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("이메일", { exact: true }).fill(fixture.email);
  await page.getByLabel(/^비밀번호/).fill(fixture.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/faithful/app.html#main");
  await expect(
    page.getByRole("button", { name: "검색", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "라이트 모드로 전환", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("button", { name: "다크 모드로 전환", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(
    page
      .locator("dialog[open]")
      .getByRole("button", { name: "닫기", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "검색 닫기", exact: true }).click();
  await page.getByRole("link", { name: "가족", exact: true }).click();
  await expect(
    page
      .locator("dialog[open]")
      .getByRole("button", { name: "화면 설정", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "가족 닫기", exact: true }).click();
  const pair = await qaRequest("/api/v1/pairings", "POST", {});
  device = await qaRequest("/api/v1/devices/claim", "POST", {
    code: pair.code,
    label: "자동 수신 모바일 합성 검사",
  });
  const headers = { cookie: "", authorization: `Bearer ${device.token}` };
  const snapshot = structuredClone(fixture.snapshot);
  const draft = JSON.parse(snapshot.draft);
  const title = "자동 동기화 합성 " + id.slice(0, 8);
  draft.groups[0].label = title;
  snapshot.draft = JSON.stringify(draft);
  await qaRequest(
    `/api/v1/sessions/${id}/snapshot`,
    "PUT",
    { expected_revision: 0, snapshot },
    { ...headers, "idempotency-key": randomUUID() },
  );
  created = true;
  // Existing open phone page, no navigation/reload or explicit sync click.
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText("원본 전송 대기", { exact: true })).toBeVisible();
  await qaRequest(
    `/api/v1/sessions/${id}/audio`,
    "PUT",
    await readFile(".tools/runtime/qa.wav"),
    headers,
  );
  await expect(page.getByText("원본 전송 대기", { exact: true })).toHaveCount(
    0,
  );
  await page.getByText(title, { exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const sha = await page.evaluate(async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw Error("original access failed");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await response.arrayBuffer(),
    );
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }, `/api/v1/sessions/${id}/audio`);
  expect(sha).toBe(snapshot.sha256);
  await page.screenshot({
    path: "docs/evidence/connected-ui/c023-mobile-auto.png",
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("[data-theme-toggle]")).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "PASS direct theme controls and theme preference through SSE; open phone web receives new diary and original completion via SSE without refresh; authenticated original bytes match native fixture SHA.",
  );
} finally {
  if (created) {
    const row = await qaRequest(`/api/v1/sessions/${id}`);
    await qaRequest(`/api/v1/sessions/${id}`, "DELETE", {
      expected_revision: row.revision,
    });
  }
  if (device?.id) await qaRequest(`/api/v1/devices/${device.id}`, "DELETE");
  await browser.close();
}
