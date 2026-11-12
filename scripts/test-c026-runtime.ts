/** Actual Android SDK -> native outbox -> Docker HTTPS -> mobile browser -> native restore.
 * Uses only generated audio and the dedicated runtime-test.ts QA account. No user pairing. */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { connect } from "node:tls";
import { createHash, X509Certificate, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { MockDiaryGenerator } from "../packages/diary/src/probe-generator.ts";
import { qa, qaRequest } from "./runtime-qa-client.ts";

process.on("uncaughtException", (error) => {
  console.error(`${error.name}: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
});

const adb = resolve(".tools/android-sdk/platform-tools/adb");
const run = (args: string[], input?: Buffer | string) =>
  execFileSync(adb, ["-s", "emulator-5580", ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: 90000,
  });
const user = run(["shell", "am", "get-current-user"]).trim();
assert.match(user, /^\d+$/);
const prefix = ["shell", "run-as", "io.hmg.familydiary.probe", "--user", user];
const dir = "files/timeline-sync-qa";
const put = (name: string, data: Buffer | string) =>
  run([...prefix, "sh", "-c", `"cat > ${dir}/${name}"`], data);
const get = (name: string) =>
  JSON.parse(run([...prefix, "cat", `${dir}/${name}`]));
const test = (name: string) => {
  const output = run([
    "shell",
    "am",
    "instrument",
    "--user",
    user,
    "-w",
    "-e",
    "class",
    `io.hmg.familydiary.TimelineSyncDeviceTest#${name}`,
    "io.hmg.familydiary.probe.test/androidx.test.runner.AndroidJUnitRunner",
  ]);
  if (!/OK \(1 test\)/.test(output)) console.error(output); // Synthetic-only instrumentation output, no HTTP headers.
  assert.match(output, /OK \(1 test\)/, name);
  console.log("PASS native " + name);
};
const me = await qaRequest("/api/v1/me");
assert.equal(me.speech_timeline_version, 1);
const ca = await readFile(".tools/runtime/local-ca.crt"),
  url = new URL(qa.origin);
const leaf = await new Promise<Buffer>((resolve, reject) => {
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
      resolve(raw);
    },
  );
  socket.on("error", reject);
  socket.setTimeout(10000, () => socket.destroy(Error("TLS timeout")));
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
let id: string | undefined, device: string | undefined;
run(["emu", "avd", "hostmicoff"]);
run([...prefix, "rm", "-rf", dir]); // Exclusively this script's synthetic fixture.
run([...prefix, "mkdir", "-p", dir]);
try {
  put("sync-origin.txt", qa.origin);
  put("sync-ca.crt", ca);
  put("recording-name.txt", randomUUID() + ".wav");
  test("recognizeOriginal");
  const expected = get("expected.json"),
    input = get("input.json");
  const generated = await new MockDiaryGenerator().generate(input);
  const title = "합성 타임라인 실제 동기화";
  generated.draft.groups[0].label = title;
  const pairing = await qaRequest("/api/v1/pairings", "POST", {});
  put("fixture.json", JSON.stringify({ code: pairing.code, generated }));
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(15000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const w = window as any;
    const Original = w.Audio;
    w.Audio = function () {
      const audio = new Original();
      w.timelineQaAudio = audio;
      return audio;
    };
  });
  await page.goto(qa.origin + "/login");
  await page.getByLabel("이메일", { exact: true }).fill(qa.email);
  await page.getByLabel(/^비밀번호/).fill(qa.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/faithful/app.html#main");
  await expect(
    page.getByRole("button", { name: "검색", exact: true }),
  ).toBeVisible();
  const remoteSha = async (path: string) =>
    page.evaluate(async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw Error("QA fetch failed: " + response.status);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await response.arrayBuffer(),
      );
      return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }, path);
  for (const name of ["app.js", "app.css"]) {
    assert.equal(
      await remoteSha("/faithful/" + name),
      createHash("sha256")
        .update(await readFile("apps/web/public/faithful/" + name))
        .digest("hex"),
    );
  }
  try {
    test("completeAndAutoUpload");
  } finally {
    // Capture cleanup ownership even if an upload assertion fails after pairing.
    try {
      const result = get("result.json");
      id = result.id;
      device = result.device;
    } catch {}
  }
  assert.ok(id && device);
  await expect(page.getByText(title, { exact: true })).toBeVisible(); // No refresh: SSE updates already-open phone.
  const remote = await qaRequest(`/api/v1/sessions/${id}`);
  assert.equal(remote.audio_ready, true);
  assert.deepEqual(remote.snapshot.speech_timeline, expected.speech_timeline);
  assert.deepEqual(remote.snapshot.raw_history, expected.raw_history);
  assert.equal(remote.snapshot.text, expected.text);
  await page.goto(`${qa.origin}/faithful/app.html#transcript?id=${id}`);
  await expect(page.locator("button.timeline-segment")).toHaveCount(2);
  await expect(page.getByText(expected.text, { exact: true })).toHaveCount(0);
  const row = page.locator("button.timeline-segment").nth(1),
    start = expected.speech_timeline.segments[1].start_ms / 1000;
  await row.click();
  await expect(row).not.toHaveAttribute("aria-busy", "true");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).timelineQaAudio.currentTime),
    )
    .toBeGreaterThanOrEqual(start);
  expect(
    await page.evaluate(() => (window as any).timelineQaAudio.currentTime),
  ).toBeLessThan(start + 3);
  expect(
    await page.evaluate(() => (window as any).timelineQaAudio.paused),
  ).toBe(false);
  await expect(row).toHaveAttribute("aria-current", "true");
  assert.equal(
    await remoteSha(`/api/v1/sessions/${id}/audio`),
    expected.sha256,
  );
  await page.screenshot({
    path: "docs/evidence/connected-ui/c026-runtime-phone-timeline.png",
  });
  await page.goto(`${qa.origin}/faithful/app.html#detail?id=${id}`);
  const chooser = page.waitForEvent("filechooser");
  await page.locator(".photo-add").click();
  await (await chooser).setFiles(".tools/runtime/qa-photo.png");
  await expect(page.locator("[data-photo-status]")).toContainText(
    "사진을 추가했어요.",
  );
  test("receivePhotoAndColdRestore");
  const after = await qaRequest(`/api/v1/sessions/${id}`);
  assert.equal(after.photos.length, 1);
  assert.deepEqual(after.snapshot.speech_timeline, expected.speech_timeline);
  assert.deepEqual(errors, []);
  console.log(
    "PASS latest deployed assets/capability, actual STT timings, native auto-upload, open phone SSE, original seek+play/SHA, phone photo, vehicle delta and empty-store restore.",
  );
} finally {
  try {
    if (id) {
      try {
        const row = await qaRequest(`/api/v1/sessions/${id}`);
        await qaRequest(`/api/v1/sessions/${id}`, "DELETE", {
          expected_revision: row.revision,
        });
      } catch (error) {
        if (!String(error).match(/404|410/)) throw error;
      }
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
