import { afterEach, describe, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({ clients: [] as any[] }));
vi.mock("pg", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    Client: class extends EventEmitter {
      constructor() {
        super();
        state.clients.push(this);
      }
      async connect() {}
      async query() {}
      async end() {}
    },
  };
});
const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
afterEach(async () => {
  for (const r of readers.splice(0)) await r.cancel();
  vi.useRealTimers();
});
const decode = (v: Uint8Array | undefined) => new TextDecoder().decode(v);
async function subscribe(
  vault: string,
  authorize: () => Promise<void> = async () => {},
) {
  const { changeEvents } = await import("../src/server/change-events.ts");
  const response = await changeEvents(
    new Request("https://test/api/v1/events"),
    vault,
    authorize,
  );
  const reader = response.body!.getReader();
  readers.push(reader);
  expect(decode((await reader.read()).value)).toContain("event: ready");
  return reader;
}
describe("private SSE subscriptions", () => {
  test("a vault's notification cannot reach another family's stream", async () => {
    const a = await subscribe("vault-a"),
      b = await subscribe("vault-b");
    let delivered = false;
    const pending = b.read().then((r) => {
      delivered = true;
      return r;
    });
    state.clients.at(-1).emit("notification", { payload: "vault-a" });
    expect(decode((await a.read()).value)).toBe("event: changed\ndata: {}\n\n");
    await Promise.resolve();
    expect(delivered).toBe(false);
    state.clients.at(-1).emit("notification", { payload: "vault-b" });
    expect(decode((await pending).value)).toContain("event: changed");
  });
  test("revocation closes the stream and cancellation stops auth heartbeats", async () => {
    vi.useFakeTimers();
    const revoked = vi.fn(async () => {
      throw Error("revoked");
    });
    const a = await subscribe("revoked", revoked);
    await vi.advanceTimersByTimeAsync(20000);
    expect(decode((await a.read()).value)).toContain("event: unauthorized");
    expect((await a.read()).done).toBe(true);
    await vi.advanceTimersByTimeAsync(40000);
    expect(revoked).toHaveBeenCalledTimes(1);
    const active = vi.fn(async () => {}),
      b = await subscribe("cancelled", active);
    await b.cancel();
    await vi.advanceTimersByTimeAsync(40000);
    expect(active).not.toHaveBeenCalled();
  });
  test("LISTEN failure closes subscribers so reconnect can establish a new listener", async () => {
    const a = await subscribe("before-error");
    const count = state.clients.length;
    state.clients.at(-1).emit("error", Error("connection lost"));
    expect((await a.read()).done).toBe(true);
    await subscribe("after-error");
    expect(state.clients.length).toBe(count + 1);
  });
});
