// Windows PowerShell/macOS: Node 24 built-ins only. No npm installation required.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isIP } from "node:net";
import { request } from "node:https";
import { parseEnv } from "node:util";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const [command, arg, adbArg] = process.argv.slice(2);
const envFile = ".env.team";
const base = [
  "compose",
  "--env-file",
  envFile,
  "-f",
  "compose.team.yaml",
  "-p",
  "hmg-family-diary-team",
];
// Deliberately do not inherit APP_HOST/passwords from another running development stack.
const childEnv = { ...process.env };
for (const k of [
  "APP_HOST",
  "APP_ORIGIN",
  "RUNTIME_BIND",
  "POSTGRES_PASSWORD",
  "APP_DB_PASSWORD",
  "AUTH_DB_PASSWORD",
  "MIGRATION_DB_PASSWORD",
  "BETTER_AUTH_SECRET",
  "COMPOSE_PROFILES",
  "COMPOSE_PROJECT_NAME",
])
  delete childEnv[k];
function exec(bin, args, { capture = false, input } = {}) {
  const r = spawnSync(bin, args, {
    cwd: root,
    env: childEnv,
    input,
    encoding: "utf8",
    stdio:
      capture || input !== undefined ? ["pipe", "pipe", "pipe"] : "inherit",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.error || r.status !== 0)
    throw Error(
      `${bin} ${args[0]} failed. Check Docker Desktop / selected emulator / installed APK. Credential output is suppressed.`,
    );
  return r.stdout || "";
}
const docker = (args, opts) => exec("docker", [...base, ...args], opts);
function host(value) {
  if (typeof value !== "string" || isIP(value) !== 4 || value === "0.0.0.0")
    throw Error(
      "Pass the Windows LAN IPv4 (ipconfig). Use 127.0.0.1 only for same-PC web tests.",
    );
  return value;
}
function config() {
  if (!existsSync(envFile)) throw Error("Run init <LAN-IPv4> first.");
  return parseEnv(readFileSync(envFile, "utf8"));
}
function urls(c) {
  console.log(
    `Web: ${c.APP_ORIGIN}/library\nPublic development CA: http://${c.APP_HOST}:18080/local-ca.crt\nVerification mail (this PC only): http://localhost:18025`,
  );
}
function ca() {
  mkdirSync(".tools/team", { recursive: true });
  docker([
    "cp",
    "proxy:/data/caddy/pki/authorities/local/root.crt",
    ".tools/team/local-ca.crt",
  ]);
}
async function healthy(c) {
  await new Promise((ok, no) => {
    const req = request(
      c.APP_ORIGIN + "/api/health",
      { ca: readFileSync(".tools/team/local-ca.crt"), timeout: 8000 },
      (res) => {
        res.resume();
        res.statusCode === 200 ? ok() : no(Error("HTTPS health check failed"));
      },
    );
    req.on("error", no);
    req.on("timeout", () =>
      req.destroy(Error("HTTPS timed out: check IP / Windows firewall")),
    );
    req.end();
  });
}
try {
  if (command === "init") {
    const ip = host(arg);
    if (existsSync(envFile))
      throw Error(".env.team already exists; use address to preserve secrets.");
    const c = {
      APP_HOST: ip,
      APP_ORIGIN: `https://${ip}:18443`,
      RUNTIME_BIND: "0.0.0.0",
    };
    for (const k of [
      "POSTGRES_PASSWORD",
      "APP_DB_PASSWORD",
      "AUTH_DB_PASSWORD",
      "MIGRATION_DB_PASSWORD",
      "BETTER_AUTH_SECRET",
    ])
      c[k] = randomBytes(32).toString("hex");
    writeFileSync(
      envFile,
      Object.entries(c)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
      { flag: "wx", mode: 0o600 },
    );
    urls(c);
  } else if (command === "address") {
    const c = config(),
      ip = host(arg);
    c.APP_HOST = ip;
    c.APP_ORIGIN = `https://${ip}:18443`;
    writeFileSync(
      envFile,
      Object.entries(c)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    console.log(
      "Address updated; run up, then connect again. Existing passwords/data preserved.",
    );
  } else if (command === "up") {
    const c = config();
    exec("docker", ["info", "--format", "{{.OSType}}"], { capture: true });
    docker([
      "up",
      "-d",
      arg === "--no-build" ? "--no-build" : "--build",
      "--wait",
      "--wait-timeout",
      "120",
    ]);
    ca();
    await healthy(c);
    urls(c);
  } else if (command === "check") {
    const c = config();
    ca();
    await healthy(c);
    docker(["ps"]);
    urls(c);
  } else if (command === "stop") {
    config();
    docker(["stop"]);
    console.log("Team containers stopped. Volumes and records preserved.");
  } else if (command === "connect") {
    const c = config();
    if (!arg || !/^emulator-\d+$/.test(arg))
      throw Error(
        "Specify the running Pleos emulator serial, e.g. emulator-5554.",
      );
    const sdk =
      process.env.ANDROID_HOME ||
      process.env.ANDROID_SDK_ROOT ||
      (process.platform === "win32" && process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, "Android", "Sdk")
        : resolve(".tools/android-sdk"));
    const adb =
      adbArg ||
      join(
        sdk,
        "platform-tools",
        process.platform === "win32" ? "adb.exe" : "adb",
      );
    const a = (args, opts) => exec(adb, ["-s", arg, ...args], opts);
    if (
      a(["shell", "getprop", "sys.boot_completed"], {
        capture: true,
      }).trim() !== "1"
    )
      throw Error("Wait for emulator cold boot.");
    const user = a(["shell", "am", "get-current-user"], {
      capture: true,
    }).trim();
    if (!/^\d+$/.test(user)) throw Error("Invalid Android user.");
    ca();
    await healthy(c);
    const token = docker(["exec", "-T", "mock", "cat", "/data/probe/token"], {
      capture: true,
    }).trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw Error("Mock token not ready.");
    console.log(
      "Restarting the selected test app to reload server configuration.",
    );
    a([
      "shell",
      "am",
      "force-stop",
      "--user",
      user,
      "io.hmg.familydiary.probe",
    ]);
    a([
      "shell",
      "run-as",
      "io.hmg.familydiary.probe",
      "--user",
      user,
      "mkdir",
      "-p",
      "files",
    ]);
    const put = (name, input) =>
      a(
        [
          "shell",
          "run-as",
          "io.hmg.familydiary.probe",
          "--user",
          user,
          "sh",
          "-c",
          `"cat > files/${name}"`,
        ],
        { input },
      );
    put("sync-origin.txt", c.APP_ORIGIN);
    put("sync-ca.crt", readFileSync(".tools/team/local-ca.crt"));
    put("diary-probe-token", token);
    put("diary-probe-mode", "mock");
    a(["reverse", "tcp:4319", "tcp:14319"]);
    a([
      "shell",
      "am",
      "start",
      "--user",
      user,
      "-n",
      "io.hmg.familydiary.probe/io.hmg.familydiary.MainActivity",
    ]);
    console.log(
      "Team emulator connected. No source recordings or developer credentials copied.",
    );
  } else {
    console.log(
      "node scripts/team-test.mjs init <LAN-IPv4>\nnode scripts/team-test.mjs up [--no-build]\nnode scripts/team-test.mjs connect <emulator-serial> [adb-path]\nnode scripts/team-test.mjs check\nnode scripts/team-test.mjs address <new-LAN-IPv4>\nnode scripts/team-test.mjs stop",
    );
    if (command) process.exitCode = 1;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
