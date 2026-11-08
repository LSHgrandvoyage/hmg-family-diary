import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { diaryOutputSchema } from "../packages/contracts/src/diary.ts";
import {
  ORGANIZE_INSTRUCTIONS,
  PROMPT_VERSION,
} from "../packages/diary/src/prompts.ts";

// No model/network calls. Evaluation metadata is kept out of messages.
const destination = process.argv[2];
if (!destination)
  throw new Error(
    "Usage: tsx scripts/prepare-web-experiments.ts <new-directory>",
  );
await mkdir(destination, { recursive: false });
const { $schema, $id, title, ...schema } = diaryOutputSchema;
for (const [split, cases] of [
  ["development", ["E01", "E02", "E03", "E06"]],
  ["evaluation", ["E07", "E09"]],
] as const) {
  const rows = [];
  for (const id of cases) {
    const fixture = JSON.parse(
      await readFile(`tests/fixtures/freeform/${id}.json`, "utf8"),
    );
    if (fixture.synthetic !== true)
      throw new Error("Only synthetic fixtures are allowed");
    rows.push(
      JSON.stringify({
        id,
        system:
          ORGANIZE_INSTRUCTIONS +
          "\n\n출력 JSON Schema:\n" +
          JSON.stringify(schema),
        messages: [{ role: "user", content: JSON.stringify(fixture.input) }],
        metadata: {
          split,
          synthetic: true,
          prompt_version: PROMPT_VERSION,
          case: id,
          expected_review: fixture.expected_review,
        },
      }),
    );
  }
  await writeFile(join(destination, `${split}.jsonl`), rows.join("\n") + "\n", {
    flag: "wx",
    mode: 0o600,
  });
}
console.log(
  "Prepared synthetic development/evaluation source files; no model calls.",
);
