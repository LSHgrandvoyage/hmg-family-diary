import { qa, qaRequest } from "./runtime-qa-client.ts";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const before = await qaRequest(`/api/v1/sessions/${qa.id}`);
execFileSync(
  "docker",
  ["compose", "--env-file", ".env.runtime", "restart", "db", "web", "worker"],
  { stdio: "ignore" },
);
let after: any;
for (let i = 0; i < 30; i++) {
  try {
    after = await qaRequest(`/api/v1/sessions/${qa.id}`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
assert.deepEqual(after, before);
const ca = await readFile(".tools/runtime/local-ca.crt");
const audio = await new Promise<Buffer>((resolve, reject) => {
  const r = httpsRequest(
    new URL(`/api/v1/sessions/${qa.id}/audio`, qa.origin),
    { ca, headers: { cookie: qa.cookie } },
    (res) => {
      const b: Buffer[] = [];
      res.on("data", (x) => b.push(x));
      res.on("end", () => resolve(Buffer.concat(b)));
    },
  );
  r.on("error", reject);
  r.end();
});
assert.equal(
  createHash("sha256").update(audio).digest("hex"),
  qa.snapshot.sha256,
);
console.log(
  "PASS DB/web/worker restart preserves session login, diary, photo metadata and exact original audio.",
);
const me = await qaRequest("/api/v1/me");
execFileSync(
  "docker",
  [
    "compose",
    "--env-file",
    ".env.runtime",
    "exec",
    "-T",
    "worker",
    "node",
    "--import",
    "tsx",
    "--input-type=module-typescript",
    "-e",
    await readFile("scripts/audit-runtime-storage.ts", "utf8"),
    me.vault_id,
  ],
  { stdio: "inherit" },
);
