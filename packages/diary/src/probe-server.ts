import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  GenerationError,
  generationInput,
  type DiaryGenerator,
} from "./generator.ts";

/** Local emulator bench only. No cookies, CORS, durable jobs, disk transcripts or public listener. */
export function createProbeServer(token: string, generator: DiaryGenerator) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("INVALID_PROBE_TOKEN");
  let busy = false;
  return createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      if (!res.destroyed) {
        res.writeHead(status, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(body));
      }
    };
    const supplied = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      req.headers.origin ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      reply(401, { error: "UNAUTHORIZED" });
      return;
    }
    if (req.method !== "POST" || req.url !== "/draft") {
      reply(404, { error: "NOT_FOUND" });
      return;
    }
    if (req.headers["content-type"] !== "application/json") {
      reply(415, { error: "INVALID_CONTENT_TYPE" });
      return;
    }
    if (busy) {
      reply(409, { error: "BUSY" });
      return;
    }
    busy = true;
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    const timer = setTimeout(() => {
      abort.abort();
      reply(408, { error: "TIMEOUT" });
      req.destroy();
    }, 100_000);
    try {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 250_000) {
          reply(413, { error: "INPUT_TOO_LARGE" });
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        reply(400, { error: "INVALID_INPUT" });
        return;
      }
      const input = generationInput(parsed);
      reply(200, await generator.generate(input, abort.signal));
    } catch (error) {
      const code =
        error instanceof GenerationError ? error.code : "INTERNAL_ERROR";
      reply(
        code === "INVALID_INPUT" ? 400 : code === "NOT_CONFIGURED" ? 503 : 502,
        { error: code },
      );
    } finally {
      clearTimeout(timer);
      busy = false;
    }
  });
}
