import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { qa, qaRequest } from "./runtime-qa-client.ts";
const adb = resolve(".tools/android-sdk/platform-tools/adb"),
  serial = "emulator-5580";
function run(args: string[], input?: Buffer | string) {
  return execFileSync(adb, ["-s", serial, ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
}
const user = run(["shell", "am", "get-current-user"]).trim();
assert.match(user, /^\d+$/);
console.log(
  run([
    "install",
    "-r",
    "apps/vehicle/app/build/outputs/apk/probe/debug/app-probe-debug.apk",
  ]).trim(),
);
console.log(
  run([
    "install",
    "-r",
    "apps/vehicle/app/build/outputs/apk/androidTest/probe/debug/app-probe-debug-androidTest.apk",
  ]).trim(),
);
run([
  "shell",
  "run-as",
  "io.hmg.familydiary.probe",
  "--user",
  user,
  "mkdir",
  "-p",
  "files/sync-qa",
]);
const put = (name: string, data: Buffer | string) =>
  run(
    [
      "shell",
      "run-as",
      "io.hmg.familydiary.probe",
      "--user",
      user,
      "sh",
      "-c",
      `"cat > files/sync-qa/${name}"`,
    ],
    data,
  );
const code = await qaRequest("/api/v1/pairings", "POST", {});
put("fixture.json", JSON.stringify({ code: code.code, snapshot: qa.snapshot }));
put("fixture.wav", await readFile(".tools/runtime/qa.wav"));
put("sync-origin.txt", qa.origin);
put("sync-ca.crt", await readFile(".tools/runtime/local-ca.crt"));
function test(method: string) {
  const output = run([
    "shell",
    "am",
    "instrument",
    "--user",
    user,
    "-w",
    "-e",
    "class",
    `io.hmg.familydiary.CloudSyncDeviceTest#${method}`,
    "io.hmg.familydiary.probe.test/androidx.test.runner.AndroidJUnitRunner",
  ]);
  console.log(output);
  assert.match(output, /OK \(1 test\)/, method);
}
test("pairUploadAndReadOriginal");
const records = await qaRequest("/api/v1/sessions");
const native = records.items.find(
  (m: any) => m.snapshot.context?.vehicle.nickname === "합성 차량",
);
assert.ok(native);
await writeFile(".tools/runtime/native-qa-id.txt", native.id, { mode: 0o600 });
await qaRequest(
  `/api/v1/sessions/${native.id}/photos`,
  "POST",
  await readFile(".tools/runtime/qa-photo.png"),
  { "idempotency-key": randomUUID() },
);
test("receivePhonePhoto");
const latest = await qaRequest(`/api/v1/sessions/${native.id}`);
await qaRequest(`/api/v1/sessions/${native.id}`, "DELETE", {
  expected_revision: latest.revision,
});
test("receiveRemoteDeletion");
const devices = await qaRequest("/api/v1/devices");
for (const d of devices.devices.filter((x: any) => !x.revoked_at))
  await qaRequest(`/api/v1/devices/${d.id}`, "DELETE");
test("revocationPurgesOnlySharedCopies");
run([
  "shell",
  "run-as",
  "io.hmg.familydiary.probe",
  "--user",
  user,
  "rm",
  "-r",
  "files/sync-qa",
]);
console.log(
  "PASS native original upload/download, phone photo download, remote deletion, revocation; never-shared sentinel preserved.",
);
