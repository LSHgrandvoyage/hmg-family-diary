/** Dedicated synthetic vault fixture. No personal records, microphone, or user pairing. */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { qa, qaRequest } from "./runtime-qa-client.ts";

const adb = resolve(".tools/android-sdk/platform-tools/adb");
const run = (args: string[], input?: Buffer | string) =>
  execFileSync(adb, ["-s", "emulator-5580", ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
const user = run(["shell", "am", "get-current-user"]).trim();
const prefix = ["shell", "run-as", "io.hmg.familydiary.probe", "--user", user];
const path = "files/upload-qa";
const put = (name: string, data: Buffer | string) =>
  run([...prefix, "sh", "-c", `"cat > ${path}/${name}"`], data);
const get = (name: string) =>
  JSON.parse(run([...prefix, "cat", `${path}/${name}`]));
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
    `io.hmg.familydiary.AutoUploadDeviceTest#${name}`,
    "io.hmg.familydiary.probe.test/androidx.test.runner.AndroidJUnitRunner",
  ]);
  assert.match(output, /OK \(1 test\)/, name + "\n" + output);
  console.log("PASS " + name);
};
run(["emu", "avd", "hostmicoff"]);
run([...prefix, "rm", "-rf", path]); // Exclusively this script's synthetic fixture.
run([...prefix, "mkdir", "-p", path]);
const me = await qaRequest("/api/v1/me");
assert.ok(me.vault_id);
const pairing = await qaRequest("/api/v1/pairings", "POST", {});
put(
  "fixture.json",
  JSON.stringify({
    code: pairing.code,
    snapshot: qa.snapshot,
    prefix: randomUUID() + "-",
  }),
);
put("fixture.wav", await readFile(".tools/runtime/qa.wav"));
put("sync-origin.txt", qa.origin);
put("sync-ca.crt", await readFile(".tools/runtime/local-ca.crt"));
const ids = new Set<string>();
let deviceId: string | undefined;
try {
  test("prepareOfflineAndExcludeDraft");
  let job = get("job.json");
  ids.add(job.id);
  await assert.rejects(qaRequest(`/api/v1/sessions/${job.id}`), /404/);
  const state = get("cloud-sync.json");
  deviceId = state.device;
  const headers = { cookie: "", authorization: `Bearer ${state.token}` };
  test("recoverAfterRestart");
  let row = await qaRequest(`/api/v1/sessions/${job.id}`);
  assert.equal(row.audio_ready, true);
  assert.equal(row.snapshot.sha256, qa.snapshot.sha256);
  assert.equal(row.revision, 2);
  console.log(
    "PASS phone authenticated view contains completed diary and original SHA, draft excluded",
  );
  test("queueReconfirmation");
  job = get("job.json");
  const photo = randomUUID();
  await qaRequest(
    `/api/v1/sessions/${job.id}/photos`,
    "POST",
    await readFile(".tools/runtime/qa-photo.png"),
    { "idempotency-key": photo },
  );
  test("recoverReconfirmation");
  row = await qaRequest(`/api/v1/sessions/${job.id}`);
  assert.equal(row.snapshot.revision, 2);
  assert.equal(row.photos[0].id, photo);
  assert.equal(row.revision, 4);
  console.log(
    "PASS photo revision conflict rebased without losing photo or confirmed text",
  );
  test("queueReconfirmation");
  job = get("job.json");
  const payload = { expected_revision: row.revision, snapshot: job.snapshot };
  job.payload = payload;
  put(
    "sync-outbox.json",
    JSON.stringify({ ...get("sync-outbox.json"), jobs: { [job.key]: job } }),
  );
  const lost = await qaRequest(
    `/api/v1/sessions/${job.id}/snapshot`,
    "PUT",
    payload,
    { ...headers, "idempotency-key": job.request_key },
  );
  // Device never sees this response. New instrumentation process must replay the persisted exact request.
  test("recoverReconfirmation");
  row = await qaRequest(`/api/v1/sessions/${job.id}`);
  assert.equal(row.revision, lost.revision);
  assert.equal(row.snapshot.revision, 3);
  console.log(
    "PASS lost snapshot response replay does not create another revision or diary",
  );
  test("deleteOfflineWinsAfterRestart");
  await assert.rejects(qaRequest(`/api/v1/sessions/${job.id}`), /410/);
  test("prepareRemoteDelete");
  job = get("job.json");
  ids.add(job.id);
  row = await qaRequest(`/api/v1/sessions/${job.id}`);
  await qaRequest(`/api/v1/sessions/${job.id}`, "DELETE", {
    expected_revision: row.revision,
  });
  test("remoteDeletionDoesNotResurrectOrInterruptMedia");
  await assert.rejects(qaRequest(`/api/v1/sessions/${job.id}`), /410/);
  test("scheduledJobUploadsWithoutActivity");
  const backgroundId = get("background-id.json").id;
  ids.add(backgroundId);
  assert.equal(
    (await qaRequest(`/api/v1/sessions/${backgroundId}`)).audio_ready,
    true,
  );
  test("saveButtonAutomaticallyUploads");
  const uiId = get("ui-id.json").id;
  ids.add(uiId);
  const uiRow = await qaRequest(`/api/v1/sessions/${uiId}`);
  assert.equal(uiRow.audio_ready, true);
  test("prepareContentConflict");
  job = get("job.json");
  ids.add(job.id);
  row = await qaRequest(`/api/v1/sessions/${job.id}`);
  const other = {
    ...row.snapshot,
    revision: 3,
    confirmed: 3,
    accepted: 3,
    draft_revision: 3,
  };
  await qaRequest(
    `/api/v1/sessions/${job.id}/snapshot`,
    "PUT",
    { expected_revision: row.revision, snapshot: other },
    { ...headers, "idempotency-key": randomUUID() },
  );
  test("preserveContentConflict");
  test("prepareRevocation");
  job = get("job.json");
  ids.add(job.id);
  await qaRequest(`/api/v1/devices/${deviceId}`, "DELETE");
  test("revokedIdentityStopsRetry");
  await assert.rejects(qaRequest(`/api/v1/sessions/${job.id}`), /404/);
  console.log(
    "PASS C023 real HTTPS native outbox: offline, process restart, draft exclusion, photo race, response loss, deletion, auth and vault isolation",
  );
} finally {
  try {
    const prefix = get("fixture.json").prefix;
    for (const [id, link] of Object.entries(get("cloud-sync.json").links))
      if ((link as any).file.startsWith(prefix)) ids.add(id);
  } catch {}
  for (const id of ids) {
    try {
      const row = await qaRequest(`/api/v1/sessions/${id}`);
      await qaRequest(`/api/v1/sessions/${id}`, "DELETE", {
        expected_revision: row.revision,
      });
    } catch (e) {
      if (!/404|410/.test(String(e))) throw e;
    }
  }
  const devices = await qaRequest("/api/v1/devices");
  for (const d of devices.devices.filter(
    (d: any) => d.label === "자동 업로드 합성 검사" && !d.revoked_at,
  ))
    await qaRequest(`/api/v1/devices/${d.id}`, "DELETE");
}
