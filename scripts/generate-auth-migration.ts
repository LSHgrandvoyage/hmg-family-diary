import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { getMigrations } from "better-auth/db/migration";
import { authOptions } from "../apps/web/src/server/auth-options.ts";
loadEnvFile(".env.runtime");
const pool = new Pool({
  connectionString: `postgresql://diary_migrate:${process.env.MIGRATION_DB_PASSWORD}@127.0.0.1:5449/diary`,
});
try {
  const migrations = await getMigrations(authOptions(pool));
  const sql = await migrations.compileMigrations();
  await writeFile(
    "db/migrations/0001_auth.sql",
    "-- Generated from installed Better Auth 1.7.18; UUID IDs; database rate limiting.\nSET LOCAL search_path TO auth, pg_catalog;\n" +
      sql,
  );
  console.log("Auth migration generated.");
} finally {
  await pool.end();
}
