import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { LocalAudioStore } from "./local-audio-store";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
function wav(tone = 0) {
  const b = Buffer.alloc(44 + 32000, tone);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(32000, 40);
  return b;
}
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
async function* stream(b: Buffer) {
  yield b.subarray(0, 40);
  yield b.subarray(40);
}
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "diary-audio-"));
  roots.push(root);
  return {
    root,
    store: new LocalAudioStore(root),
    key: {
      vaultId: randomUUID(),
      sessionId: randomUUID(),
      chunkId: randomUUID(),
    },
  };
}
describe("private immutable audio", () => {
  it("stores exact bytes, reads ranges, retries and deletes idempotently", async () => {
    const { store, key } = await setup();
    const b = wav();
    expect(await store.putImmutable(key, stream(b), sha(b))).toMatchObject({
      bytes: b.length,
      durationMs: 1000,
    });
    await store.putImmutable(key, stream(b), sha(b));
    expect(await store.readRange(key, { start: 35, end: 50 })).toEqual(
      b.subarray(35, 51),
    );
    expect(await store.readRange(key, null)).toEqual(b);
    await store.delete(key);
    await store.delete(key);
    await expect(store.stat(key)).rejects.toThrow();
  });
  it("serializes competing immutable publications", async () => {
    const { store, key } = await setup();
    const results = await Promise.allSettled(
      [0, 1].map((n) => {
        const b = wav(n);
        return store.putImmutable(key, stream(b), sha(b));
      }),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
  });
  it("rejects corrupt checksum and leaves no temporary file", async () => {
    const { store, key, root } = await setup();
    await expect(
      store.putImmutable(key, stream(wav()), "0".repeat(64)),
    ).rejects.toThrow("CHECKSUM_MISMATCH");
    expect(await readdir(join(root, key.vaultId, key.sessionId))).toEqual([]);
  });
  it("rejects interrupted uploads without publishing", async () => {
    const { store, key } = await setup();
    async function* broken() {
      yield wav().subarray(0, 20);
      throw new Error("disconnected");
    }
    await expect(store.putImmutable(key, broken(), sha(wav()))).rejects.toThrow(
      "disconnected",
    );
    await expect(store.stat(key)).rejects.toThrow();
  });
  it("enforces byte limit and WAV structure", async () => {
    const { store, key, root } = await setup();
    await expect(
      new LocalAudioStore(root, 64).putImmutable(
        key,
        stream(wav()),
        sha(wav()),
      ),
    ).rejects.toThrow("AUDIO_TOO_LARGE");
    const b = Buffer.from("not audio");
    await expect(store.putImmutable(key, stream(b), sha(b))).rejects.toThrow(
      "INVALID_WAV",
    );
  });
  it("rejects directory symlinks and path escape", async () => {
    const { root, store, key } = await setup();
    const target = await mkdtemp(join(tmpdir(), "diary-outside-"));
    roots.push(target);
    await symlink(target, join(root, key.vaultId));
    await expect(
      store.putImmutable(key, stream(wav()), sha(wav())),
    ).rejects.toThrow("UNSAFE_STORAGE_PATH");
    await expect(
      store.stat({ ...key, vaultId: "../../outside" }),
    ).rejects.toThrow("INVALID_ID");
    expect(await readdir(target)).toEqual([]);
  });
  it("rejects invalid ranges", async () => {
    const { store, key } = await setup();
    await store.putImmutable(key, stream(wav()), sha(wav()));
    await expect(
      store.readRange(key, { start: 0, end: 999999 }),
    ).rejects.toThrow("INVALID_RANGE");
  });
});
