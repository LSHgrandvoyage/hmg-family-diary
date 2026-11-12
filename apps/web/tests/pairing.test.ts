import { beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  random: vi.fn(),
}));
vi.mock("pg", () => ({
  Pool: class {
    query = fake.query;
    async connect() {
      return { query: fake.query, release: fake.release };
    }
  },
}));
vi.mock("../src/server/auth.ts", () => ({
  authentication: () => ({
    api: {
      getSession: async () => ({ user: { id: "owner", emailVerified: true } }),
    },
  }),
}));
vi.mock("node:crypto", async (original) => ({
  ...(await original<typeof import("node:crypto")>()),
  randomInt: fake.random,
}));
import { handleDomain, digest } from "../src/server/runtime.ts";
const ok = { rows: [], rowCount: 0 };
beforeEach(() => {
  process.env.APP_ORIGIN = "https://pair.test";
  fake.query.mockReset();
  fake.random.mockReset();
  fake.release.mockReset();
  fake.random.mockReturnValue(123);
  fake.query.mockImplementation(async (sql: string) => {
    if (sql.includes("allow_attempt"))
      return { rows: [{ ok: true }], rowCount: 1 };
    if (sql.includes("ensure_vault"))
      return { rows: [{ id: "vault" }], rowCount: 1 };
    if (sql.startsWith("INSERT INTO diary.pairings"))
      return { rows: [{ expires_at: "2099-01-01T00:05:00Z" }], rowCount: 1 };
    if (sql.includes("claim_pairing"))
      return { rows: [{ id: "device" }], rowCount: 1 };
    return ok;
  });
});
const call = (path: string, body: unknown = {}) =>
  handleDomain(
    new Request("https://pair.test/api/v1/" + path, {
      method: "POST",
      headers: {
        origin: "https://pair.test",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
it("issues a six digit string preserving leading zeroes, storing only its hash", async () => {
  const res = await call("pairings");
  expect(res.status).toBe(201);
  expect((await res.json()).code).toBe("000123");
  const insert = fake.query.mock.calls.find(([sql]) =>
    sql.startsWith("INSERT INTO diary.pairings"),
  )!;
  expect(insert[1]).toEqual(["vault", digest("000123")]);
  expect(insert[0]).toContain("interval '5 minutes'");
});
it("retries a globally conflicting code without replacing it", async () => {
  const original = fake.query.getMockImplementation()!;
  let insertions = 0;
  fake.random.mockReturnValueOnce(123).mockReturnValueOnce(456);
  fake.query.mockImplementation(async (sql, ...args) =>
    sql.startsWith("INSERT INTO diary.pairings") && ++insertions === 1
      ? ok
      : original(sql, ...args),
  );
  const res = await call("pairings");
  expect(res.status).toBe(201);
  expect((await res.json()).code).toBe("000456");
  expect(insertions).toBe(2);
});
it("bounds retries when no unused code is found", async () => {
  const original = fake.query.getMockImplementation()!;
  fake.query.mockImplementation(async (sql, ...args) =>
    sql.startsWith("INSERT INTO diary.pairings") ? ok : original(sql, ...args),
  );
  expect((await call("pairings")).status).toBe(503);
  expect(fake.random).toHaveBeenCalledTimes(10);
});
it("claims six digit codes without stripping leading zeroes", async () => {
  expect(
    (await call("devices/claim", { code: "000123", label: "합성 차" })).status,
  ).toBe(201);
  expect(
    fake.query.mock.calls.find(([sql]) => sql.includes("claim_pairing"))![1][0],
  ).toBe(digest("000123"));
});
it.each(["12345678", "12345", "12345a", 123456])(
  "rejects invalid or legacy input %s",
  async (code) => {
    expect(
      (await call("devices/claim", { code, label: "합성 차" })).status,
    ).toBe(422);
    expect(
      fake.query.mock.calls.some(([sql]) => sql.includes("claim_pairing")),
    ).toBe(false);
  },
);
it("keeps the claim rate limit ahead of code validation", async () => {
  fake.query.mockResolvedValue({ rows: [{ ok: false }], rowCount: 1 });
  expect(
    (await call("devices/claim", { code: "000123", label: "합성 차" })).status,
  ).toBe(429);
});
