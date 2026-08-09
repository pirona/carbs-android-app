# Carbs

Android app (Capacitor) for personal nutrition/carb-cycling tracking — calorie deficit,
macros, day-type detection (HIGH/MEDIUM/LOW), and photo-based food logging.

Replaces a Home Assistant/Lovelace-hosted prototype (`carb-cycling.html`, `food-habits.html`,
`menus.html` in the `carbs-home-assistant` repo). Personal-use project, not commercial software.

## License

GNU General Public License v3.0 or later — see [LICENSE](LICENSE).

Every source file should carry an SPDX header:

```ts
// SPDX-License-Identifier: GPL-3.0-or-later
```

## Development

```bash
npm install
npm run dev          # web dev server
npm run build         # web build -> dist/
npm test              # unit tests (vitest)
npx cap sync android  # sync web build + plugins into the Android project
./build-debug.sh      # web build + cap sync + debug APK (JDK/SDK auto-detected)
```

`build-debug.sh` auto-detects JDK 21 at `~/jdk21` if the system JDK is too recent for Gradle
8.x (same pattern as the SheetHappens/postiz-android build scripts on this machine).
