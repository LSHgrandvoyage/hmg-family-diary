import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { connect } from "node:tls";
import { X509Certificate, createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { qa, qaRequest } from "./runtime-qa-client.ts";
const adb = resolve(".tools/android-sdk/platform-tools/adb");
const serial = process.env.ANDROID_SERIAL || "emulator-5580";
const run = (args: string[], input?: Buffer | string) =>
  execFileSync(adb, ["-s", serial, ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: 90000,
  });
const user = run(["shell", "am", "get-current-user"]).trim();
assert.match(user, /^\d+$/);
const prefix = ["shell", "run-as", "io.hmg.familydiary.probe", "--user", user],
  dir = "files/name-sync-qa";
const put = (name: string, data: Buffer | string) =>
  run([...prefix, "sh", "-c", `"cat > ${dir}/${name}"`], data);
const get = (name: string) =>
  JSON.parse(run([...prefix, "cat", `${dir}/${name}`]));
const args = (name: string) => [
  "shell",
  "am",
  "instrument",
  "--user",
  user,
  "-w",
  "-e",
  "class",
  `io.hmg.familydiary.VehicleNameSyncDeviceTest#${name}`,
  "io.hmg.familydiary.probe.test/androidx.test.runner.AndroidJUnitRunner",
];
const check = (output: string, name: string) => {
  if (!/OK \(1 test\)/.test(output)) console.error(output);
  assert.match(output, /OK \(1 test\)/, name);
  console.log("PASS native " + name);
};
const test = (name: string) => check(run(args(name)), name);
const ca = await readFile(".tools/runtime/local-ca.crt");
const url = new URL(qa.origin);
const leaf = await new Promise<Buffer>((res, rej) => {
  const socket = connect(
    {
      host: url.hostname,
      port: Number(url.port),
      ca,
      rejectUnauthorized: true,
    },
    () => {
      const raw = socket.getPeerCertificate().raw;
      socket.end();
      res(raw);
    },
  );
  socket.on("error", rej);
  socket.setTimeout(10000, () => socket.destroy(Error("TLS connection timed out")));
});
const pin = createHash("sha256")
  .update(
    new X509Certificate(leaf).publicKey.export({ type: "spki", format: "der" }),
  )
  .digest("base64");
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio", `--ignore-certificate-errors-spki-list=${pin}`],
});
let device: string | undefined, id: string | undefined;
// This directory belongs only to this synthetic test.
run([...prefix, "rm", "-rf", dir]);
run([...prefix, "mkdir", "-p", dir]);
try {
  const existing = await qaRequest("/api/v1/devices");
  assert.ok(
    !existing.devices.some(
      (d: any) => !d.revoked_at && Date.parse(d.expires_at) > Date.now(),
    ),
    "dedicated QA account must have no active device",
  );
  const pairing = await qaRequest("/api/v1/pairings", "POST", {});
  put(
    "fixture.json",
    JSON.stringify({ code: pairing.code, filename: randomUUID() + ".wav" }),
  );
  put("sync-origin.txt", qa.origin);
  put("sync-ca.crt", ca);
  test("migrateOfflineAndReplayLatestNameWithoutRewritingHistory");
  const result = get("result.json");
  device = result.device;
  id = result.id;
  let record = await qaRequest(`/api/v1/sessions/${id}`);
  assert.equal(record.snapshot.context.vehicle.nickname, "과거 합성 차");
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15000);
  await page.goto(qa.origin + "/login");
  await page.getByLabel("이메일", { exact: true }).fill(qa.email);
  await page.getByLabel(/^비밀번호/).fill(qa.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/faithful/app.html#main");
  await page.getByRole("link", { name: "차량", exact: true }).click();
  await expect(page.getByText("합성 현재 차", { exact: true })).toBeVisible();
  const receiving = promisify(execFile)(
    adb,
    ["-s", serial, ...args("receivePhoneNameThroughEvents")],
    { encoding: "utf8", timeout: 60000, maxBuffer: 2 * 1024 * 1024 },
  );
  // Attach rejection handler immediately while waiting for the native SSE subscription.
  const finished = receiving.then(
    (r) => ({ output: r.stdout, error: null }),
    (error) => ({ output: "", error }),
  );
  await expect
    .poll(
      () => {
        try {
          return run([...prefix, "cat", `${dir}/ready.flag`]).trim();
        } catch {
          return "";
        }
      },
      { timeout: 20000 },
    )
    .toBe("ready");
  await page
    .getByRole("button", { name: "연결 차량 관리", exact: true })
    .click();
  await page.getByLabel("차 별명", { exact: true }).fill("휴대폰에서 바꾼 차");
  await page.getByRole("button", { name: "차 별명 저장", exact: true }).click();
  await expect(
    page.getByText("휴대폰에서 바꾼 차", { exact: true }),
  ).toBeVisible();
  const received = await finished;
  if (received.error) throw received.error;
  check(received.output, "receivePhoneNameThroughEvents");
  test("uploadNameWhilePhoneIsOpen");
  // No page reload: metadata-only SSE changes must refresh the open connection view.
  await expect(
    page.getByText("차량에서 바꾼 차", { exact: true }),
  ).toBeVisible();
  record = await qaRequest(`/api/v1/sessions/${id}`);
  assert.equal(record.snapshot.context.vehicle.nickname, "과거 합성 차");
  await page.screenshot({
    path: "docs/evidence/connected-ui/c031-phone-name.png",
  });
  console.log(
    "PASS HTTPS unified name migration, offline/restart replay, phone→native SSE, native→open phone SSE, historical vehicle name unchanged.",
  );
} finally {
  try {
    // Recover only this test's public ids if a native assertion failed after claiming.
    if (!device) {
      try {
        const s = get("cloud-sync.json");
        device = s.device;
        const links = s.links || {};
        id = Object.keys(links).find(
          (k) => links[k].file === get("fixture.json").filename,
        );
      } catch {}
    }
    if (id) {
      const row = await qaRequest(`/api/v1/sessions/${id}`);
      await qaRequest(`/api/v1/sessions/${id}`, "DELETE", {
        expected_revision: row.revision,
      });
    }
  } finally {
    try {
      if (device) await qaRequest(`/api/v1/devices/${device}`, "DELETE");
    } finally {
      await browser.close();
      run([...prefix, "rm", "-rf", dir]);
    }
  }
}
