import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { probeGenerator } from "../packages/diary/src/probe-generator.ts";
import { createProbeServer } from "../packages/diary/src/probe-server.ts";

await mkdir(".tools/probe", { recursive: true, mode: 0o700 });
const path = ".tools/probe/token";
try {
  await writeFile(path, randomBytes(32).toString("hex"), {
    flag: "wx",
    mode: 0o600,
  });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
}
const token = (await readFile(path, "utf8")).trim();
const apiKey = process.env.OPENAI_API_KEY ?? "";
const model = process.env.OPENAI_MODEL ?? "";
const { mode, generator } = probeGenerator({
  mode: process.env.DIARY_GENERATOR,
  apiKey,
  model,
});
const server = createProbeServer(token, generator, mode);
server.listen(4319, "127.0.0.1", async () => {
  await writeFile(".tools/probe/mode", mode, { mode: 0o600 });
  console.log(
    `Local diary probe: 127.0.0.1:4319; generator ${mode === "mock" ? "MOCK (no provider calls)" : apiKey && model ? "OpenAI configured" : "NOT_CONFIGURED (set OPENAI_API_KEY and OPENAI_MODEL)"}`,
  );
});
server.on("error", () => {
  console.error("Local probe could not start; check port 4319.");
  process.exitCode = 1;
});
