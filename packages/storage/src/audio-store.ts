export type AudioKey = { vaultId: string; sessionId: string; chunkId: string };
export type AudioMetadata = {
  bytes: number;
  sha256: string;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationMs: number;
};
export interface AudioStore {
  putImmutable(
    key: AudioKey,
    source: AsyncIterable<Uint8Array>,
    expectedSha256: string,
  ): Promise<AudioMetadata>;
  stat(key: AudioKey): Promise<{ bytes: number }>;
  readRange(
    key: AudioKey,
    range: { start: number; end: number } | null,
  ): Promise<Buffer>;
  delete(key: AudioKey): Promise<void>;
}
