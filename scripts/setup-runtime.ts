import { randomBytes } from "node:crypto";
import { writeFile, mkdir, access } from "node:fs/promises";
import { isIP } from "node:net";
const host = process.argv[2];
if (!host || (!isIP(host) && !/^[a-zA-Z0-9.-]+$/.test(host)))
  throw new Error("Pass the Mac LAN IP or hostname");
try {
  await access(".env.runtime");
  throw new Error("Runtime configuration already exists; preserve its secrets");
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const values: Record<string, string> = {
  APP_HOST: host,
  APP_ORIGIN: `https://${host}:8443`,
  RUNTIME_BIND: "0.0.0.0",
};
for (const key of [
  "POSTGRES_PASSWORD",
  "APP_DB_PASSWORD",
  "AUTH_DB_PASSWORD",
  "MIGRATION_DB_PASSWORD",
  "BETTER_AUTH_SECRET",
])
  values[key] = randomBytes(32).toString("hex");
await writeFile(
  ".env.runtime",
  Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  { mode: 0o600, flag: "wx" },
);
await mkdir(".tools/runtime", { recursive: true, mode: 0o700 });
console.log(
  `Prepared local runtime at ${values.APP_ORIGIN}; secrets stay in .env.runtime`,
);
