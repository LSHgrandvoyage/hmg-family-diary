/** Authenticated synthetic vault only; no real position, audio or pairing is touched. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { qa, qaRequest } from "./runtime-qa-client.ts";
const id = randomUUID();
let created = false;
let device: any;
try {
  // Clean only remnants with this test's exact synthetic context after an interrupted run.
  const previous = await qaRequest("/api/v1/sessions");
  for (const row of previous.items.filter(
    (m: any) =>
      m.snapshot.context?.started_at === "2099-01-01T00:00:30Z" &&
      m.snapshot.context?.vehicle?.nickname === "합성 차량",
  ))
    await qaRequest(`/api/v1/sessions/${row.id}`, "DELETE", {
      expected_revision: row.revision,
    });
  const devices = await qaRequest("/api/v1/devices");
  for (const row of devices.devices.filter(
    (d: any) => d.label === "합성 위치 검증" && !d.revoked_at,
  ))
    await qaRequest(`/api/v1/devices/${row.id}`, "DELETE");
  const pairing = await qaRequest("/api/v1/pairings", "POST", {});
  device = await qaRequest("/api/v1/devices/claim", "POST", {
    code: pairing.code,
    label: "합성 위치 검증",
  });
  const headers = {
    authorization: `Bearer ${device.token}`,
    cookie: "",
    "idempotency-key": randomUUID(),
  };
  const snapshot = structuredClone(qa.snapshot);
  snapshot.context = {
    started_at: "2099-01-01T00:00:30Z",
    vehicle: {
      nickname: "합성 차량",
      brand: "",
      model: "",
      type: "",
      year: "",
      plate: "",
      source: "synthetic",
    },
    location: {
      status: "available",
      observed_at: "2099-01-01T00:00:15Z",
      latitude: 37,
      longitude: 127,
      source: "pleos_fused_emulator",
      confidence: 1,
      label: "untrusted label",
    },
  };
  const saved = await qaRequest(
    `/api/v1/sessions/${id}/snapshot`,
    "PUT",
    { expected_revision: 0, snapshot },
    headers,
  );
  created = true;
  const result = await qaRequest(`/api/v1/sessions/${id}`);
  assert.equal(result.snapshot.context.location.label, "37.00000, 127.00000");
  assert.equal(
    result.snapshot.context.location.observed_at,
    snapshot.context.location.observed_at,
  );
  const changed = structuredClone(snapshot);
  changed.context.location.latitude = 38;
  await assert.rejects(
    qaRequest(
      `/api/v1/sessions/${id}/snapshot`,
      "PUT",
      { expected_revision: saved.revision, snapshot: changed },
      { ...headers, "idempotency-key": randomUUID() },
    ),
    /409/,
  );
  console.log(
    "PASS recording-start observation survives authenticated server round-trip; historical location cannot be rewritten.",
  );
} finally {
  if (created) {
    const row = await qaRequest(`/api/v1/sessions/${id}`);
    await qaRequest(`/api/v1/sessions/${id}`, "DELETE", {
      expected_revision: row.revision,
    });
  }
  if (device?.id) await qaRequest(`/api/v1/devices/${device.id}`, "DELETE");
}
