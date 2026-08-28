// SPDX-License-Identifier: GPL-3.0-or-later
// Extracted from the 4 screens that each had an identical copy (ConseilsScreen, ProgressScreen,
// DayScreen, PhotoScanScreen) — a 5th copy for SettingsScreen's AI footprint card was the
// threshold to stop duplicating and share this instead.
import { getLang } from './i18n/strings';

export function fmt(n: number): string {
  return Math.round(n).toLocaleString(getLang() === 'en' ? 'en-US' : 'fr-FR');
}
