import { describe, it, expect } from "vitest";
import { recordingLocation } from "../src/location.ts";
describe("recording-start location boundary", () => {
  const start = "2099-01-01T00:01:00Z";
  const point = {
    status: "available",
    observed_at: "2099-01-01T00:00:45Z",
    latitude: 37,
    longitude: 127,
    source: "pleos_fused_emulator",
    confidence: 1,
  };
  it("preserves the observation and removes arbitrary external place labels", () => {
    expect(
      recordingLocation({ ...point, label: "invented destination" }, start),
    ).toMatchObject({ ...point, label: "37.00000, 127.00000" });
  });
  it.each(["2099-01-01T00:00:29Z", "2099-01-01T00:01:01Z", "invalid"])(
    "rejects stale/future/invalid time %s",
    (observed_at) => {
      expect(() =>
        recordingLocation({ ...point, observed_at }, start),
      ).toThrow();
    },
  );
  it.each([NaN, Infinity, 91, "37"])(
    "rejects invalid coordinate %s",
    (latitude) => {
      expect(() => recordingLocation({ ...point, latitude }, start)).toThrow();
    },
  );
  it("does not smuggle coordinates through failure states", () => {
    expect(recordingLocation({ ...point, status: "denied" }, start)).toEqual({
      status: "denied",
      observed_at: null,
      label: null,
    });
  });
  it("retains the existing unavailable wire shape", () => {
    expect(recordingLocation({ status: "unavailable" }, start)).toEqual({
      status: "unavailable",
      observed_at: null,
      label: null,
    });
  });
});
