// SPDX-License-Identifier: GPL-3.0-or-later
import type { MealSlot } from '../types';

// Local "YYYY-MM-DD" key, matches the construction used throughout carb-cycling.html
// (e.g. :2021, :2083) — NOT the same as an ISO/UTC date string.
export function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Verbatim port of carb-cycling.html:629-635 (ISO 8601 week number).
// Note: near year boundaries this can return week 1 while the caller still uses
// `date.getFullYear()` for the year — that mismatch already existed in the source
// (see loadPlaisirData) and is preserved here rather than silently fixed.
export function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const y0 = new Date(Date.UTC(year, 0, 1));
  return Math.ceil(((date.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

// Default meal-slot suggestion from the clock, used to prefill (never force) the explicit
// selector shown when logging food — windows chosen by the user (5h-11h petit-déj,
// 11h-15h déjeuner, 18h-22h30 dîner, everything else — late-night/mid-afternoon snacks — falls
// to "collation"/hors-repas).
export function guessMealSlot(d: Date): MealSlot {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 11) return 'petit_dej';
  if (h >= 11 && h < 15) return 'dejeuner';
  if (h >= 18 && h < 22.5) return 'diner';
  return 'collation';
}
