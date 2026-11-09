import { domainPool, purgeOnce } from "../../../apps/web/src/server/runtime.ts";
const pool = domainPool();
let stop = false;
process.on("SIGTERM", () => {
  stop = true;
});
process.on("SIGINT", () => {
  stop = true;
});
while (!stop) {
  try {
    if (await purgeOnce(pool)) continue;
  } catch {
    console.error("PURGE_RETRY_PENDING");
  }
  await new Promise((r) => setTimeout(r, 5000));
}
await pool.end();
