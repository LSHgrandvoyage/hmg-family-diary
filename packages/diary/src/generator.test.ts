import { expect, it, vi } from "vitest";
import { OpenAIDiaryGenerator, generationInput } from "./generator.ts";
import fixture from "../../../tests/fixtures/freeform/E01.json";
import type {
  GenerationInput,
  DiaryOutput,
} from "../../contracts/src/diary.ts";

const input = fixture.input as GenerationInput;
function output(): DiaryOutput {
  return {
    schema_version: "1",
    groups: [
      {
        id: "g1",
        label: "바다",
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
function completed(draft: unknown) {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(draft) }],
      },
    ],
  };
}
function generator(body: unknown, status = 200) {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(body, { status }));
  return {
    transport,
    adapter: new OpenAIDiaryGenerator({
      apiKey: "synthetic-key",
      model: "synthetic-model",
      fetch: transport,
    }),
  };
}
it("sends only confirmed input, strict schema, no tools, and store:false; retains revision", async () => {
  const { adapter, transport } = generator(completed(output()));
  const result = await adapter.generate({
    ...input,
    audio: "private-audio",
    coordinates: [1, 2],
  } as GenerationInput);
  const request = JSON.parse(transport.mock.calls[0][1]!.body as string);
  expect(request.store).toBe(false);
  expect(request.tools).toBeUndefined();
  expect(request.text.format.strict).toBe(true);
  expect(request.text.format.schema.$id).toBeUndefined();
  expect(request.input[0].content).not.toContain("private-audio");
  expect(request.input[0].content).not.toContain("coordinates");
  expect(result.input_revision).toBe(input.input_revision);
  expect(result.draft.groups[0].statements.map((s) => s.member_id)).toEqual([
    "parent",
    "child",
  ]);
});
it.each([
  [{ status: "incomplete", output: [] }, "INCOMPLETE"],
  [
    {
      status: "completed",
      output: [
        { type: "message", content: [{ type: "refusal", refusal: "no" }] },
      ],
    },
    "REFUSED",
  ],
  [completed({}), "INVALID_OUTPUT"],
  [{ status: "completed", output: [] }, "INVALID_OUTPUT"],
])(
  "rejects incomplete/refused/invalid responses without a fallback",
  async (response, code) => {
    await expect(generator(response).adapter.generate(input)).rejects.toThrow(
      code,
    );
  },
);
it("rejects wrong source IDs and speaker transfer", async () => {
  const d = output();
  d.groups[0].statements[0].member_id = "child";
  await expect(generator(completed(d)).adapter.generate(input)).rejects.toThrow(
    "INVALID_OUTPUT",
  );
  d.groups[0].statements[0].source_spans[0].utterance_id = "invented";
  await expect(generator(completed(d)).adapter.generate(input)).rejects.toThrow(
    "INVALID_OUTPUT",
  );
});
it("rejects fabricated sub-utterance alignment even when full coverage is present", async () => {
  const d = output();
  d.groups[0].statements[0].source_spans.push({
    utterance_id: "E01-u1",
    start_ms: 100,
    end_ms: 1000,
  });
  await expect(generator(completed(d)).adapter.generate(input)).rejects.toThrow(
    "UNVERIFIED_ALIGNMENT",
  );
});
it.each([
  null,
  {},
  { ...input, utterances: [] },
  { ...input, utterances: [{ ...input.utterances[0], text: " " }] },
])("rejects malformed or empty input", (value) => {
  expect(() => generationInput(value)).toThrow("INVALID_INPUT");
});
it("never calls a provider when unconfigured", async () => {
  const transport = vi.fn<typeof fetch>();
  await expect(
    new OpenAIDiaryGenerator({
      apiKey: "",
      model: "",
      fetch: transport,
    }).generate(input),
  ).rejects.toThrow("NOT_CONFIGURED");
  expect(transport).not.toHaveBeenCalled();
});
it("does not expose provider error bodies", async () => {
  await expect(
    generator({ error: "private provider detail" }, 401).adapter.generate(
      input,
    ),
  ).rejects.toThrow("PROVIDER_AUTH");
});
