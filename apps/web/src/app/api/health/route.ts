export function GET() {
  return Response.json(
    { status: "ok", mode: "synthetic-preview", capture_enabled: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
