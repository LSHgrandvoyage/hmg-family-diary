import { it, expect } from "vitest";
import { findNearbyMemories } from "./nearby-memories";
import {
  captureRecordingContext,
  type RecordingLocation,
} from "./recording-context";
function record(
  id: string,
  date: string,
  latitude = 37,
  longitude = 128,
  vaultId = "demo-vault",
) {
  return {
    id,
    vaultId,
    deleted: false,
    context: captureRecordingContext({
      capturedAt: date,
      vehicle: null,
      location: {
        status: "available",
        label: "같은 이름",
        latitude,
        longitude,
        observedAt: date,
        source: "demo",
      },
    }),
  };
}
const current = record("now", "2026-11-08T00:00:00Z");
const old = record("old", "2025-11-08T00:00:00Z", 37.001);
it("finds older nearby records across car changes, excluding self, future, deleted and other vaults", () => {
  const other = record("other", "2025-11-08T00:00:00Z", 37, 128, "other-vault");
  const future = record("future", "2027-11-08T00:00:00Z");
  const deleted = { ...old, id: "deleted", deleted: true };
  expect(
    findNearbyMemories(
      current,
      [old, current, other, future, deleted],
      true,
    ).map((x) => x.record.id),
  ).toEqual(["old"]);
});
it("uses distance, not matching place labels, and respects the 300m radius", () => {
  expect(
    findNearbyMemories(
      current,
      [
        record("near", "2025-01-01T00:00:00Z", 37.0026),
        record("far", "2025-01-01T00:00:00Z", 37.003),
      ],
      true,
    ).map((x) => x.record.id),
  ).toEqual(["near"]);
});
it("returns no result without the caller gate", () => {
  expect(findNearbyMemories(current, [old], false)).toEqual([]);
});
it.each([
  { status: "unavailable" },
  { status: "stale" },
  {
    status: "available",
    label: "위치만",
    observedAt: current.context.capturedAt,
    source: "demo",
  },
  {
    status: "available",
    label: "잘못된 좌표",
    observedAt: current.context.capturedAt,
    source: "demo",
    latitude: 100,
    longitude: 128,
  },
] as RecordingLocation[])(
  "does not fabricate a position for %j",
  (location) => {
    expect(
      findNearbyMemories(
        { ...current, context: { ...current.context, location } },
        [old],
        true,
      ),
    ).toEqual([]);
  },
);
it("returns the latest three past records in deterministic order", () => {
  const records = [1, 2, 3, 4].map((day) =>
    record(`${day}`, `2025-11-0${day}T00:00:00Z`),
  );
  expect(
    findNearbyMemories(current, records, true).map((x) => x.record.id),
  ).toEqual(["4", "3", "2"]);
});
it("rejects same-time records and invalid candidate coordinates", () => {
  expect(
    findNearbyMemories(
      current,
      [
        record("same", current.context.capturedAt),
        record("invalid", "2025-01-01T00:00:00Z", NaN),
      ],
      true,
    ),
  ).toEqual([]);
});
