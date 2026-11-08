import {
  ContractError,
  diaryOutputSchema,
  validateDiary,
  validateInput,
  type DiaryOutput,
  type GenerationInput,
} from "../../contracts/src/diary.ts";
import { ORGANIZE_INSTRUCTIONS, PROMPT_VERSION } from "./prompts.ts";

export class GenerationError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export type GeneratedDraft = {
  generation_mode: "mock" | "openai";
  draft: DiaryOutput;
  model: string;
  prompt_version: string;
  input_revision: number;
  session_id: string;
};
export interface DiaryGenerator {
  generate(
    input: GenerationInput,
    signal?: AbortSignal,
  ): Promise<GeneratedDraft>;
}

// Strict allowlist: unknown fields (including raw audio/coordinates) cannot cross the provider boundary.
export function generationInput(value: unknown): GenerationInput {
  try {
    if (!value || typeof value !== "object") throw new Error();
    const v = value as GenerationInput;
    const input: GenerationInput = {
      schema_version: v.schema_version,
      session_id: v.session_id,
      input_revision: v.input_revision,
      recorded_at: v.recorded_at,
      timezone: v.timezone,
      members: v.members.map(({ id, display_name }) => ({ id, display_name })),
      utterances: v.utterances.map(
        ({ id, member_id, text, start_ms, end_ms }) => ({
          id,
          member_id,
          text,
          start_ms,
          end_ms,
        }),
      ),
      user_place_corrections: v.user_place_corrections.map((x) => x),
      user_group_corrections: v.user_group_corrections.map((x) => x),
    };
    if (
      typeof input.session_id !== "string" ||
      !input.session_id ||
      input.session_id.length > 100 ||
      typeof input.recorded_at !== "string" ||
      typeof input.timezone !== "string" ||
      !input.timezone ||
      input.members.some(
        (m) => typeof m.id !== "string" || !m.id || m.id.length > 100,
      ) ||
      !input.utterances.length ||
      input.utterances.length > 200 ||
      input.members.length > 20 ||
      input.utterances.some(
        (u) =>
          typeof u.id !== "string" ||
          typeof u.member_id !== "string" ||
          !u.text.trim() ||
          u.id.length > 100 ||
          u.member_id.length > 100,
      ) ||
      [...input.user_place_corrections, ...input.user_group_corrections].some(
        (x) => typeof x !== "string",
      ) ||
      JSON.stringify(input).length > 60_000
    )
      throw new Error();
    validateInput(input);
    return input;
  } catch {
    throw new GenerationError("INVALID_INPUT");
  }
}

export class OpenAIDiaryGenerator implements DiaryGenerator {
  constructor(
    private readonly config: {
      apiKey: string;
      model: string;
      fetch?: typeof fetch;
    },
  ) {}
  async generate(
    value: GenerationInput,
    signal?: AbortSignal,
  ): Promise<GeneratedDraft> {
    const input = generationInput(value);
    if (!this.config.apiKey || !this.config.model)
      throw new GenerationError("NOT_CONFIGURED");
    const { $schema, $id, title, ...schema } = diaryOutputSchema;
    try {
      const response = await (this.config.fetch ?? fetch)(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.any([
            AbortSignal.timeout(90_000),
            ...(signal ? [signal] : []),
          ]),
          body: JSON.stringify({
            model: this.config.model,
            store: false,
            instructions: ORGANIZE_INSTRUCTIONS,
            input: [{ role: "user", content: JSON.stringify(input) }],
            max_output_tokens: 12_000,
            text: {
              format: {
                type: "json_schema",
                name: "family_diary",
                strict: true,
                schema,
              },
            },
          }),
        },
      );
      if (!response.ok)
        throw new GenerationError(
          response.status === 429
            ? "RATE_LIMITED"
            : response.status === 401 || response.status === 403
              ? "PROVIDER_AUTH"
              : "PROVIDER_ERROR",
        );
      const result = await response.json();
      if (result.status !== "completed")
        throw new GenerationError("INCOMPLETE");
      const content = (result.output ?? [])
        .filter((x: { type: string }) => x.type === "message")
        .flatMap(
          (x: { content?: { type: string; text?: string }[] }) =>
            x.content ?? [],
        );
      if (content.some((x: { type: string }) => x.type === "refusal"))
        throw new GenerationError("REFUSED");
      const parts = content.filter(
        (x: { type: string }) => x.type === "output_text",
      );
      if (parts.length !== 1 || typeof parts[0].text !== "string")
        throw new GenerationError("INVALID_OUTPUT");
      const draft = validateDiary(JSON.parse(parts[0].text), input);
      // Probe has only whole-utterance audio bounds, never claim LLM-invented timestamps as alignment.
      const bounds = new Map(input.utterances.map((u) => [u.id, u]));
      const spans = [
        ...draft.groups.flatMap((g) =>
          g.statements.flatMap((s) => s.source_spans),
        ),
        ...draft.excluded_spans.map((e) => e.source_span),
      ];
      if (
        spans.some(
          (s) =>
            s.start_ms !== bounds.get(s.utterance_id)?.start_ms ||
            s.end_ms !== bounds.get(s.utterance_id)?.end_ms,
        )
      )
        throw new GenerationError("UNVERIFIED_ALIGNMENT");
      return {
        generation_mode: "openai",
        draft,
        model: this.config.model,
        prompt_version: PROMPT_VERSION,
        input_revision: input.input_revision,
        session_id: input.session_id,
      };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      if (signal?.aborted) throw new GenerationError("CANCELLED");
      if (error instanceof Error && error.name === "TimeoutError")
        throw new GenerationError("TIMEOUT");
      if (error instanceof ContractError || error instanceof SyntaxError)
        throw new GenerationError("INVALID_OUTPUT");
      throw new GenerationError("PROVIDER_UNAVAILABLE");
    }
  }
}
