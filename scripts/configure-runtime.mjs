// Default Mac/runtime Compose -> contest APK. Node 24 built-ins; no private keys/tokens.
import { spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [serial = process.env.ANDROID_SERIAL || "emulator-5580", adbArg] =
  process.argv.slice(2);
const childEnv = { ...process.env };
function exec(bin, args) {
  const r = spawnSync(bin, args, {
    cwd: root,
    env: childEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  if (r.error || r.status !== 0)
    throw Error(
      `${bin} ${args[0]} 실행 실패. Docker/에뮬레이터 상태를 확인하세요. 설정·인증정보 출력은 생략합니다.`,
    );
  return r.stdout;
}
try {
  if (!/^emulator-\d+$/.test(serial))
    throw Error("adb devices에 표시된 emulator-번호를 지정하세요.");
  const envPath = join(root, ".env.runtime");
  if (!existsSync(envPath))
    throw Error(
      "기본 서버의 .env.runtime이 없어요. 팀 서버는 team-test.mjs configure-release를 사용하세요.",
    );
  const config = parseEnv(readFileSync(envPath, "utf8"));
  // Compose must read this file, not credentials or addresses inherited from another stack.
  for (const key of [
    ...Object.keys(config),
    "COMPOSE_PROFILES",
    "COMPOSE_PROJECT_NAME",
    "COMPOSE_FILE",
  ])
    delete childEnv[key];
  const origin = new URL(config.APP_ORIGIN);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    origin.hostname !== config.APP_HOST
  )
    throw Error(".env.runtime의 APP_HOST/APP_ORIGIN을 확인하세요.");
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    join(root, ".tools/android-sdk");
  const adb =
    adbArg ||
    join(
      sdk,
      "platform-tools",
      process.platform === "win32" ? "adb.exe" : "adb",
    );
  const user = exec(adb, [
    "-s",
    serial,
    "shell",
    "am",
    "get-current-user",
  ]).trim();
  if (!/^\d+$/.test(user)) throw Error("Android 활성 사용자 확인 실패");
  if (
    !exec(adb, [
      "-s",
      serial,
      "shell",
      "pm",
      "path",
      "--user",
      user,
      "io.hmg.familydiary.contest",
    ])
      .trim()
      .startsWith("package:")
  )
    throw Error("차곡차곡 제출용 APK를 먼저 설치하세요.");
  const dir = join(root, ".tools/runtime");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const caPath = join(dir, "local-ca.crt");
  exec("docker", [
    "compose",
    "--env-file",
    ".env.runtime",
    "-f",
    "compose.yaml",
    "-p",
    "hmg-family-diary",
    "--profile",
    "dev",
    "cp",
    "proxy:/data/caddy/pki/authorities/local/root.crt",
    caPath,
  ]);
  const pem = readFileSync(caPath, "utf8");
  const cert = new X509Certificate(pem);
  if (
    pem.includes("PRIVATE KEY") ||
    !cert.ca ||
    Date.now() < Date.parse(cert.validFrom) ||
    Date.now() > Date.parse(cert.validTo)
  )
    throw Error("유효한 공개 CA 인증서가 필요해요.");
  await new Promise((ok, no) => {
    const req = request(
      new URL("/api/health", origin),
      { ca: pem, timeout: 8000 },
      (res) => {
        res.resume();
        res.statusCode === 200
          ? ok()
          : no(Error("서버 health 응답을 확인하세요."));
      },
    );
    req.on("error", () =>
      no(Error("HTTPS 검증 실패: 현재 IP/서버 주소와 인증서를 확인하세요.")),
    );
    req.on("timeout", () => req.destroy(Error("서버 연결 시간 초과")));
    req.end();
  });
  const settings = JSON.stringify({
    schema_version: 1,
    origin: origin.origin,
    ca_pem: pem,
  });
  writeFileSync(join(dir, "chagok-server.json"), settings + "\n", {
    mode: 0o600,
  });
  const encoded = Buffer.from(settings).toString("base64");
  exec(adb, [
    "-s",
    serial,
    "shell",
    "am",
    "start",
    "--user",
    user,
    "-f",
    "0x24000000",
    "-n",
    "io.hmg.familydiary.contest/io.hmg.familydiary.MainActivity",
    "--es",
    "chagok_server_config",
    encoded,
  ]);
  console.log(
    `기본 서버 HTTPS 확인: ${origin.origin}\n차량에 서버 설정 확인을 요청했어요. 주차·유휴 상태에서 주소를 확인하고 '설정 적용'을 누르세요.\n휴대폰: ${origin.origin}/library\n이후 휴대폰에서 새 6자리 코드를 발급해 차량에 입력하세요. 기존에 연결되어 있으면 재연결할 필요 없어요.\n확인창이 없으면 녹음·재생·편집을 마친 뒤 다시 실행하세요. 주소/공개 CA만 전달했으며 가족 연결 완료를 뜻하지 않습니다.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
