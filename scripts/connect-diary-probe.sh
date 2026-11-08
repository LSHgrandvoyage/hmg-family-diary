#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
adb="${ANDROID_HOME:-$repo_root/.tools/android-sdk}/platform-tools/adb"
serial="${ANDROID_SERIAL:-emulator-5580}"
token_file="$repo_root/.tools/probe/token"
if [[ ! -f "$token_file" ]]; then echo 'Run pnpm probe:server first.' >&2; exit 1; fi
user_id="$("$adb" -s "$serial" shell am get-current-user | tr -d '\r')"
[[ "$user_id" =~ ^[0-9]+$ ]] || exit 1
"$adb" -s "$serial" reverse tcp:4319 tcp:4319
# Only the local bench credential; the provider key never enters the APK/device.
"$adb" -s "$serial" shell run-as io.hmg.familydiary.probe --user "$user_id" sh -c '"cat > files/diary-probe-token"' < "$token_file"
echo 'Connected emulator to local diary probe. No recordings transferred.'
