import { randomUUID } from "node:crypto";
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryable = false,
  ) {
    super(code);
  }
}
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value))
    throw new HttpError(422, "INVALID_ID");
  return value.toLowerCase();
}
export function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new HttpError(422, "INVALID_REVISION");
  return value;
}
export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function errorResponse(error: unknown): Response {
  const e =
    error instanceof HttpError
      ? error
      : new HttpError(503, "SERVICE_UNAVAILABLE", true);
  return json(
    {
      error: { code: e.code, message: e.code, retryable: e.retryable },
      request_id: randomUUID(),
    },
    e.status,
  );
}
export type ByteRange = { start: number; end: number };
export function parseRange(
  header: string | null,
  size: number,
): ByteRange | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || (!m[1] && !m[2]) || !Number.isSafeInteger(size) || size <= 0)
    throw new HttpError(416, "INVALID_RANGE");
  let start: number;
  let end: number;
  if (!m[1]) {
    const suffix = Number(m[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0)
      throw new HttpError(416, "INVALID_RANGE");
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Number(m[2]) : size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start >= size ||
      end < start
    )
      throw new HttpError(416, "INVALID_RANGE");
    end = Math.min(end, size - 1);
  }
  return { start, end };
}
