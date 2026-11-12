/** Synthetic integration only. Never opens existing vehicle recordings. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { request as httpsRequest } from "node:https";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
import sharp from "sharp";
import { MockDiaryGenerator } from "../packages/diary/src/probe-generator.ts";
loadEnvFile(".env.runtime");
const origin = process.env.APP_ORIGIN!,
  ca = await readFile(".tools/runtime/local-ca.crt");
const log = (s: string) => console.log(`PASS ${s}`);
type Client = { cookie: string };
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  client?: Client,
  headers: Record<string, string> = {},
) {
  const data =
    body === undefined
      ? undefined
      : Buffer.isBuffer(body)
        ? body
        : Buffer.from(JSON.stringify(body));
  return await new Promise<{
    status: number;
    body: Buffer;
    headers: import("node:http").IncomingHttpHeaders;
    json: () => any;
  }>((resolve, reject) => {
    const r = httpsRequest(
      new URL(path, origin),
      {
        method,
        ca,
        headers: {
          origin,
          "content-type": "application/json",
          ...(data ? { "content-length": String(data.length) } : {}),
          ...(client?.cookie ? { cookie: client.cookie } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (b) => chunks.push(b));
        res.on("end", () => {
          const b = Buffer.concat(chunks);
          if (client && res.headers["set-cookie"])
            client.cookie = res.headers["set-cookie"]
              .map((c) => c.split(";")[0])
              .join("; ");
          resolve({
            status: res.statusCode!,
            body: b,
            headers: res.headers,
            json: () => JSON.parse(b.toString()),
          });
        });
      },
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}
async function mailLink(
  email: string,
  kind: "verify-email" | "reset-password",
) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const all = await (
      await fetch("http://localhost:8025/api/v1/messages")
    ).json();
    for (const m of all.messages ?? []) {
      if (!m.To?.some((x: { Address: string }) => x.Address === email))
        continue;
      const full = await (
        await fetch(`http://localhost:8025/api/v1/message/${m.ID}`)
      ).json();
      const match = full.Text.match(/https:\/\/[^\s]+/g)?.find((x: string) =>
        x.includes(kind),
      );
      if (match) return match;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Synthetic verification mail missing");
}
async function account() {
  const email = `qa-${randomUUID()}@synthetic.test`,
    password = randomBytes(20).toString("hex"),
    client = { cookie: "" };
  const signup = await request("/api/auth/sign-up/email", "POST", {
    email,
    password,
    name: "합성 시험 보호자",
    callbackURL: "/login",
  });
  assert.equal(signup.status, 200, "signup");
  const early = await request(
    "/api/auth/sign-in/email",
    "POST",
    { email, password },
    client,
  );
  assert.equal(early.status, 403, "verification required");
  const verify = await request(await mailLink(email, "verify-email"));
  assert.ok([200, 302].includes(verify.status), "verify");
  let login = await request(
    "/api/auth/sign-in/email",
    "POST",
    { email, password },
    client,
  );
  if (login.status === 429) {
    await new Promise((r) => setTimeout(r, 11000));
    login = await request(
      "/api/auth/sign-in/email",
      "POST",
      { email, password },
      client,
    );
  }
  assert.equal(login.status, 200, "login");
  assert.match(login.headers["set-cookie"]!.join(";"), /HttpOnly/i);
  assert.match(login.headers["set-cookie"]!.join(";"), /Secure/i);
  assert.equal(
    (await request("/api/v1/me", "GET", undefined, client)).status,
    200,
  );
  return { email, password, client };
}
const owner = await account(),
  other = await account();
log("verified owner login and Secure HttpOnly session");
const code = (
  await request("/api/v1/pairings", "POST", {}, owner.client)
).json().code;
const claim = await request("/api/v1/devices/claim", "POST", {
  code,
  label: "합성 시험 차량",
});
assert.equal(claim.status, 201);
const device = claim.json(),
  bearer = { authorization: `Bearer ${device.token}` };
assert.equal(
  (await request("/api/v1/devices/claim", "POST", { code, label: "중복" }))
    .status,
  409,
);
log("single-use vehicle pairing");
const devicePath = `/api/v1/devices/${device.id}`;
assert.equal(
  (await request(devicePath, "PATCH", { label: "무인증" })).status,
  401,
);
assert.equal(
  (await request(devicePath, "PATCH", { label: "다른 가족" }, other.client))
    .status,
  404,
);
for (const label of ["   ", "가".repeat(41)])
  assert.equal(
    (await request(devicePath, "PATCH", { label }, owner.client)).status,
    422,
  );
assert.equal(
  (
    await request(
      devicePath,
      "PATCH",
      { label: "  우리집 시험 차량  " },
      owner.client,
    )
  ).json().label,
  "우리집 시험 차량",
);
assert.equal(
  (await request("/api/v1/me", "GET", undefined, undefined, bearer)).json()
    .device_label,
  "우리집 시험 차량",
);
assert.equal(
  (
    await request(
      devicePath,
      "PATCH",
      { label: "차량에서 수정" },
      undefined,
      bearer,
    )
  ).status,
  200,
);
assert.equal(
  (
    await request(
      `/api/v1/devices/${randomUUID()}`,
      "PATCH",
      { label: "다른 기기" },
      undefined,
      bearer,
    )
  ).status,
  403,
);
assert.equal(
  (await request("/api/v1/devices", "GET", undefined, owner.client))
    .json()
    .devices.find((x: any) => x.id === device.id).label,
  "차량에서 수정",
);
log(
  "device alias owner/self updates, trim, invalid input, unauthenticated/cross-vault/other-device denial",
);

const id = randomUUID(),
  wav = Buffer.alloc(44 + 16000 * 2 * 2);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24);
wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 44; i < wav.length; i += 2)
  wav.writeInt16LE(
    Math.round(Math.sin(((i - 44) / 2 / 16000) * Math.PI * 2 * 330) * 1800),
    i,
  );
const text = "합성 시험 이야기예요. 오늘 함께 드라이브했어요.",
  date = "2026-11-09T03:00:00Z";
const input = {
  schema_version: "1" as const,
  session_id: id,
  input_revision: 1,
  recorded_at: date,
  timezone: "Asia/Seoul",
  members: [{ id: "speaker", display_name: "시험 화자" }],
  utterances: [
    { id: "original", member_id: "speaker", text, start_ms: 0, end_ms: 2000 },
  ],
  user_place_corrections: [],
  user_group_corrections: [],
};
const generated = await new MockDiaryGenerator().generate(input);
const snapshot = {
  sha256: createHash("sha256").update(wav).digest("hex"),
  duration_ms: 2000,
  recorded_at: date,
  raw_history: [text],
  text,
  speaker: "시험 화자",
  revision: 1,
  confirmed: 1,
  draft: JSON.stringify(generated.draft),
  draft_revision: 1,
  accepted: 1,
  model: generated.model,
  prompt_version: generated.prompt_version,
  generation_mode: "mock",
  context: {
    started_at: date,
    vehicle: {
      nickname: "시험용 우리 차",
      brand: "현대",
      model: "샘플 차량",
      type: "SUV",
      year: "2026",
      plate: "",
      source: "synthetic",
    },
    location: {
      status: "synthetic",
      observed_at: date,
      label: "샘플 나들이 주차장",
    },
  },
};
const key = randomUUID(),
  payload = { expected_revision: 0, snapshot };
let saved = await request(
  `/api/v1/sessions/${id}/snapshot`,
  "PUT",
  payload,
  undefined,
  { ...bearer, "idempotency-key": key },
);
assert.equal(saved.status, 200, "snapshot");
assert.deepEqual(
  (
    await request(
      `/api/v1/sessions/${id}/snapshot`,
      "PUT",
      payload,
      undefined,
      { ...bearer, "idempotency-key": key },
    )
  ).json(),
  saved.json(),
);
assert.equal(
  (
    await request(
      `/api/v1/sessions/${id}/snapshot`,
      "PUT",
      { ...payload, expected_revision: 2 },
      undefined,
      { ...bearer, "idempotency-key": key },
    )
  ).status,
  409,
);
assert.equal(
  (
    await request(
      `/api/v1/sessions/${id}/audio`,
      "PUT",
      Buffer.alloc(50),
      undefined,
      bearer,
    )
  ).status,
  422,
);
assert.equal(
  (await request(`/api/v1/sessions/${id}/audio`, "PUT", wav, undefined, bearer))
    .status,
  200,
);
log("snapshot idempotency and immutable checked audio upload");
assert.equal((await request(`/api/v1/sessions/${id}/audio`)).status, 401);
assert.equal(
  (await request(`/api/v1/sessions/${id}`, "GET", undefined, other.client))
    .status,
  404,
);
assert.equal(
  (
    await request(
      `/api/v1/sessions/${id}/audio`,
      "GET",
      undefined,
      other.client,
    )
  ).status,
  404,
);
const original = await request(
  `/api/v1/sessions/${id}/audio`,
  "GET",
  undefined,
  owner.client,
);
assert.deepEqual(original.body, wav);
const range = await request(
  `/api/v1/sessions/${id}/audio`,
  "GET",
  undefined,
  owner.client,
  { range: "bytes=44-63" },
);
assert.equal(range.status, 206);
assert.deepEqual(range.body, wav.subarray(44, 64));
log("phone original SHA/Range, anonymous and cross-vault denial");
const photo = await sharp({
  create: { width: 320, height: 240, channels: 3, background: "#3868b2" },
})
  .png()
  .toBuffer();
const attached = await request(
  `/api/v1/sessions/${id}/photos`,
  "POST",
  photo,
  owner.client,
  { "idempotency-key": randomUUID() },
);
assert.equal(attached.status, 201, "photo");
const pid = attached.json().photos[0].id;
const jpeg = await request(
  `/api/v1/sessions/${id}/photos/${pid}`,
  "GET",
  undefined,
  owner.client,
);
assert.equal((await sharp(jpeg.body).metadata()).format, "jpeg");
assert.equal(
  (
    await request(
      `/api/v1/sessions/${id}/photos/${pid}`,
      "GET",
      undefined,
      other.client,
    )
  ).status,
  404,
);
assert.equal(
  (await request(`/api/v1/sessions/${id}/photos/${pid}`)).status,
  401,
);
log("private photo normalization and vault isolation");
assert.equal(
  (
    await request("/api/v1/pairings", "POST", {}, owner.client, {
      origin: "https://evil.invalid",
    })
  ).status,
  403,
);
const sync = await request(
  "/api/v1/sync?cursor=0",
  "GET",
  undefined,
  undefined,
  bearer,
);
assert.ok(
  sync.json().items.some((x: any) => x.id === id && x.photos.length === 1),
);
// Separate disposable diary exercises tombstones; leave the first synthetic diary for browser QA.
const deletedId = randomUUID();
await request(
  `/api/v1/sessions/${deletedId}/snapshot`,
  "PUT",
  payload,
  undefined,
  { ...bearer, "idempotency-key": randomUUID() },
);
await request(
  `/api/v1/sessions/${deletedId}/audio`,
  "PUT",
  wav,
  undefined,
  bearer,
);
assert.equal(
  (
    await request(
      `/api/v1/sessions/${deletedId}`,
      "DELETE",
      { expected_revision: 2 },
      owner.client,
    )
  ).status,
  200,
);
assert.equal(
  (
    await request(
      `/api/v1/sessions/${deletedId}/audio`,
      "GET",
      undefined,
      owner.client,
    )
  ).status,
  410,
);
assert.equal(
  (
    await request(
      `/api/v1/sessions/${deletedId}/snapshot`,
      "PUT",
      payload,
      undefined,
      { ...bearer, "idempotency-key": randomUUID() },
    )
  ).status,
  410,
);
assert.ok(
  (await request("/api/v1/sync?cursor=0", "GET", undefined, undefined, bearer))
    .json()
    .items.some((x: any) => x.id === deletedId && x.deleted),
);
await request(
  `/api/v1/devices/${device.id}`,
  "DELETE",
  undefined,
  owner.client,
);
assert.equal(
  (await request("/api/v1/me", "GET", undefined, undefined, bearer)).status,
  401,
);
assert.equal(
  (await request(devicePath, "PATCH", { label: "해제 후 수정" }, owner.client))
    .status,
  404,
);
assert.equal(
  (
    await request(
      devicePath,
      "PATCH",
      { label: "해제 후 수정" },
      undefined,
      bearer,
    )
  ).status,
  401,
);
log("CSRF, tombstone resurrection denial, sync deletion, device revocation");
const stale = { cookie: other.client.cookie };
await request("/api/auth/request-password-reset", "POST", {
  email: other.email,
  redirectTo: "/login",
});
const reset = await request(await mailLink(other.email, "reset-password"));
assert.equal(reset.status, 302);
const token = new URL(reset.headers.location!, origin).searchParams.get(
  "token",
);
assert.ok(token);
assert.equal(
  (
    await request("/api/auth/reset-password", "POST", {
      token,
      newPassword: randomBytes(20).toString("hex"),
    })
  ).status,
  200,
);
assert.equal(
  (await request("/api/v1/me", "GET", undefined, stale)).status,
  401,
);
log("password reset revokes prior sessions");
const nativeCode = (
  await request("/api/v1/pairings", "POST", {}, owner.client)
).json().code;
await mkdir(".tools/runtime", { recursive: true });
await writeFile(
  ".tools/runtime/qa.json",
  JSON.stringify({
    origin,
    email: owner.email,
    password: owner.password,
    cookie: owner.client.cookie,
    id,
    deletedId,
    pid,
    code: nativeCode,
    snapshot,
  }),
  { mode: 0o600 },
);
await writeFile(".tools/runtime/qa.wav", wav, { mode: 0o600 });
await writeFile(".tools/runtime/qa-photo.png", photo, { mode: 0o600 });
console.log(
  "Synthetic integration passed; private QA handoff saved (no credentials printed).",
);
