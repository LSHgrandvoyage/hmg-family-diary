import { loadEnvFile } from "node:process";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
loadEnvFile(".env.runtime");
const adb = resolve(".tools/android-sdk/platform-tools/adb"),
  serial = process.env.ANDROID_SERIAL || "emulator-5580";
const user = execFileSync(
  adb,
  ["-s", serial, "shell", "am", "get-current-user"],
  { encoding: "utf8" },
).trim();
if (!/^\d+$/.test(user)) throw Error("Invalid Android user");
const put = (path: string, bytes: Buffer | string) =>
  execFileSync(
    adb,
    [
      "-s",
      serial,
      "shell",
      "run-as",
      "io.hmg.familydiary.probe",
      "--user",
      user,
      "sh",
      "-c",
      `"cat > files/${path}"`,
    ],
    { input: bytes, stdio: ["pipe", "ignore", "pipe"] },
  );
put("sync-origin.txt", process.env.APP_ORIGIN!);
put("sync-ca.crt", await readFile(".tools/runtime/local-ca.crt"));
console.log(
  "Configured emulator HTTPS origin and specific public CA. No diary or credentials uploaded.",
);
