import { Pool } from "pg";
let pool: Pool;
export async function GET() {
  if (!process.env.DATABASE_URL)
    return Response.json(
      { status: "ok", mode: "synthetic-preview", capture_enabled: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    pool ??= new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 2000,
    });
    await pool.query("SELECT 1");
    return Response.json(
      { status: "ok", mode: "connected-prototype", generation_mode: "mock" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
