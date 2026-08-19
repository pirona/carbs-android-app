// SPDX-License-Identifier: GPL-3.0-or-later
// Shared by DayScreen (today's log) and ConseilsScreen (an archived day) — both render food
// entries bucketed by meal_slot rather than as one flat list, and both need to move an entry
// between sections without re-fetching macro totals from scratch.
import type { LogEntry, MealSlot } from '../types';

export function groupByMeal(entries: LogEntry[]): Record<MealSlot, LogEntry[]> {
  const groups: Record<MealSlot, LogEntry[]> = { petit_dej: [], dejeuner: [], diner: [], collation: [] };
  entries.forEach((e) => groups[e.meal_slot]?.push(e));
  return groups;
}

export function foodTotals(entries: LogEntry[]) {
  return entries.reduce(
    (acc, e) => ({ kcal: acc.kcal + e.kcal, protein_g: acc.protein_g + e.protein_g, fat_g: acc.fat_g + e.fat_g, carb_g: acc.carb_g + e.carb_g }),
    { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
  );
}
