import { loadEnvFile } from "node:process";
loadEnvFile(".env.runtime");
process.env.MIGRATION_DATABASE_URL = `postgresql://diary_migrate:${process.env.MIGRATION_DB_PASSWORD}@127.0.0.1:5449/diary`;
await import("./migrate.ts");
