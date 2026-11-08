import { describe, it, expect } from "vitest";
import { validateDiary, type GenerationInput, type DiaryOutput } from "./diary";
import { parseRange } from "./http";
import baseline from "../../../docs/evidence/claude-haiku55/eval/results.json";
import longFixture from "../../../tests/fixtures/freeform/E09.json";
const input: GenerationInput = {
  schema_version: "1",
  session_id: "test",
  input_revision: 1,
  recorded_at: "2026-11-08T01:00:00Z",
  timezone: "Asia/Seoul",
  members: [
    { id: "parent", display_name: "보호자" },
    { id: "child", display_name: "아이" },
  ],
  utterances: [
    {
      id: "u1",
      member_id: "parent",
      text: "바다가 좋았어.",
      start_ms: 0,
      end_ms: 4000,
    },
    {
      id: "u2",
      member_id: "child",
      text: "파도가 무서웠어.",
      start_ms: 4000,
      end_ms: 8000,
    },
  ],
  user_place_corrections: [],
  user_group_corrections: [],
};
function draft(): DiaryOutput {
  return {
    schema_version: "1",
    groups: [
      {
        id: "g1",
        label: "바다에서",
        place_label: null,
        date: null,
        time_relation: "occurred",
        needs_review: false,
        statements: input.utterances.map((u) => ({
          text: u.text,
          audience: "member",
          member_id: u.member_id,
          source_spans: [
            { utterance_id: u.id, start_ms: u.start_ms, end_ms: u.end_ms },
          ],
        })),
      },
    ],
    excluded_spans: [],
    review_items: [],
  };
}
describe("provenance boundary", () => {
  it("preserves separate speakers with opposite feelings", () =>
    expect(validateDiary(draft(), input).groups[0].statements).toHaveLength(2));
  it.each([
    "id",
    "range",
    "reverse",
    "speaker",
    "shared",
    "date",
    "coverage",
    "extra",
    "review",
    "duplicate",
  ])("rejects %s corruption", (kind) => {
    const d = draft();
    const s = d.groups[0].statements[0];
    if (kind === "id") s.source_spans[0].utterance_id = "unknown";
    if (kind === "range") s.source_spans[0].end_ms = 9000;
    if (kind === "reverse") s.source_spans[0].end_ms = 0;
    if (kind === "speaker") s.member_id = "child";
    if (kind === "shared") s.audience = "shared";
    if (kind === "date") d.groups[0].date = "2026-02-30";
    if (kind === "coverage") s.source_spans[0].end_ms = 3999;
    if (kind === "extra") Object.assign(d, { secret: "unexpected" });
    if (kind === "review")
      d.review_items = [{ message: "확인", utterance_ids: ["missing"] }];
    if (kind === "duplicate") d.groups.push(structuredClone(d.groups[0]));
    expect(() => validateDiary(d, input)).toThrow();
  });
  it("tracks partially excluded intervals and allows reinclusion", () => {
    const d = draft();
    d.groups[0].statements[0].source_spans[0].end_ms = 2000;
    d.excluded_spans = [
      {
        source_span: { utterance_id: "u1", start_ms: 2000, end_ms: 4000 },
        reason: "user_excluded",
      },
    ];
    expect(validateDiary(d, input)).toEqual(d);
    d.groups[0].statements[0].source_spans[0].end_ms = 4000;
    d.excluded_spans = [];
    expect(validateDiary(d, input)).toEqual(d);
  });
  it("rejects duplicate source IDs", () =>
    expect(() =>
      validateDiary(draft(), {
        ...input,
        utterances: [input.utterances[0], input.utterances[0]],
      }),
    ).toThrow("INVALID_UTTERANCE"));
  it("rejects gaps even if an utterance ID appears in a review item", () => {
    const d = draft();
    d.groups[0].statements.pop();
    d.review_items = [{ message: "검토", utterance_ids: ["u2"] }];
    expect(() => validateDiary(d, input)).toThrow("INCOMPLETE_COVERAGE");
  });
  it("accepts a leap day and rejects a non-leap day", () => {
    const d = draft();
    d.groups[0].date = "2024-02-29";
    expect(validateDiary(d, input)).toBe(d);
    d.groups[0].date = "2025-02-29";
    expect(() => validateDiary(d, input)).toThrow("INVALID_GROUP");
  });
});
describe("review state consistency", () => {
  it("rejects the observed Haiku v1 response with a hidden group review", () => {
    const response = baseline.find((row) => row.id === "E09")!;
    expect(() =>
      validateDiary(
        JSON.parse(response.response.answer),
        longFixture.input as GenerationInput,
      ),
    ).toThrow("INCONSISTENT_REVIEW_STATE");
  });
  it("requires a linked reason for a flagged group", () => {
    const d = draft();
    d.groups[0].needs_review = true;
    expect(() => validateDiary(d, input)).toThrow("INCONSISTENT_REVIEW_STATE");
    d.review_items = [
      { message: "방문 시점을 확인해 주세요.", utterance_ids: ["u1"] },
    ];
    expect(validateDiary(d, input)).toBe(d);
    d.review_items[0].message = " ";
    expect(() => validateDiary(d, input)).toThrow("EMPTY_REVIEW_MESSAGE");
  });
  it("flags every group sharing reviewed evidence, but not unrelated groups", () => {
    const d = draft();
    const [a, b] = d.groups[0].statements;
    const group = d.groups[0];
    d.groups = [
      { ...group, id: "g1", statements: [a], needs_review: true },
      { ...group, id: "g2", statements: [a], needs_review: false },
      { ...group, id: "g3", statements: [b], needs_review: false },
    ];
    d.review_items = [{ message: "시점 확인", utterance_ids: ["u1"] }];
    expect(() => validateDiary(d, input)).toThrow("INCONSISTENT_REVIEW_STATE");
    d.groups[1].needs_review = true;
    expect(validateDiary(d, input)).toBe(d);
    d.groups[2].needs_review = true;
    expect(() => validateDiary(d, input)).toThrow("INCONSISTENT_REVIEW_STATE");
  });
  it("keeps excluded-only questions without flagging unrelated events", () => {
    const d = draft();
    const removed = d.groups[0].statements.pop()!;
    d.excluded_spans = [
      { source_span: removed.source_spans[0], reason: "unclear" },
    ];
    d.review_items = [
      { message: "이 내용의 의미를 확인해 주세요.", utterance_ids: ["u2"] },
    ];
    expect(validateDiary(d, input)).toBe(d);
  });
});
describe("HTTP Range", () => {
  it.each([
    ["bytes=0-9", 0, 9],
    ["bytes=5-", 5, 99],
    ["bytes=-10", 90, 99],
    ["bytes=0-999", 0, 99],
  ] as const)("supports %s", (h, start, end) =>
    expect(parseRange(h, 100)).toEqual({ start, end }),
  );
  it.each([
    "bytes=100-",
    "bytes=3-2",
    "bytes=-0",
    "bytes=0-1,4-5",
    "bytes=-",
    "bytes=1.5-2",
  ])("rejects %s", (h) =>
    expect(() => parseRange(h, 100)).toThrow("INVALID_RANGE"),
  );
});
