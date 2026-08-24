// SPDX-License-Identifier: GPL-3.0-or-later
// Accent-insensitive substring filter for the habit picker (library list + Day screen's
// quick-log chips) — both grow into long, hard-to-scan lists over time.
import type { Habit } from '../types';

export function normalizeSearchText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterHabitsByQuery(habits: Habit[], query: string): Habit[] {
  const q = normalizeSearchText(query);
  if (!q) return habits;
  return habits.filter((h) => normalizeSearchText(h.label).includes(q));
}
