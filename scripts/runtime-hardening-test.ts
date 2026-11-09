import { qa, qaRequest } from "./runtime-qa-client.ts";
import { readFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const code = await qaRequest("/api/v1/pairings", "POST", {});
const d = await qaRequest("/api/v1/devices/claim", "POST", {
  code: code.code,
  label: "재전송 합성 검사",
});
const ca = await readFile(".tools/runtime/local-ca.crt");
async function put(payload: unknown, key = randomUUID()) {
  const data = Buffer.from(JSON.stringify(payload));
  return new Promise<number>((resolve, reject) => {
    const r = httpsRequest(
      new URL(`/api/v1/sessions/${qa.id}/snapshot`, qa.origin),
      {
        method: "PUT",
        ca,
        headers: {
          authorization: `Bearer ${d.token}`,
          "idempotency-key": key,
          "content-type": "application/json",
          "content-length": String(data.length),
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode!));
      },
    );
    r.on("error", reject);
    r.end(data);
  });
}
try {
  let m = await qaRequest(`/api/v1/sessions/${qa.id}`);
  assert.equal(
    await put({ expected_revision: m.revision, snapshot: qa.snapshot }),
    200,
    "JSONB key order must not break replay",
  );
  m = await qaRequest(`/api/v1/sessions/${qa.id}`);
  assert.equal(
    await put({
      expected_revision: m.revision,
      snapshot: { ...qa.snapshot, text: "동일 revision의 다른 내용" },
    }),
    409,
  );
  assert.equal(
    await put({
      expected_revision: m.revision,
      snapshot: {
        ...qa.snapshot,
        revision: 2,
        confirmed: 2,
        accepted: 2,
        draft_revision: 2,
        raw_history: ["변조한 처음 인식문"],
      },
    }),
    409,
  );
  assert.equal(await put({ expected_revision: 0, snapshot: qa.snapshot }), 409);
  const key = randomUUID(),
    photo = await readFile(".tools/runtime/qa-photo.png");
  const first = await qaRequest(
    `/api/v1/sessions/${qa.id}/photos`,
    "POST",
    photo,
    { "idempotency-key": key },
  );
  const retry = await qaRequest(
    `/api/v1/sessions/${qa.id}/photos`,
    "POST",
    photo,
    { "idempotency-key": key },
  );
  assert.equal(first.revision, retry.revision);
  await assert.rejects(
    () =>
      qaRequest(
        `/api/v1/sessions/${qa.id}/photos`,
        "POST",
        Buffer.from("different"),
        { "idempotency-key": key },
      ),
    /409/,
  );
  await qaRequest(`/api/v1/sessions/${qa.id}/photos/${key}`, "DELETE");
  await assert.rejects(
    () => qaRequest(`/api/v1/sessions/${qa.id}/photos/${key}`),
    /404/,
  );
  console.log(
    "PASS same snapshot replay after JSONB serialization, unchanged-revision mutation denial, raw transcript immutability, stale CAS, photo identity replay/conflict/deletion.",
  );
} finally {
  await qaRequest(`/api/v1/devices/${d.id}`, "DELETE");
}
