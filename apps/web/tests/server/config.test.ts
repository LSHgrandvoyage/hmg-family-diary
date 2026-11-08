import { expect, it } from "vitest";
import { runtimeConfig } from "../../src/server/config";
const valid = {
  APP_ORIGIN: "https://diary.example.test",
  BETTER_AUTH_URL: "https://diary.example.test",
  BETTER_AUTH_SECRET: "a".repeat(32),
  AUDIO_STORE: "local",
  AUDIO_ROOT: "/data/audio",
  DATABASE_URL: "postgresql://domain@db/diary",
  AUTH_DATABASE_URL: "postgresql://auth@db/diary",
};
it("validates the server-only deployment boundary", () =>
  expect(runtimeConfig(valid).origin).toBe(valid.APP_ORIGIN));
it.each([
  { ...valid, APP_ORIGIN: "http://diary.example.test" },
  { ...valid, BETTER_AUTH_URL: "https://other.example.test" },
  { ...valid, BETTER_AUTH_SECRET: "" },
  { ...valid, DATABASE_URL: "" },
  { ...valid, NEXT_PUBLIC_DATABASE_URL: "postgresql://private" },
  { ...valid, AUDIO_STORE: "public" },
])("rejects unsafe or missing server settings", (env) =>
  expect(() => runtimeConfig(env)).toThrow(),
);
