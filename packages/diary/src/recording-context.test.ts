import { describe, it, expect } from "vitest";
import {
  captureRecordingContext,
  type VehicleProfile,
  type RecordingLocation,
} from "./recording-context";
const capturedAt = "2026-11-08T05:00:00Z";
const vehicle: VehicleProfile = {
  id: "demo-car",
  nickname: "샘플 차",
  manufacturer: "예시",
  model: "샘플 모델",
  bodyType: "SUV",
  modelYear: 2024,
  registrationNumber: "샘플 0001",
  source: "demo",
};
describe("recording context snapshot", () => {
  it("keeps the original car and recording place after the source profile changes", () => {
    const profile = { ...vehicle };
    const location: RecordingLocation = {
      status: "available",
      label: "가상 주차장",
      observedAt: capturedAt,
      source: "demo",
    };
    const snapshot = captureRecordingContext({
      capturedAt,
      vehicle: profile,
      location,
    });
    profile.model = "새 차";
    profile.registrationNumber = "샘플 0002";
    location.label = "다른 장소";
    expect(snapshot.vehicle?.model).toBe("샘플 모델");
    expect(snapshot.vehicle?.registrationNumber).toBe("샘플 0001");
    expect(snapshot.location).toMatchObject({ label: "가상 주차장" });
    expect(Object.isFrozen(snapshot.vehicle)).toBe(true);
  });
  it.each(["2026-11-08T04:57:59Z", "2026-11-08T05:00:06Z", "invalid"])(
    "rejects stale, future or invalid observation %s",
    (observedAt) => {
      const snapshot = captureRecordingContext({
        capturedAt,
        vehicle,
        location: {
          status: "available",
          label: "가상 장소",
          observedAt,
          source: "demo",
        },
      });
      expect(snapshot.location).toEqual({ status: "stale" });
    },
  );
  it("accepts the defined freshness boundary without replacing the capture time", () => {
    const snapshot = captureRecordingContext({
      capturedAt,
      vehicle,
      location: {
        status: "available",
        label: "가상 장소",
        observedAt: "2026-11-08T04:58:00Z",
        source: "demo",
      },
    });
    expect(snapshot.location.status).toBe("available");
    expect(snapshot.capturedAt).toBe(capturedAt);
  });
  it.each(["omitted", "denied", "unsupported", "unavailable"] as const)(
    "preserves %s without inventing a place or blocking the record",
    (status) => {
      expect(
        captureRecordingContext({
          capturedAt,
          vehicle: null,
          location: { status },
        }),
      ).toMatchObject({ vehicle: null, location: { status } });
    },
  );
  it("rejects an invalid recording time", () => {
    expect(() =>
      captureRecordingContext({
        capturedAt: "bad",
        vehicle,
        location: { status: "unavailable" },
      }),
    ).toThrow("INVALID_CAPTURE_TIME");
  });
});
