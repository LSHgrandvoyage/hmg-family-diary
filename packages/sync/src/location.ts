/** Private recording context only; never supplied to the diary generator. */
export function recordingLocation(value: Record<string, any>, started: string) {
  const status = value?.status;
  if (
    ![
      "available",
      "unavailable",
      "synthetic",
      "stale",
      "denied",
      "unsupported",
      "error",
    ].includes(status)
  )
    throw new Error("LOCATION_STATUS");
  if (status !== "available")
    return {
      status,
      observed_at: status === "synthetic" ? started : null,
      label: status === "synthetic" ? "샘플 나들이 주차장" : null,
    };
  const { latitude, longitude, observed_at, source, confidence } = value;
  const age = Date.parse(started) - Date.parse(observed_at);
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    typeof observed_at !== "string" ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 30_000 ||
    source !== "pleos_fused_emulator" ||
    (confidence != null &&
      (typeof confidence !== "number" || !Number.isFinite(confidence)))
  )
    throw new Error("LOCATION_OBSERVATION");
  return {
    status,
    observed_at,
    label: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    latitude,
    longitude,
    source,
    confidence: confidence ?? null,
  };
}
