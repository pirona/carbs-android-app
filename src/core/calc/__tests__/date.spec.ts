// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { formatDateKey, getISOWeek } from '../date';

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
