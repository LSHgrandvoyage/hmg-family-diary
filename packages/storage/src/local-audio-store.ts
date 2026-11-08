import { constants } from "node:fs";
import { mkdir, open, link, unlink, lstat, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { HttpError, uuid } from "../../contracts/src/http";
import type { AudioStore, AudioKey, AudioMetadata } from "./audio-store";

export function inspectWav(
  data: Buffer,
): Omit<AudioMetadata, "sha256" | "bytes"> {
  const invalid = () => new HttpError(422, "INVALID_WAV");
  if (
    data.length < 44 ||
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WAVE" ||
    data.readUInt32LE(4) !== data.length - 8
  )
    throw invalid();
  let format:
    | {
        sampleRate: number;
        channels: number;
        bitsPerSample: number;
        align: number;
      }
    | undefined;
  let payload = 0;
  let dataChunks = 0;
  let offset = 12;
  while (offset + 8 <= data.length) {
    const id = data.toString("ascii", offset, offset + 4);
    const length = data.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > data.length) throw invalid();
    if (id === "fmt ") {
      if (format || length < 16 || data.readUInt16LE(start) !== 1)
        throw invalid();
      const channels = data.readUInt16LE(start + 2),
        sampleRate = data.readUInt32LE(start + 4),
        bitsPerSample = data.readUInt16LE(start + 14),
        align = data.readUInt16LE(start + 12);
      if (
        ![1, 2].includes(channels) ||
        ![16000, 24000, 44100, 48000].includes(sampleRate) ||
        bitsPerSample !== 16 ||
        align !== channels * 2 ||
        data.readUInt32LE(start + 8) !== sampleRate * align
      )
        throw invalid();
      format = { channels, sampleRate, bitsPerSample, align };
    }
    if (id === "data") {
      payload = length;
      dataChunks++;
    }
    offset = start + length + (length % 2);
  }
  if (
    offset !== data.length ||
    !format ||
    dataChunks !== 1 ||
    !payload ||
    payload % format.align
  )
    throw invalid();
  return {
    sampleRate: format.sampleRate,
    channels: format.channels,
    bitsPerSample: format.bitsPerSample,
    durationMs: (payload / format.align / format.sampleRate) * 1000,
  };
}
/** Caller holds the session DB lock and checks tombstones before publish/delete. This adapter never owns authorization. */
export class LocalAudioStore implements AudioStore {
  private root: string;
  constructor(
    root: string,
    private maxBytes = 8 * 1024 * 1024,
  ) {
    this.root = resolve(root);
  }
  private async location(key: AudioKey, create = false): Promise<string> {
    const parts = [uuid(key.vaultId), uuid(key.sessionId)];
    const chunk = uuid(key.chunkId);
    if (create) await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await lstat(this.root)).isSymbolicLink())
      throw new HttpError(422, "UNSAFE_STORAGE_PATH");
    this.root = await realpath(this.root);
    let dir = this.root;
    for (const part of parts) {
      dir = join(dir, part);
      if (create)
        await mkdir(dir, { mode: 0o700 }).catch((e) => {
          if (e.code !== "EEXIST") throw e;
        });
      const s = await lstat(dir);
      if (s.isSymbolicLink() || !s.isDirectory())
        throw new HttpError(422, "UNSAFE_STORAGE_PATH");
    }
    return join(dir, `${chunk}.wav`);
  }
  async putImmutable(
    key: AudioKey,
    source: AsyncIterable<Uint8Array>,
    expectedSha256: string,
  ): Promise<AudioMetadata> {
    if (!/^[a-f0-9]{64}$/.test(expectedSha256))
      throw new HttpError(422, "INVALID_CHECKSUM");
    const path = await this.location(key, true),
      temp = `${path}.${randomUUID()}.tmp`;
    const file = await open(
      temp,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    let bytes = 0;
    const hash = createHash("sha256");
    try {
      for await (const chunk of source) {
        bytes += chunk.length;
        if (bytes > this.maxBytes) throw new HttpError(413, "AUDIO_TOO_LARGE");
        hash.update(chunk);
        await file.writeFile(chunk);
      }
      const sha256 = hash.digest("hex");
      if (sha256 !== expectedSha256)
        throw new HttpError(422, "CHECKSUM_MISMATCH");
      await file.sync();
      await file.close();
      const read = await open(temp, constants.O_RDONLY | constants.O_NOFOLLOW);
      let buffer: Buffer;
      try {
        buffer = await read.readFile();
      } finally {
        await read.close();
      }
      const format = inspectWav(buffer);
      // A hard link publishes atomically without overwriting an existing immutable object.
      try {
        await link(temp, path);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        const existing = await open(
          path,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          if (
            createHash("sha256")
              .update(await existing.readFile())
              .digest("hex") !== sha256
          )
            throw new HttpError(409, "IMMUTABLE_CONFLICT");
        } finally {
          await existing.close();
        }
      }
      return { ...format, bytes, sha256 };
    } finally {
      await file.close().catch(() => {});
      await unlink(temp).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    }
  }
  async stat(key: AudioKey) {
    const f = await open(
      await this.location(key),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      return { bytes: (await f.stat()).size };
    } finally {
      await f.close();
    }
  }
  async readRange(key: AudioKey, range: { start: number; end: number } | null) {
    const f = await open(
      await this.location(key),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const size = (await f.stat()).size;
      const r = range ?? { start: 0, end: size - 1 };
      if (
        !Number.isSafeInteger(r.start) ||
        !Number.isSafeInteger(r.end) ||
        r.start < 0 ||
        r.end < r.start ||
        r.end >= size
      )
        throw new HttpError(416, "INVALID_RANGE");
      const b = Buffer.alloc(r.end - r.start + 1);
      let total = 0;
      while (total < b.length) {
        const { bytesRead } = await f.read(
          b,
          total,
          b.length - total,
          r.start + total,
        );
        if (!bytesRead) throw new HttpError(503, "AUDIO_INCOMPLETE", true);
        total += bytesRead;
      }
      return b;
    } finally {
      await f.close();
    }
  }
  async delete(key: AudioKey) {
    try {
      await unlink(await this.location(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
}
