import { Client } from "pg";
import { HttpError } from "../../../../packages/contracts/src/http.ts";

type Subscriber = { vault: string; send: () => void; close: () => void };
const subscribers = new Set<Subscriber>();
let listening: Promise<Client> | undefined;
// One LISTEN connection per server process, separate from transactional pool.
function listener() {
  return (listening ??= (async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    const failed = () => {
      listening = undefined;
      for (const sub of [...subscribers]) sub.close();
      void c.end().catch(() => {});
    };
    c.on("error", failed);
    c.on("notification", (n) => {
      for (const sub of subscribers) if (sub.vault === n.payload) sub.send();
    });
    try {
      await c.connect();
      await c.query("LISTEN diary_changed");
      return c;
    } catch (e) {
      failed();
      throw e;
    }
  })());
}

/** Notifications are hints; durable /sync cursors recover every missed change. */
export async function changeEvents(
  req: Request,
  vault: string,
  authorize: () => Promise<void>,
) {
  if (
    subscribers.size >= 200 ||
    [...subscribers].filter((s) => s.vault === vault).length >= 8
  )
    throw new HttpError(429, "RATE_LIMITED");
  await listener();
  let finish = () => {};
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        let closed = false,
          checking = false;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const send = (data: string) => {
          if (closed) return;
          // Bound slow clients instead of buffering an unbounded event queue.
          if ((controller.desiredSize ?? 0) <= 0) {
            finish();
            return;
          }
          controller.enqueue(encoder.encode(data));
        };
        const sub: Subscriber = {
          vault,
          send: () => send("event: changed\ndata: {}\n\n"),
          close: () => finish(),
        };
        finish = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          subscribers.delete(sub);
          req.signal.removeEventListener("abort", finish);
          try {
            controller.close();
          } catch {
            /* Stream consumer already cancelled. */
          }
        };
        subscribers.add(sub);
        req.signal.addEventListener("abort", finish, { once: true });
        if (req.signal.aborted) {
          finish();
          return;
        }
        // Subscribe BEFORE ready: concurrent commits are never lost between initial pull and LISTEN.
        send("event: ready\ndata: {}\n\n");
        heartbeat = setInterval(async () => {
          if (closed || checking) return;
          checking = true;
          try {
            await authorize();
            send(": heartbeat\n\n");
          } catch {
            send("event: unauthorized\ndata: {}\n\n");
            finish();
          } finally {
            checking = false;
          }
        }, 20000);
      },
      cancel() {
        finish();
      },
    },
    { highWaterMark: 16 },
  );
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
