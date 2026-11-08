/** Normalized application values. SDK timestamps/permissions must be verified by the adapter. */
export type VehicleProfile = {
  id: string;
  nickname: string;
  manufacturer: string | null;
  model: string | null;
  bodyType: string | null;
  modelYear: number | null;
  registrationNumber: string | null;
  source: "user" | "vehicle_sdk" | "demo";
};
export type RecordingLocation =
  | {
      status: "available";
      label: string;
      observedAt: string;
      source: "vehicle_sdk" | "user" | "demo";
    }
  | { status: "omitted" | "denied" | "unsupported" | "unavailable" | "stale" };
export type RecordingContext = Readonly<{
  capturedAt: string;
  vehicle: Readonly<VehicleProfile> | null;
  location: Readonly<RecordingLocation>;
}>;
/** Copy at recording start. Updating a profile later must never rewrite a memory. */
export function captureRecordingContext(input: {
  capturedAt: string;
  vehicle: VehicleProfile | null;
  location: RecordingLocation;
}): RecordingContext {
  const captured = Date.parse(input.capturedAt);
  if (!Number.isFinite(captured)) throw new Error("INVALID_CAPTURE_TIME");
  let location: RecordingLocation = { ...input.location };
  if (location.status === "available") {
    const age = captured - Date.parse(location.observedAt);
    if (
      !Number.isFinite(age) ||
      age > 120_000 ||
      age < -5_000 ||
      !location.label.trim()
    )
      location = { status: "stale" };
  }
  return Object.freeze({
    capturedAt: input.capturedAt,
    vehicle: input.vehicle ? Object.freeze({ ...input.vehicle }) : null,
    location: Object.freeze(location),
  });
}
