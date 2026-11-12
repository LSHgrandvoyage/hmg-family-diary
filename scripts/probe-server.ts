import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { probeGenerator } from "../packages/diary/src/probe-generator.ts";
import { createProbeServer } from "../packages/diary/src/probe-server.ts";

const stateDir = process.env.PROBE_STATE_DIR || ".tools/probe";
await mkdir(stateDir, { recursive: true, mode: 0o700 });
const path = join(stateDir, "token");
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
const host = process.env.PROBE_CONTAINER === "true" ? "0.0.0.0" : "127.0.0.1";
if (host === "0.0.0.0" && mode !== "mock")
  throw Error("CONTAINER_REQUIRES_MOCK");
server.listen(4319, host, async () => {
  await writeFile(join(stateDir, "mode"), mode, { mode: 0o600 });
  console.log(
    `Local diary probe: ${host}:4319; generator ${mode === "mock" ? "MOCK (no provider calls)" : apiKey && model ? "OpenAI configured" : "NOT_CONFIGURED (set OPENAI_API_KEY and OPENAI_MODEL)"}`,
  );
});
server.on("error", () => {
  console.error("Local probe could not start; check port 4319.");
  process.exitCode = 1;
});
