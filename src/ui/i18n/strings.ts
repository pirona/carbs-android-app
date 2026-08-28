// SPDX-License-Identifier: GPL-3.0-or-later
// Central FR/EN dictionary — see plan §Mécanisme. No i18n library: the only real need is a
// `{var}` placeholder replace, not plural rules, consistent with this repo's zero-dependency,
// hand-rolled style. `as const satisfies Record<string, StringEntry>` gives StringKey as a
// literal union for free — a typo'd key or a missing fr/en fails to compile.
export type Lang = 'fr' | 'en';

export interface StringEntry {
  fr: string;
  en: string;
}

export const STRINGS = {
  // --- App chrome (main.ts: topbar title, bottom nav labels, icon aria-labels) ---
  'nav.day': { fr: 'Jour', en: 'Day' },
  'nav.progress': { fr: 'Progrès', en: 'Progress' },
  'nav.scan': { fr: 'Scan', en: 'Scan' },
  'nav.week': { fr: 'Semaine', en: 'Week' },
  'nav.habits': { fr: 'Habitudes', en: 'Habits' },
  'nav.conseils': { fr: 'Conseils', en: 'Advice' },
  'nav.settings': { fr: 'Réglages', en: 'Settings' },
} as const satisfies Record<string, StringEntry>;

export type StringKey = keyof typeof STRINGS;

let currentLang: Lang = 'fr';

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const template = STRINGS[key][currentLang];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
