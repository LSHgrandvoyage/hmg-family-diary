import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const c = await pool.connect();
try {
  await c.query("SELECT pg_advisory_lock(80261109)");
  await c.query(
    "CREATE TABLE IF NOT EXISTS diary.migrations(name text PRIMARY KEY,sha256 text NOT NULL)",
  );
  for (const name of (await readdir("db/migrations"))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(`db/migrations/${name}`, "utf8"),
      hash = createHash("sha256").update(sql).digest("hex");
    const previous = await c.query(
      "SELECT sha256 FROM diary.migrations WHERE name=$1",
      [name],
    );
    if (previous.rowCount) {
      if (previous.rows[0].sha256 !== hash)
        throw new Error("Migration checksum changed");
      continue;
    }
    await c.query("BEGIN");
    try {
      await c.query(sql);
      await c.query("INSERT INTO diary.migrations VALUES($1,$2)", [name, hash]);
      await c.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await c.query("SELECT pg_advisory_unlock(80261109)");
  c.release();
  await pool.end();
}
