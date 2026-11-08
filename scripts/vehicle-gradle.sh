#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$repo_root/.tools/android-sdk}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$repo_root/.tools/gradle}"
if [[ -z "${JAVA_HOME:-}" && -x /usr/libexec/java_home ]]; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
fi
cd "$repo_root/apps/vehicle"
exec ./gradlew "$@"
