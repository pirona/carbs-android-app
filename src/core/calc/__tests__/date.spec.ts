// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { formatDateKey, getISOWeek, guessMealSlot } from '../date';

describe('formatDateKey', () => {
  it('formats as local YYYY-MM-DD, zero-padded', () => {
    expect(formatDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDateKey(new Date(2026, 10, 30))).toBe('2026-11-30');
  });
});

describe('getISOWeek', () => {
  it('Jan 4 is always ISO week 1 (ISO 8601 anchor date)', () => {
    expect(getISOWeek(new Date(2021, 0, 4))).toBe(1);
  });

  it('handles the year-boundary case (Dec 31 2019 falls in week 1 of 2020)', () => {
    expect(getISOWeek(new Date(2019, 11, 31))).toBe(1);
  });
});

describe('guessMealSlot', () => {
  it('buckets by hour', () => {
    expect(guessMealSlot(new Date(2026, 0, 5, 7, 30))).toBe('petit_dej');
    expect(guessMealSlot(new Date(2026, 0, 5, 12, 30))).toBe('dejeuner');
    expect(guessMealSlot(new Date(2026, 0, 5, 19, 30))).toBe('diner');
    expect(guessMealSlot(new Date(2026, 0, 5, 16, 0))).toBe('collation');
    expect(guessMealSlot(new Date(2026, 0, 5, 23, 0))).toBe('collation');
  });

  it('boundaries are inclusive on the start, exclusive on the end', () => {
    expect(guessMealSlot(new Date(2026, 0, 5, 5, 0))).toBe('petit_dej');
    expect(guessMealSlot(new Date(2026, 0, 5, 10, 59))).toBe('petit_dej');
    expect(guessMealSlot(new Date(2026, 0, 5, 11, 0))).toBe('dejeuner');
    expect(guessMealSlot(new Date(2026, 0, 5, 22, 29))).toBe('diner');
    expect(guessMealSlot(new Date(2026, 0, 5, 22, 30))).toBe('collation');
  });
});
