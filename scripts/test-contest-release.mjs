// Dedicated team stack + installed signed contestRelease/test APK. Host microphone disabled.
// Use fresh contest app data and apply public server settings in the vehicle UI before each run.
// Each run creates a different synthetic family; never reuse its previous vault-bound records.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { request as httpsRequest } from "node:https";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const env = parseEnv(readFileSync(".env.team", "utf8"));
assert.equal(new URL(env.APP_ORIGIN).port, "18443");
const origin = env.APP_ORIGIN,
  ca = readFileSync(".tools/team/local-ca.crt");
const compose = [
  "compose",
  "--env-file",
  ".env.team",
  "-f",
  "compose.team.yaml",
  "-p",
  "hmg-family-diary-team",
];
let cookie = "";
async function req(path, method = "GET", body, extra = {}) {
  const data =
    body === undefined
      ? undefined
      : Buffer.isBuffer(body)
        ? body
        : Buffer.from(JSON.stringify(body));
  return new Promise((ok, no) => {
    const r = httpsRequest(
      new URL(path, origin),
      {
        method,
        ca,
        agent: false,
        timeout: 10000,
        headers: {
          origin,
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
          ...extra,
          ...(data ? { "content-length": String(data.length) } : {}),
        },
      },
      (res) => {
        const parts = [];
        res.on("data", (b) => parts.push(b));
        res.on("end", () => {
          if (res.headers["set-cookie"])
            cookie = res.headers["set-cookie"]
              .map((c) => c.split(";")[0])
              .join("; ");
          const bytes = Buffer.concat(parts);
          ok({
            status: res.statusCode,
            bytes,
            json: () => JSON.parse(bytes.toString()),
          });
        });
      },
    );
    r.on("error", no);
    r.on("timeout", () => r.destroy(Error("team HTTPS timeout")));
    if (data) r.write(data);
    r.end();
  });
}
const email = `team-qa-${randomUUID()}@synthetic.test`,
  password = randomBytes(20).toString("hex");
assert.equal(
  (
    await req("/api/auth/sign-up/email", "POST", {
      email,
      password,
      name: "합성 팀 환경 검증",
      callbackURL: "/login",
    })
  ).status,
  200,
);
assert.equal(
  (await req("/api/auth/sign-in/email", "POST", { email, password })).status,
  403,
);
let link;
for (let i = 0; i < 20 && !link; i++) {
  const all = await (
    await fetch("http://127.0.0.1:18025/api/v1/messages")
  ).json();
  for (const msg of all.messages || [])
    if (msg.To?.some((x) => x.Address === email)) {
      const full = await (
        await fetch(`http://127.0.0.1:18025/api/v1/message/${msg.ID}`)
      ).json();
      link = full.Text.match(/https:\/\/[^\s]+/g)?.find((x) =>
        x.includes("verify-email"),
      );
    }
  if (!link) await new Promise((r) => setTimeout(r, 200));
}
assert.ok(link, "synthetic verification email");
assert.equal(new URL(link).origin, origin);
assert.ok([200, 302].includes((await req(link)).status));
assert.equal(
  (await req("/api/auth/sign-in/email", "POST", { email, password })).status,
  200,
);
const ownerCookie = cookie;
const pairing = (await req("/api/v1/pairings", "POST", {})).json();

const adb = new URL("../.tools/android-sdk/platform-tools/adb", import.meta.url)
  .pathname;
const serial = process.env.ANDROID_SERIAL || "emulator-5580";
const run = (args) =>
  execFileSync(adb, ["-s", serial, ...args], {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
const user = run(["shell", "am", "get-current-user"]).trim();
assert.match(user, /^\d+$/);
try {
  let refused = false;
  try {
    run([
      "shell",
      "run-as",
      "io.hmg.familydiary.contest",
      "--user",
      user,
      "id",
    ]);
  } catch {
    refused = true;
  }
  assert.ok(refused, "release must refuse run-as");
  const output = run([
    "shell",
    "am",
    "instrument",
    "--user",
    user,
    "-w",
    "-e",
    "class",
    "io.hmg.familydiary.ContestReleaseDeviceTest",
    "-e",
    "pairCode",
    pairing.code,
    "io.hmg.familydiary.contest.test/androidx.test.runner.AndroidJUnitRunner",
  ]);
  mkdirSync(".tools/contest", { recursive: true });
  writeFileSync(".tools/contest/instrumentation.txt", output);
  assert.match(output, /OK \(2 tests\)/, output);
  const marker = output.match(/C035_RESULT=(.+)/);
  assert.ok(marker, "native result");
  const result = JSON.parse(marker[1]);
  const list = await req("/api/v1/sessions");
  assert.equal(list.status, 200);
  const items = list.json().items;
  assert.ok(items.length >= 2);
  const row = items.find((x) => x.snapshot?.sha256 === result.sha256);
  assert.ok(row, "actual SDK fixture uploaded automatically");
  assert.equal(row.snapshot.text, result.text);
  const original = await req(`/api/v1/sessions/${row.id}/audio`);
  assert.equal(original.status, 200);
  assert.equal(
    createHash("sha256").update(original.bytes).digest("hex"),
    result.sha256,
  );
  const draft = JSON.parse(row.snapshot.draft);
  assert.deepEqual(
    draft.groups.flatMap((g) => g.statements.map((s) => s.text)),
    ["AI 생성 일기 목업 입니다."],
  );
  console.log(
    "PASS non-debug signed release: capture, SDK STT, local mock, saved original/TTS playback, driving gates, settings action, automatic HTTPS sync and original SHA.",
  );
  console.log(
    "PASS invalid settings/stale response/cancellation; no run-as or mock credential.",
  );
} finally {
  const list = await req("/api/v1/sessions");
  if (list.status === 200)
    for (const row of list.json().items)
      await req(`/api/v1/sessions/${row.id}`, "DELETE", {
        expected_revision: row.revision,
      });
  const devices = await req("/api/v1/devices");
  if (devices.status === 200)
    for (const d of devices.json().devices || [])
      if (!d.revoked_at) await req(`/api/v1/devices/${d.id}`, "DELETE");
}
