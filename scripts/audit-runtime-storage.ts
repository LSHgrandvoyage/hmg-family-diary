/** Run inside the worker container. Emits counts only, no personal content or credentials. */
import { Pool } from "pg";
import { access } from "node:fs/promises";
import { join } from "node:path";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  await c.query("BEGIN");
  await c.query("SELECT set_config('diary.vault_id',$1,true)", [
    process.argv.at(-1)!,
  ]);
  const deleted = await c.query(
    "SELECT id FROM diary.memories WHERE deleted_at IS NOT NULL",
  );
  for (const row of deleted.rows) {
    const path = join(
      process.env.AUDIO_ROOT!,
      process.argv.at(-1)!,
      row.id,
      `${row.id}.wav`,
    );
    try {
      await access(path);
      throw Error("Deleted audio still present");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  const photos = await c.query(
    "SELECT id FROM diary.photos WHERE deleted_at IS NOT NULL",
  );
  for (const row of photos.rows) {
    try {
      await access(
        join(process.env.PHOTO_ROOT!, process.argv.at(-1)!, `${row.id}.jpg`),
      );
      throw Error("Deleted photo still present");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  const pending = await c.query(
    "SELECT count(*)::integer AS n FROM diary.purge_jobs WHERE done_at IS NULL",
  );
  if (pending.rows[0].n !== 0) throw Error("Purge jobs pending");
  console.log(
    `PASS physical purge: ${deleted.rowCount} audio, ${photos.rowCount} photos, no pending jobs.`,
  );
  await c.query("ROLLBACK");
} finally {
  c.release();
  await pool.end();
}
