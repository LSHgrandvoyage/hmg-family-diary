#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$repo_root/.tools/android-sdk}"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$repo_root/.tools/android-user}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"
if [[ ! -f "$ANDROID_AVD_HOME/hmg_pleos_arm64.ini" ]]; then
  echo 'This checkout has no hmg_pleos_arm64 AVD. Follow docs/evidence/g0-environment.md and the official Pleos setup guide.' >&2
  exit 1
fi
exec "$ANDROID_HOME/emulator/emulator" -avd hmg_pleos_arm64 -no-snapshot \
  -gpu "${HMG_EMULATOR_GPU:-host}" -no-metrics -crash-report-mode never -port 5580 "$@"
