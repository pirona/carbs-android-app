// SPDX-License-Identifier: GPL-3.0-or-later
import type { ThemeSettings } from '../storage/repos/themeRepo';

// Applies theme settings to the document — called once at boot (main.ts) and again live
// whenever the user changes it in Settings. `mode: 'auto'` clears the explicit override
// so the `@media (prefers-color-scheme: dark)` rule in style.css takes over.
export function applyTheme(settings: ThemeSettings): void {
  const root = document.documentElement;
  if (settings.mode === 'auto') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = settings.mode;
  }
  root.style.setProperty('--accent-h', String(settings.accentHue));
}
