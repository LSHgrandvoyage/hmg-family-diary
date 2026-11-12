import { connect } from "node:tls";
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { X509Certificate, createHash } from "node:crypto";
import { loadEnvFile } from "node:process";
loadEnvFile(".env.runtime");
const fixture = JSON.parse(await readFile(".tools/runtime/qa.json", "utf8"));
const qa = { origin: process.env.APP_ORIGIN! };
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
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const names = [
    "connect",
    "main",
    "detail",
    "transcript",
    "carhome",
    "recording",
    "carlist",
    "cardetail",
  ];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    await page.setViewportSize(
      i < 4
        ? { width: 390, height: i === 2 ? 1240 : 844 }
        : { width: 1280, height: 720 },
    );
    await page.goto(qa.origin + "/faithful/app.html?reference=1#" + name);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `docs/evidence/connected-ui/refined-${name}.png`,
    });
    await expect(page.locator("#app>div")).toBeVisible();
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS eight source layouts with requested C015 removals, local fonts loaded, no page errors.",
  );
} finally {
  await browser.close();
}
