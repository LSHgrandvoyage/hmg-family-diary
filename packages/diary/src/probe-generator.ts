import {
  validateDiary,
  type DiaryOutput,
  type GenerationInput,
} from "../../contracts/src/diary.ts";
import {
  GenerationError,
  generationInput,
  OpenAIDiaryGenerator,
  type DiaryGenerator,
  type GeneratedDraft,
} from "./generator.ts";

/** A transport/store bench response, not a semantic organizer. No network dependency. */
export class MockDiaryGenerator implements DiaryGenerator {
  async generate(
    value: GenerationInput,
    signal?: AbortSignal,
  ): Promise<GeneratedDraft> {
    if (signal?.aborted) throw new GenerationError("CANCELLED");
    const input = generationInput(value);
    const draft: DiaryOutput = {
      schema_version: "1",
      groups: input.utterances.map((u, index) => ({
        id: `mock-${index + 1}`,
        label: `${input.members.find((m) => m.id === u.member_id)!.display_name}의 이야기`,
        place_label: null,
        date: null,
        time_relation: "unclear",
        needs_review: false,
        statements: [
          {
            text: u.text,
            audience: "member",
            member_id: u.member_id,
            source_spans: [
              { utterance_id: u.id, start_ms: u.start_ms, end_ms: u.end_ms },
            ],
          },
        ],
      })),
      excluded_spans: [],
      review_items: [],
    };
    return {
      generation_mode: "mock",
      draft: validateDiary(draft, input),
      model: "mock-confirmed-text-v1",
      prompt_version: "mock-passthrough-v1",
      input_revision: input.input_revision,
      session_id: input.session_id,
    };
  }
}

/** Default local development is mock even if a provider key happens to exist. */
export function probeGenerator(config: {
  mode?: string;
  apiKey?: string;
  model?: string;
}): { mode: "mock" | "openai"; generator: DiaryGenerator } {
  const mode = config.mode ?? "mock";
  if (mode !== "mock" && mode !== "openai")
    throw new Error("INVALID_GENERATION_MODE");
  return {
    mode,
    generator:
      mode === "mock"
        ? new MockDiaryGenerator()
        : new OpenAIDiaryGenerator({
            apiKey: config.apiKey ?? "",
            model: config.model ?? "",
          }),
  };
}
