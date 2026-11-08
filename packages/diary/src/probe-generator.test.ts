import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../../tests/fixtures/freeform/E07.json";
import {
  validateDiary,
  type GenerationInput,
} from "../../contracts/src/diary.ts";
import { MockDiaryGenerator, probeGenerator } from "./probe-generator.ts";

afterEach(() => vi.unstubAllGlobals());
const input = fixture.input as GenerationInput;

it("defaults to a network-free mock even with credentials, preserving each speaker and complete evidence", async () => {
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  const selected = probeGenerator({
    apiKey: "synthetic-key",
    model: "synthetic-model",
  });
  const result = await selected.generator.generate(input);
  expect(selected.mode).toBe("mock");
  expect(result.generation_mode).toBe("mock");
  expect(result.session_id).toBe(input.session_id);
  expect(result.input_revision).toBe(input.input_revision);
  validateDiary(result.draft, input);
  expect(result.draft.groups.flatMap((g) => g.statements)).toEqual(
    input.utterances.map((u) => ({
      text: u.text,
      audience: "member",
      member_id: u.member_id,
      source_spans: [
        { utterance_id: u.id, start_ms: u.start_ms, end_ms: u.end_ms },
      ],
    })),
  );
  expect(
    result.draft.groups.every((g) => g.date === null && g.place_label === null),
  ).toBe(true);
  expect(transport).not.toHaveBeenCalled();
});

it("uses the current confirmed text and revision instead of an unrelated fixture", async () => {
  const generator = new MockDiaryGenerator();
  const changed = {
    ...input,
    session_id: "changed-session",
    input_revision: 9,
    utterances: [
      {
        ...input.utterances[0],
        id: "new-original",
        text: "어제의 이야기를 오늘 다시 말했어.",
      },
    ],
  };
  const result = await generator.generate(changed);
  expect(result.session_id).toBe(changed.session_id);
  expect(result.input_revision).toBe(9);
  expect(result.draft.groups[0].statements[0].text).toBe(
    changed.utterances[0].text,
  );
  expect(JSON.stringify(result)).not.toContain("수족관");
});

it("rejects cancelled and invalid input and never silently falls back from OpenAI", async () => {
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  const generator = new MockDiaryGenerator();
  await expect(generator.generate(input, AbortSignal.abort())).rejects.toThrow(
    "CANCELLED",
  );
  await expect(
    generator.generate({ ...input, utterances: [] }),
  ).rejects.toThrow("INVALID_INPUT");
  await expect(
    probeGenerator({ mode: "openai" }).generator.generate(input),
  ).rejects.toThrow("NOT_CONFIGURED");
  expect(() => probeGenerator({ mode: "typo" })).toThrow(
    "INVALID_GENERATION_MODE",
  );
  expect(transport).not.toHaveBeenCalled();
});
