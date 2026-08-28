// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { Lang } from '../../ui/i18n/strings';

export type ThemeMode = 'auto' | 'light' | 'dark';

export type ThemePalette = 'hue' | 'mono';

export interface ThemeSettings {
  mode: ThemeMode;
  // Single accent hue (0-360) — every "meaningful" color in the app (day types, macros)
  // is derived from this at runtime, see src/ui/style.css. Ignored when palette === 'mono'
  // (kept as-is so switching back to a hue preset restores whatever was picked before).
  accentHue: number;
  // Saturation (0-100) paired with accentHue — presets now each carry their own instead of a
  // single global constant, so a warm preset can sit richer/darker without dragging every other
  // preset's --accent-s along with it (see SettingsScreen's ACCENT_PRESETS).
  accentSaturation: number;
  // 'mono' drives style.css's `[data-palette='mono']` override block — a real grayscale theme,
  // not just accentSaturation pushed to 0 (bg/surface/text/border use their own fixed
  // saturation constants, not --accent-s, so zeroing --accent-s alone leaves them tinted).
  palette: ThemePalette;
  // UI language — bundled here rather than a separate LanguageRepo: same boot moment, same
  // settings screen, same load()/save() shape. `{ ...DEFAULT_THEME, ...parsed }` below already
  // backfills this for existing installs with no `lang` stored, same as accentHue's addition.
  lang: Lang;
}

export const DEFAULT_THEME: ThemeSettings = { mode: 'auto', accentHue: 28, accentSaturation: 74, palette: 'hue', lang: 'fr' };

const THEME_KEY = 'theme_settings';

export class ThemeRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<ThemeSettings> {
    const raw = await this.storage.get(THEME_KEY);
    if (!raw) return DEFAULT_THEME;
    try {
      return { ...DEFAULT_THEME, ...(JSON.parse(raw) as Partial<ThemeSettings>) };
    } catch {
      return DEFAULT_THEME;
    }
  }

  async save(settings: ThemeSettings): Promise<void> {
    await this.storage.set(THEME_KEY, JSON.stringify(settings));
  }
}
