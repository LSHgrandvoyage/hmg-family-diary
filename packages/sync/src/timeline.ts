import { HttpError } from "../../contracts/src/http.ts";
const invalid = () => new HttpError(422, "INVALID_SPEECH_TIMELINE");
export function speechTimeline(
  value: unknown,
  raw: string[],
  duration: number,
) {
  if (value == null) return undefined;
  const v = value as any;
  if (
    v.source !== "pleos_epd_pcm_v1" ||
    !Number.isSafeInteger(v.raw_history_index) ||
    v.raw_history_index < 0 ||
    v.raw_history_index !== raw.length - 1 ||
    !Array.isArray(v.segments) ||
    v.segments.length < 1 ||
    v.segments.length > 500
  )
    throw invalid();
  let end = 0;
  const ids = new Set<string>();
  const segments = v.segments.map((r: any) => {
    if (
      !r ||
      typeof r.id !== "string" ||
      !/^segment-[1-9][0-9]{0,2}$/.test(r.id) ||
      ids.has(r.id) ||
      typeof r.text !== "string" ||
      !r.text.trim() ||
      r.text.length > 50000
    )
      throw invalid();
    ids.add(r.id);
    if (r.start_ms !== null || r.end_ms !== null) {
      if (
        !Number.isSafeInteger(r.start_ms) ||
        !Number.isSafeInteger(r.end_ms) ||
        r.start_ms < end ||
        r.end_ms <= r.start_ms ||
        r.end_ms > duration
      )
        throw invalid();
      end = r.end_ms;
    }
    return { id: r.id, text: r.text, start_ms: r.start_ms, end_ms: r.end_ms };
  });
  if (segments.map((r: any) => r.text).join("\n") !== raw[v.raw_history_index])
    throw invalid();
  return {
    source: "pleos_epd_pcm_v1" as const,
    raw_history_index: v.raw_history_index,
    segments,
  };
}
