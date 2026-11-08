import { afterEach, expect, it, vi } from "vitest";
import { createProbeServer } from "./probe-server.ts";
import { GenerationError, type DiaryGenerator } from "./generator.ts";
import fixture from "../../../tests/fixtures/freeform/E01.json";
const servers: ReturnType<typeof createProbeServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((r) => {
          s.closeAllConnections();
          s.close(() => r());
        }),
    ),
  );
});
async function server(generator: DiaryGenerator) {
  const s = createProbeServer("a".repeat(64), generator);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as { port: number }).port}/draft`;
}
const headers = {
  Authorization: `Bearer ${"a".repeat(64)}`,
  "Content-Type": "application/json",
};
it("blocks unauthorized requests and browser-origin traffic before generation", async () => {
  const generate = vi.fn();
  const url = await server({ generate });
  expect((await fetch(url, { method: "POST" })).status).toBe(401);
  expect(
    (
      await fetch(url, {
        method: "POST",
        headers: { ...headers, Origin: "https://attacker.invalid" },
      })
    ).status,
  ).toBe(401);
  expect(generate).not.toHaveBeenCalled();
});
it("returns an explicit unconfigured error without storing text or generating a fake diary", async () => {
  const url = await server({
    generate: async () => {
      throw new GenerationError("NOT_CONFIGURED");
    },
  });
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(fixture.input),
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "NOT_CONFIGURED" });
});
it("rejects malformed JSON and excessive payload before generation", async () => {
  const generate = vi.fn();
  const url = await server({ generate });
  expect(
    (await fetch(url, { method: "POST", headers, body: "{" })).status,
  ).toBe(400);
  expect(
    (await fetch(url, { method: "POST", headers, body: "x".repeat(260_000) }))
      .status,
  ).toBe(413);
  expect(generate).not.toHaveBeenCalled();
});
