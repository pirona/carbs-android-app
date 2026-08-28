// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { Lang } from '../../ui/i18n/strings';

export type ThemeMode = 'auto' | 'light' | 'dark';

export interface ThemeSettings {
  mode: ThemeMode;
  // Single accent hue (0-360) — every "meaningful" color in the app (day types, macros)
  // is derived from this at runtime, see src/ui/style.css.
  accentHue: number;
  // UI language — bundled here rather than a separate LanguageRepo: same boot moment, same
  // settings screen, same load()/save() shape. `{ ...DEFAULT_THEME, ...parsed }` below already
  // backfills this for existing installs with no `lang` stored, same as accentHue's addition.
  lang: Lang;
}

export const DEFAULT_THEME: ThemeSettings = { mode: 'auto', accentHue: 28, lang: 'fr' };

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
