import { mkdir, writeFile } from "node:fs/promises";
const rate = 16000,
  seconds = 8,
  b = Buffer.alloc(44 + rate * seconds * 2);
b.write("RIFF");
b.writeUInt32LE(b.length - 8, 4);
b.write("WAVEfmt ", 8);
b.writeUInt32LE(16, 16);
b.writeUInt16LE(1, 20);
b.writeUInt16LE(1, 22);
b.writeUInt32LE(rate, 24);
b.writeUInt32LE(rate * 2, 28);
b.writeUInt16LE(2, 32);
b.writeUInt16LE(16, 34);
b.write("data", 36);
b.writeUInt32LE(b.length - 44, 40);
for (let i = 0; i < rate * seconds; i++) {
  const hz = i < rate * 4 ? 330 : 440;
  const envelope = Math.min(1, (i % rate) / 800, (rate - (i % rate)) / 800);
  b.writeInt16LE(
    Math.round(Math.sin((i / rate) * hz * 2 * Math.PI) * 1800 * envelope),
    44 + i * 2,
  );
}
await mkdir("apps/web/public/demo", { recursive: true });
await writeFile("apps/web/public/demo/synthetic-signal.wav", b);
console.log(
  "Generated 8-second synthetic signal; not recorded speech or STT evidence.",
);
