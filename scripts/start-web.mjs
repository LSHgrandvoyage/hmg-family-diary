import { cp, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
const web = fileURLToPath(new URL("../apps/web/", import.meta.url));
const output = resolve(web, ".next/standalone/apps/web");
const index = process.argv.indexOf("--port");
const port = Number(
  index >= 0 ? process.argv[index + 1] : (process.env.PORT ?? 3017),
);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid port");
try {
  await access(resolve(output, "server.js"));
} catch {
  throw new Error("Run pnpm build first.");
}
await mkdir(resolve(output, ".next"), { recursive: true });
await cp(resolve(web, ".next/static"), resolve(output, ".next/static"), {
  recursive: true,
});
await cp(resolve(web, "public"), resolve(output, "public"), {
  recursive: true,
});
const child = spawn(process.execPath, [resolve(output, "server.js")], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: String(port),
    HOSTNAME: process.env.BIND_HOST ?? "127.0.0.1",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
