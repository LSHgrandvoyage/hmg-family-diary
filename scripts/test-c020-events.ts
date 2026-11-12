/** Authenticated synthetic vault SSE integration. Never prints credentials. */
import { request } from "node:https";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { qa, qaRequest } from "./runtime-qa-client.ts";
const ca = await readFile(".tools/runtime/local-ca.crt");
function stream(headers: Record<string, string> = { cookie: qa.cookie }) {
  let status = 0,
    text = "",
    failed: Error | undefined;
  const req = request(
    new URL("/api/v1/events", qa.origin),
    { ca, headers },
    (res) => {
      status = res.statusCode!;
      res.on("data", (b) => (text += b.toString()));
      res.on("error", (e) => {
        failed = e;
      });
    },
  );
  req.on("error", (e) => {
    failed = e;
  });
  req.end();
  return {
    req,
    get status() {
      return status;
    },
    get text() {
      return text;
    },
    get failed() {
      return failed;
    },
  };
}
async function until(label: string, fn: () => boolean) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error(label);
}
const unauthorized = stream({});
await until("unauthorized", () => !!unauthorized.status);
assert.equal(unauthorized.status, 401);
unauthorized.req.destroy();
const bearer = stream({ authorization: "Bearer " + "a".repeat(64) });
await until("invalid bearer", () => !!bearer.status);
assert.equal(bearer.status, 401);
bearer.req.destroy();
let first = stream(),
  second: ReturnType<typeof stream> | undefined;
const photos: string[] = [];
try {
  await until("ready", () => first.text.includes("event: ready"));
  assert.equal(first.status, 200);
  const cursor = await qaRequest("/api/v1/sync?cursor=0");
  let last = cursor.cursor;
  assert.equal(cursor.has_more, false);
  const id = randomUUID();
  photos.push(id);
  await qaRequest(
    `/api/v1/sessions/${qa.id}/photos`,
    "POST",
    await readFile(".tools/runtime/qa-photo.png"),
    { "idempotency-key": id },
  );
  await until("commit emits change", () =>
    first.text.includes("event: changed"),
  );
  assert.ok(!first.text.includes(qa.id), "SSE contains no diary ID or content");
  const delta = await qaRequest(`/api/v1/sync?cursor=${last}`);
  assert.ok(
    delta.items.some((m: any) => m.photos?.some((p: any) => p.id === id)),
  );
  last = delta.cursor;
  first.req.destroy();
  await qaRequest(`/api/v1/sessions/${qa.id}/photos/${id}`, "DELETE");
  photos.pop();
  second = stream();
  await until("reconnect ready", () => second!.text.includes("event: ready"));
  const missed = await qaRequest(`/api/v1/sync?cursor=${last}`);
  assert.ok(
    missed.items.some(
      (m: any) => m.id === qa.id && !m.photos.some((p: any) => p.id === id),
    ),
    "cursor recovers missed deletion",
  );
  // No actual data is sent on heartbeat.
  assert.match(second.text, /data: \{\}/);
  console.log(
    "PASS SSE cookie auth, invalid auth rejection, commit notification, content-free hints, reconnect cursor recovery.",
  );
} finally {
  first.req.destroy();
  second?.req.destroy();
  for (const id of photos)
    await qaRequest(`/api/v1/sessions/${qa.id}/photos/${id}`, "DELETE");
}
