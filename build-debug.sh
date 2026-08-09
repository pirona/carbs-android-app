#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# build-debug.sh — web build + Capacitor sync + debug APK, JDK/SDK auto-detected.
#
# Usage: ./build-debug.sh   →  android/app/build/outputs/apk/debug/app-debug.apk

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[build]${NC} $*"; }
abort() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ─── Java: Gradle 8.x needs <=24, system JDK on this machine is newer ──────
if [ -z "${JAVA_HOME:-}" ] || "$JAVA_HOME/bin/java" -version 2>&1 | grep -qE '"(2[5-9]|[3-9][0-9])\.'; then
  if [ -d "$HOME/jdk21" ]; then
    export JAVA_HOME="$HOME/jdk21"
    export PATH="$JAVA_HOME/bin:$PATH"
    info "Using local JDK 21: $JAVA_HOME"
  else
    abort "Java 25+ detected but Gradle only supports <=24.\nInstall JDK 21 and set JAVA_HOME."
  fi
fi
info "Java: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"

# ─── Android SDK ────────────────────────────────────────────────────────────
if [ -z "${ANDROID_HOME:-}" ]; then
  for candidate in "$HOME/android-sdk" "$HOME/Android/Sdk" "/opt/android-sdk"; do
    if [ -d "$candidate/platform-tools" ]; then
      export ANDROID_HOME="$candidate"
      break
    fi
  done
fi
[ -z "${ANDROID_HOME:-}" ] && abort "Android SDK not found. Set ANDROID_HOME."
export PATH="$PATH:$ANDROID_HOME/platform-tools"
info "Android SDK: $ANDROID_HOME"

cd "$SCRIPT_DIR"
info "Building web assets…"
npm run build

info "Syncing into Android project…"
npx cap sync android

cd android
chmod +x gradlew
info "Building debug APK…"
./gradlew assembleDebug --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
info "Build complete!"
echo -e "  ${GREEN}→ $SCRIPT_DIR/android/$APK${NC}"
