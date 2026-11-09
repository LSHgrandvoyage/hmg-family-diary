import { HttpError, revision } from "../../contracts/src/http.ts";
import { validateDiary } from "../../contracts/src/diary.ts";
import { generationInput } from "../../diary/src/generator.ts";
const fail = () => new HttpError(422, "INVALID_SNAPSHOT");
function str(x: unknown, max: number, empty = false): string {
  if (typeof x !== "string" || x.length > max || (!empty && !x.trim()))
    throw fail();
  return x;
}
export function snapshot(value: unknown, id: string) {
  try {
    const v = value as Record<string, any>;
    const rev = revision(v.revision),
      duration = revision(v.duration_ms);
    if (
      duration < 1 ||
      duration > 21 * 60 * 1000 ||
      v.confirmed !== rev ||
      v.accepted !== rev ||
      v.draft_revision !== rev ||
      v.generation_mode !== "mock"
    )
      throw fail();
    const sha = str(v.sha256, 64);
    if (!/^[a-f0-9]{64}$/.test(sha)) throw fail();
    const recorded = str(v.recorded_at, 40),
      text = str(v.text, 50000),
      speaker = str(v.speaker, 40);
    const input = generationInput({
      schema_version: "1",
      session_id: id,
      input_revision: rev,
      recorded_at: recorded,
      timezone: "Asia/Seoul",
      members: [{ id: "speaker", display_name: speaker }],
      utterances: [
        {
          id: "original",
          member_id: "speaker",
          text,
          start_ms: 0,
          end_ms: duration,
        },
      ],
      user_place_corrections: [],
      user_group_corrections: [],
    });
    const draft = validateDiary(
      typeof v.draft === "string" ? JSON.parse(v.draft) : v.draft,
      input,
    );
    if (!Array.isArray(v.raw_history) || v.raw_history.length > 30)
      throw fail();
    const raw = v.raw_history.map((x: unknown) => str(x, 50000, true));
    let context = null;
    if (v.context != null) {
      const c = v.context,
        started = str(c.started_at, 40);
      if (!Number.isFinite(Date.parse(started))) throw fail();
      const vehicle: Record<string, string> = {};
      for (const k of ["nickname", "brand", "model", "type", "year", "plate"])
        vehicle[k] = str(c.vehicle[k], 120, true);
      if (
        !["manual", "synthetic"].includes(c.vehicle.source) ||
        !["synthetic", "unavailable"].includes(c.location.status)
      )
        throw fail();
      vehicle.source = c.vehicle.source;
      context = {
        started_at: started,
        vehicle,
        location: {
          status: c.location.status,
          observed_at: c.location.status === "synthetic" ? started : null,
          label:
            c.location.status === "synthetic" ? "샘플 나들이 주차장" : null,
        },
      };
    }
    const result = {
      sha256: sha,
      duration_ms: duration,
      recorded_at: recorded,
      raw_history: raw,
      text,
      speaker,
      revision: rev,
      confirmed: rev,
      draft: JSON.stringify(draft),
      draft_revision: rev,
      accepted: rev,
      model: str(v.model, 120),
      prompt_version: str(v.prompt_version, 120),
      generation_mode: "mock" as const,
      context,
    };
    if (JSON.stringify(result).length > 180000) throw fail();
    return result;
  } catch {
    throw fail();
  }
}
export type Snapshot = ReturnType<typeof snapshot>;
export type SyncedMemory = {
  id: string;
  revision: number;
  audio_ready: boolean;
  snapshot: Snapshot;
  photos: { id: string; sha256: string; bytes: number }[];
  deleted: boolean;
};
