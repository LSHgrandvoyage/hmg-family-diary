import Ajv2020 from "ajv/dist/2020.js";
import schema from "../../../specs/001-family-trip-memory/contracts/diary-output.schema.json";

export { schema as diaryOutputSchema };
export type SourceSpan = {
  utterance_id: string;
  start_ms: number;
  end_ms: number;
};
export type GenerationInput = {
  schema_version: "1";
  session_id: string;
  input_revision: number;
  recorded_at: string;
  timezone: string;
  members: { id: string; display_name: string }[];
  utterances: {
    id: string;
    member_id: string;
    text: string;
    start_ms: number;
    end_ms: number;
  }[];
  user_place_corrections: string[];
  user_group_corrections: string[];
};
export type DiaryOutput = {
  schema_version: "1";
  groups: {
    id: string;
    label: string;
    place_label: string | null;
    date: string | null;
    time_relation: "occurred" | "planned" | "unclear";
    needs_review: boolean;
    statements: {
      text: string;
      audience: "member" | "shared";
      member_id: string | null;
      source_spans: SourceSpan[];
    }[];
  }[];
  excluded_spans: {
    source_span: SourceSpan;
    reason: "unrelated" | "repetition" | "unclear" | "user_excluded";
  }[];
  review_items: { message: string; utterance_ids: string[] }[];
};
export class ContractError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(
  schema,
);
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}
export function validateInput(input: GenerationInput): void {
  if (
    input.schema_version !== "1" ||
    !Number.isSafeInteger(input.input_revision) ||
    input.input_revision < 0 ||
    !Number.isFinite(Date.parse(input.recorded_at))
  )
    throw new ContractError("INVALID_INPUT");
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw new ContractError("INVALID_TIMEZONE");
  }
  const members = new Set(input.members.map((m) => m.id));
  if (
    members.size !== input.members.length ||
    input.members.some(
      (m) => !m.id || !m.display_name.trim() || m.display_name.length > 40,
    )
  )
    throw new ContractError("INVALID_MEMBERS");
  const ids = new Set<string>();
  for (const u of input.utterances) {
    if (
      !u.id ||
      ids.has(u.id) ||
      !members.has(u.member_id) ||
      typeof u.text !== "string" ||
      !Number.isSafeInteger(u.start_ms) ||
      !Number.isSafeInteger(u.end_ms) ||
      u.start_ms < 0 ||
      u.end_ms <= u.start_ms
    )
      throw new ContractError("INVALID_UTTERANCE");
    ids.add(u.id);
  }
}
/** Structural/provenance checks do not establish semantic truth. The owner still reviews the draft. */
export function validateDiary(
  output: unknown,
  input: GenerationInput,
): DiaryOutput {
  validateInput(input);
  if (!validateSchema(output)) throw new ContractError("INVALID_SCHEMA");
  const draft = output as DiaryOutput;
  const utterances = new Map(input.utterances.map((u) => [u.id, u]));
  const coverage = new Map<string, [number, number][]>();
  const checkSpan = (s: SourceSpan) => {
    const u = utterances.get(s.utterance_id);
    if (
      !u ||
      s.start_ms < u.start_ms ||
      s.end_ms > u.end_ms ||
      s.end_ms <= s.start_ms
    )
      throw new ContractError("INVALID_SOURCE_SPAN");
    coverage.set(u.id, [...(coverage.get(u.id) ?? []), [s.start_ms, s.end_ms]]);
    return u;
  };
  const groups = new Set<string>();
  for (const g of draft.groups) {
    if (
      !g.id ||
      groups.has(g.id) ||
      !g.label.trim() ||
      (g.date !== null && !validDate(g.date))
    )
      throw new ContractError("INVALID_GROUP");
    groups.add(g.id);
    for (const s of g.statements) {
      if (!s.text.trim()) throw new ContractError("EMPTY_STATEMENT");
      const sources = s.source_spans.map(checkSpan);
      if (
        s.audience === "shared"
          ? s.member_id !== null
          : s.member_id === null ||
            !input.members.some((m) => m.id === s.member_id) ||
            sources.some((u) => u.member_id !== s.member_id)
      )
        throw new ContractError("INVALID_SPEAKER");
    }
  }
  for (const excluded of draft.excluded_spans) checkSpan(excluded.source_span);
  for (const item of draft.review_items) {
    if (item.utterance_ids.some((id) => !utterances.has(id)))
      throw new ContractError("INVALID_REVIEW_SOURCE");
  }
  // Every interval must be used or explicitly excluded. Mentioning an ID alone is insufficient.
  for (const u of input.utterances) {
    let end = u.start_ms;
    for (const [a, b] of (coverage.get(u.id) ?? []).sort(
      (a, b) => a[0] - b[0],
    )) {
      if (a > end) throw new ContractError("INCOMPLETE_COVERAGE");
      end = Math.max(end, b);
    }
    if (end < u.end_ms) throw new ContractError("INCOMPLETE_COVERAGE");
  }
  return draft;
}
