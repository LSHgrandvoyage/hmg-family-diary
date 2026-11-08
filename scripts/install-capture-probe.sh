#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
sdk_root="${ANDROID_HOME:-$repo_root/.tools/android-sdk}"
serial="${ANDROID_SERIAL:-emulator-5580}"
"$repo_root/scripts/vehicle-gradle.sh" :app:assembleProbeDebug
if [[ "$("$sdk_root/platform-tools/adb" -s "$serial" shell getprop sys.boot_completed | tr -d '\r')" != "1" ]]; then
  echo 'Start the Pleos emulator and wait for boot before installing the probe.' >&2
  exit 1
fi
"$sdk_root/platform-tools/adb" -s "$serial" install -r "$repo_root/apps/vehicle/app/build/outputs/apk/probe/debug/app-probe-debug.apk"
"$sdk_root/platform-tools/adb" -s "$serial" shell am start -W -n io.hmg.familydiary.probe/io.hmg.familydiary.MainActivity
