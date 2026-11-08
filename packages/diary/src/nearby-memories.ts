import type { RecordingContext } from "./recording-context";
type LocatedRecord = {
  id: string;
  vaultId: string;
  context: RecordingContext;
  deleted?: boolean;
};
function point(context: RecordingContext) {
  const p = context.location;
  if (
    p.status !== "available" ||
    !Number.isFinite(p.latitude) ||
    !Number.isFinite(p.longitude) ||
    Math.abs(p.latitude!) > 90 ||
    Math.abs(p.longitude!) > 180
  )
    return null;
  return { lat: p.latitude!, lon: p.longitude! };
}
function distance(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
/** Caller must verify access and, for a vehicle surface, parked state before enabling recall. */
export function findNearbyMemories<T extends LocatedRecord>(
  current: T,
  candidates: readonly T[],
  enabled: boolean,
): { record: T; distanceMeters: number }[] {
  const anchor = point(current.context);
  const before = Date.parse(current.context.capturedAt);
  if (!enabled || current.deleted || !anchor || !Number.isFinite(before))
    return [];
  return candidates
    .filter(
      (record) =>
        record.id !== current.id &&
        record.vaultId === current.vaultId &&
        !record.deleted &&
        Date.parse(record.context.capturedAt) < before,
    )
    .flatMap((record) => {
      const location = point(record.context);
      if (!location) return [];
      const meters = distance(anchor, location);
      return meters <= 300 ? [{ record, distanceMeters: meters }] : [];
    })
    .sort(
      (a, b) =>
        Date.parse(b.record.context.capturedAt) -
          Date.parse(a.record.context.capturedAt) ||
        a.distanceMeters - b.distanceMeters ||
        a.record.id.localeCompare(b.record.id),
    )
    .slice(0, 3);
}
