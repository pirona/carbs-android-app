// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { filterHabitsByQuery, normalizeSearchText } from '../habitSearch';
import type { Habit } from '../../types';

function habit(label: string): Habit {
  return {
    id: label,
    label,
    off_code: null,
    source: 'manual',
    portion_g: 100,
    per100: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
    day_type_tag: null,
    meal_slot: null,
    updated_at: 0,
  };
}

describe('normalizeSearchText', () => {
  it('lowercases, trims and strips accents', () => {
    expect(normalizeSearchText('  Café Crème  ')).toBe('cafe creme');
  });
});

describe('filterHabitsByQuery', () => {
  const habits = [habit('Café noir'), habit('Yaourt nature'), habit('Salade César'), habit('Pomme')];

  it('returns everything on an empty/whitespace query', () => {
    expect(filterHabitsByQuery(habits, '')).toHaveLength(4);
    expect(filterHabitsByQuery(habits, '   ')).toHaveLength(4);
  });

  it('matches a case-insensitive substring anywhere in the label', () => {
    expect(filterHabitsByQuery(habits, 'yaourt').map((h) => h.label)).toEqual(['Yaourt nature']);
    expect(filterHabitsByQuery(habits, 'ATURE').map((h) => h.label)).toEqual(['Yaourt nature']);
  });

  it('ignores accents on both sides of the match', () => {
    expect(filterHabitsByQuery(habits, 'cesar').map((h) => h.label)).toEqual(['Salade César']);
    expect(filterHabitsByQuery(habits, 'café').map((h) => h.label)).toEqual(['Café noir']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterHabitsByQuery(habits, 'sushi')).toEqual([]);
  });
});
