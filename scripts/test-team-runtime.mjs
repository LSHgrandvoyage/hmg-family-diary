// Dedicated hmg-family-diary-team project only. Synthetic account, text and silent WAV.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const device = (
  await req("/api/v1/devices/claim", "POST", {
    code: pairing.code,
    label: "합성 팀 차",
  })
).json();
const bearer = { authorization: `Bearer ${device.token}` };
const token = execFileSync(
  "docker",
  [...compose, "exec", "-T", "mock", "cat", "/data/probe/token"],
  { encoding: "utf8" },
).trim();
assert.match(token, /^[a-f0-9]{64}$/);
const id = randomUUID(),
  text = "이 문장은 원본 확인문에만 남아야 합니다.",
  recorded = "2099-11-12T00:00:00Z";
const input = {
  schema_version: "1",
  session_id: id,
  input_revision: 1,
  recorded_at: recorded,
  timezone: "Asia/Seoul",
  members: [{ id: "speaker", display_name: "합성 화자" }],
  utterances: [
    { id: "original", member_id: "speaker", text, start_ms: 0, end_ms: 1000 },
  ],
  user_place_corrections: [],
  user_group_corrections: [],
  generation_mode: "mock",
};
const generated = await (
  await fetch("http://127.0.0.1:14319/draft", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  })
).json();
assert.equal(generated.generation_mode, "mock");
assert.deepEqual(
  generated.draft.groups.flatMap((g) => g.statements.map((s) => s.text)),
  ["AI 생성 일기 목업 입니다."],
);
assert.equal(generated.input_revision, 1);
const wav = Buffer.alloc(32044);
wav.write("RIFF", 0);
wav.writeUInt32LE(32036, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24);
wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(32000, 40);
const sha = createHash("sha256").update(wav).digest("hex");
const snapshot = {
  sha256: sha,
  duration_ms: 1000,
  recorded_at: recorded,
  raw_history: [text],
  text,
  speaker: "합성 화자",
  revision: 1,
  confirmed: 1,
  draft: JSON.stringify(generated.draft),
  draft_revision: 1,
  accepted: 1,
  model: generated.model,
  prompt_version: generated.prompt_version,
  generation_mode: "mock",
  context: null,
};
cookie = "";
try {
  assert.equal(
    (
      await req(
        `/api/v1/sessions/${id}/snapshot`,
        "PUT",
        { expected_revision: 0, snapshot },
        { ...bearer, "idempotency-key": randomUUID() },
      )
    ).status,
    200,
  );
  assert.equal(
    (await req(`/api/v1/sessions/${id}/audio`, "PUT", wav, bearer)).status,
    200,
  );
  cookie = ownerCookie;
  let row = await req(`/api/v1/sessions/${id}`);
  assert.equal(row.status, 200);
  assert.equal(row.json().snapshot.text, text);
  assert.equal(row.json().audio_ready, true);
  const original = await req(`/api/v1/sessions/${id}/audio`);
  assert.equal(createHash("sha256").update(original.bytes).digest("hex"), sha);
  console.log(
    "PASS isolated team HTTPS signup/mail/login, container fixed mock, original text/audio preservation.",
  );
  execFileSync(process.execPath, ["scripts/team-test.mjs", "stop"], {
    stdio: "ignore",
  });
  execFileSync(
    process.execPath,
    ["scripts/team-test.mjs", "up", "--no-build"],
    { stdio: "ignore" },
  );
  cookie = "";
  assert.equal(
    (await req("/api/auth/sign-in/email", "POST", { email, password })).status,
    200,
  );
  row = await req(`/api/v1/sessions/${id}`);
  assert.equal(row.status, 200);
  assert.equal(row.json().snapshot.text, text);
  assert.equal(
    createHash("sha256")
      .update((await req(`/api/v1/sessions/${id}/audio`)).bytes)
      .digest("hex"),
    sha,
  );
  console.log(
    "PASS team container stop/up preserves account, diary and original audio.",
  );
} finally {
  cookie = ownerCookie;
  const row = await req(`/api/v1/sessions/${id}`);
  if (row.status === 200)
    assert.equal(
      (
        await req(`/api/v1/sessions/${id}`, "DELETE", {
          expected_revision: row.json().revision,
        })
      ).status,
      200,
    );
  assert.equal(
    (await req(`/api/v1/devices/${device.id}`, "DELETE")).status,
    200,
  );
}
