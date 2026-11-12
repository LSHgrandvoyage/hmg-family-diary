import { describe, it, expect } from "vitest";
import { speechTimeline } from "../src/timeline.ts";
import { snapshot } from "../src/snapshot.ts";
import { generationInput } from "../../diary/src/generator.ts";
import { MockDiaryGenerator } from "../../diary/src/probe-generator.ts";
const raw = ["첫 발언\n두 번째 발언"];
const valid = {
  source: "pleos_epd_pcm_v1",
  raw_history_index: 0,
  segments: [
    { id: "segment-1", text: "첫 발언", start_ms: 0, end_ms: 2000 },
    { id: "segment-2", text: "두 번째 발언", start_ms: 4000, end_ms: 6000 },
  ],
};
describe("original speech alignment wire boundary", () => {
  it("preserves source timing and strips unverified speaker identity", () => {
    expect(
      speechTimeline(
        {
          ...valid,
          segments: valid.segments.map((r) => ({
            ...r,
            speaker: "invented mother",
          })),
        },
        raw,
        7000,
      ),
    ).toEqual(valid);
  });
  it("keeps legacy records absent and unaligned text null", () => {
    expect(speechTimeline(undefined, [], 7000)).toBeUndefined();
    const x = structuredClone(valid);
    Object.assign(x.segments[1], { start_ms: null, end_ms: null });
    expect(speechTimeline(x, raw, 7000)).toEqual(x);
  });
  it.each([
    { start_ms: -1 },
    { start_ms: 1000 },
    { end_ms: 9000 },
    { end_ms: 4000 },
    { start_ms: 4.5 },
    { start_ms: null },
    { id: "segment-1" },
    { text: "edited confirmation" },
  ])("rejects unsafe or unbound segment %j", (patch) => {
    const x = structuredClone(valid);
    Object.assign(x.segments[1], patch);
    expect(() => speechTimeline(x, raw, 7000)).toThrow();
  });
  it("binds latest recognition history and rejects unknown source", () => {
    expect(() => speechTimeline(valid, [...raw, "new run"], 7000)).toThrow();
    expect(() =>
      speechTimeline({ ...valid, source: "llm_guess" }, raw, 7000),
    ).toThrow();
  });
});

describe("timeline through the complete sync snapshot", () => {
  async function fixture() {
    const input = generationInput({
      schema_version: "1",
      session_id: "synthetic-timeline",
      input_revision: 2,
      recorded_at: "2099-11-11T00:00:00Z",
      timezone: "Asia/Seoul",
      members: [{ id: "speaker", display_name: "합성 가족" }],
      utterances: [
        {
          id: "original",
          member_id: "speaker",
          text: "사용자가 수정한 확인문",
          start_ms: 0,
          end_ms: 7000,
        },
      ],
      user_place_corrections: [],
      user_group_corrections: [],
    });
    const generated = await new MockDiaryGenerator().generate(input);
    return {
      sha256: "a".repeat(64),
      duration_ms: 7000,
      recorded_at: input.recorded_at,
      text: input.utterances[0].text,
      speaker: "합성 가족",
      raw_history: raw,
      revision: 2,
      confirmed: 2,
      accepted: 2,
      draft_revision: 2,
      draft: generated.draft,
      model: generated.model,
      prompt_version: generated.prompt_version,
      generation_mode: "mock",
    };
  }
  it("round trips source timing independently of corrected and generated text", async () => {
    const saved = snapshot(
      { ...(await fixture()), speech_timeline: valid },
      "synthetic-timeline",
    );
    expect(saved.speech_timeline).toEqual(valid);
    expect(saved.text).toBe("사용자가 수정한 확인문");
    expect(
      snapshot(JSON.parse(JSON.stringify(saved)), "synthetic-timeline"),
    ).toEqual(saved);
  });
  it("does not alter legacy canonical snapshots with a new null field", async () => {
    const saved = snapshot(await fixture(), "synthetic-timeline");
    expect(Object.hasOwn(saved, "speech_timeline")).toBe(false);
    expect(snapshot(saved, "synthetic-timeline")).toEqual(saved);
  });
  it("rejects timing bound to edited text instead of recognition history", async () => {
    const v = await fixture();
    expect(() =>
      snapshot(
        { ...v, raw_history: [v.text], speech_timeline: valid },
        "synthetic-timeline",
      ),
    ).toThrow();
  });
});
