import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Update only the address. Never recreate passwords, pairing, volumes, or records.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const readCommand = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
let host = process.argv[2];
if (!host) {
  const route = readCommand("/sbin/route", ["-n", "get", "default"]);
  const iface = route.match(/interface:\s*(\S+)/)?.[1];
  if (!iface)
    throw Error(
      "LAN 인터페이스를 찾지 못했어요. 명령 뒤에 LAN IPv4 주소를 지정해 주세요.",
    );
  try {
    host = readCommand("/usr/sbin/ipconfig", ["getifaddr", iface]);
  } catch {
    throw Error(
      "현재 네트워크에서 IPv4를 찾지 못했어요. 명령 뒤에 Wi-Fi의 LAN IPv4 주소를 지정해 주세요.",
    );
  }
}
if (isIP(host) !== 4 || host.startsWith("127.") || host === "0.0.0.0")
  throw Error("휴대폰에서 접속할 수 있는 Mac의 LAN IPv4 주소를 지정해 주세요.");
try {
  readCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
} catch {
  throw Error("OrbStack 또는 Docker Desktop을 먼저 실행해 주세요.");
}
let config = await readFile(".env.runtime", "utf8");
for (const key of ["APP_HOST", "APP_ORIGIN"]) {
  if (!new RegExp(`^${key}=`, "m").test(config))
    throw Error(
      `기존 .env.runtime에 ${key}가 없어요. 초기 설정을 확인해 주세요.`,
    );
}
const origin = `https://${host}:8443`;
config = config
  .replace(/^APP_HOST=.*$/m, `APP_HOST=${host}`)
  .replace(/^APP_ORIGIN=.*$/m, `APP_ORIGIN=${origin}`);
await writeFile(".env.runtime", config, { mode: 0o600 });
const env = { ...process.env, APP_HOST: host, APP_ORIGIN: origin };
const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { env, stdio: "inherit" });
const compose = ["compose", "--env-file", ".env.runtime", "--profile", "dev"];
run("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "60"]);
await mkdir(".tools/runtime", { recursive: true, mode: 0o700 });
run("docker", [
  ...compose,
  "cp",
  "proxy:/data/caddy/pki/authorities/local/root.crt",
  ".tools/runtime/local-ca.crt",
]);
const ca = await readFile(".tools/runtime/local-ca.crt");
async function healthy() {
  await new Promise<void>((resolve, reject) => {
    const req = request(
      origin + "/api/health",
      { ca, timeout: 4000 },
      (res) => {
        res.resume();
        res.statusCode === 200
          ? resolve()
          : reject(Error(`HTTPS 상태: ${res.statusCode}`));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(Error("HTTPS 연결 시간 초과")));
    req.end();
  });
}
for (let attempt = 0; ; attempt++) {
  try {
    await healthy();
    break;
  } catch (error) {
    if (attempt >= 9) throw error;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
console.log(
  `\n모바일: ${origin}/library\n인증서 설치 안내: http://${host}:8080/`,
);
const adb = resolve(".tools/android-sdk/platform-tools/adb"),
  serial = process.env.ANDROID_SERIAL || "emulator-5580";
let ready = false;
try {
  ready =
    readCommand(adb, [
      "-s",
      serial,
      "shell",
      "getprop",
      "sys.boot_completed",
    ]) === "1";
} catch {}
if (ready) {
  run(process.execPath, ["--import", "tsx", "scripts/connect-runtime.ts"]);
  let mockReady = false;
  try {
    const mode = (await readFile(".tools/probe/mode", "utf8")).trim();
    if (mode === "mock") {
      const token = (await readFile(".tools/probe/token", "utf8")).trim();
      const response = await fetch("http://127.0.0.1:4319/health", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(2000),
      });
      mockReady =
        response.status === 404 &&
        (await response.json()).error === "NOT_FOUND";
    }
  } catch {}
  if (mockReady) run("bash", ["scripts/connect-diary-probe.sh"]);
  else
    console.log(
      "목업 생성도 사용하려면 다른 터미널에서 DIARY_GENERATOR=mock pnpm probe:server 실행 후 이 명령을 다시 실행하세요.",
    );
  const user = readCommand(adb, [
    "-s",
    serial,
    "shell",
    "am",
    "get-current-user",
  ]);
  if (!/^\d+$/.test(user)) throw Error("Android 사용자 확인 실패");
  run(adb, [
    "-s",
    serial,
    "shell",
    "am",
    "start",
    "--user",
    user,
    "-n",
    "io.hmg.familydiary.probe/io.hmg.familydiary.MainActivity",
  ]);
  console.log(
    "차량 HTTPS 주소/인증서 갱신 완료. 기존 연결과 기록은 유지했어요.",
  );
} else {
  console.log(
    "서버 준비 완료. 다른 터미널에서 ./scripts/run-vehicle-emulator.sh -allow-host-audio 실행 후, 부팅이 끝나면 이 명령을 다시 실행해 주세요.",
  );
}
