/** A separate synthetic vault device and private auto-qa directory; no user records or pairing touched. */
import { execFileSync, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { qa, qaRequest } from "./runtime-qa-client.ts";
const adb = resolve(".tools/android-sdk/platform-tools/adb"),
  serial = "emulator-5580";
const run = (args: string[], input?: Buffer | string) =>
  execFileSync(adb, ["-s", serial, ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
const user = run(["shell", "am", "get-current-user"]).trim();
const prefix = ["shell", "run-as", "io.hmg.familydiary.probe", "--user", user];
run([...prefix, "mkdir", "-p", "files/auto-qa"]);
const put = (name: string, data: Buffer | string) =>
  run([...prefix, "sh", "-c", `"cat > files/auto-qa/${name}"`], data);
const exists = (name: string) => {
  try {
    run([...prefix, "test", "-f", `files/auto-qa/${name}`]);
    return true;
  } catch {
    return false;
  }
};
// Stale markers belong exclusively to this synthetic test.
run([
  ...prefix,
  "rm",
  "-f",
  "files/auto-qa/ready",
  "files/auto-qa/expected.json",
  "files/auto-qa/cloud-sync.json",
]);
const pairing = await qaRequest("/api/v1/pairings", "POST", {});
put("fixture.json", JSON.stringify({ code: pairing.code, id: qa.id }));
put("sync-origin.txt", qa.origin);
put("sync-ca.crt", await readFile(".tools/runtime/local-ca.crt"));
const before = await qaRequest(`/api/v1/sessions/${qa.id}`);
assert.ok(
  before.photos.length <= 6,
  "synthetic fixture has room for two photos",
);
const photos: string[] = [];
let output = "";
const child = spawn(adb, [
  "-s",
  serial,
  "shell",
  "am",
  "instrument",
  "--user",
  user,
  "-w",
  "-e",
  "class",
  "io.hmg.familydiary.AutoReceiveDeviceTest",
  "io.hmg.familydiary.probe.test/androidx.test.runner.AndroidJUnitRunner",
]);
child.stdout.on("data", (b) => (output += b.toString()));
child.stderr.on("data", (b) => (output += b.toString()));
const done = new Promise<void>((res, rej) => {
  child.on("error", rej);
  child.on("close", () => res());
});
try {
  const until = Date.now() + 30000;
  while (!exists("ready") && Date.now() < until)
    await new Promise((r) => setTimeout(r, 200));
  assert.ok(exists("ready"), "isolated native detail ready: " + output);
  for (let j = 0; j < 2; j++) {
    const id = randomUUID();
    await qaRequest(
      `/api/v1/sessions/${qa.id}/photos`,
      "POST",
      await readFile(".tools/runtime/qa-photo.png"),
      { "idempotency-key": id },
    );
    photos.unshift(id);
  }
  const latest = await qaRequest(`/api/v1/sessions/${qa.id}`);
  assert.deepEqual(
    latest.photos.slice(0, 2).map((p: any) => p.id),
    photos,
    "server returns newest first",
  );
  assert.ok(
    latest.photos.slice(0, 2).every((p: any) => p.created_at),
    "new uploads carry insertion time",
  );
  put("expected.json", JSON.stringify({ photos }));
  await done;
  console.log(output);
  assert.match(output, /OK \(1 test\)/);
  console.log(
    "PASS new photo timestamp/order, MainActivity foreground automatic receive, visible detail refresh, same server/native order, no polling after gate closes.",
  );
} finally {
  await done;
  for (const id of photos)
    await qaRequest(`/api/v1/sessions/${qa.id}/photos/${id}`, "DELETE");
  const devices = await qaRequest("/api/v1/devices");
  for (const d of devices.devices.filter(
    (x: any) => x.label === "자동 수신 합성 검사" && !x.revoked_at,
  ))
    await qaRequest(`/api/v1/devices/${d.id}`, "DELETE");
}
