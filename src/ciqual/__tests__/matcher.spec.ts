// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { matchCiqual } from '../matcher';

describe('matchCiqual', () => {
  it('finds a plausible match for a common composite dish', () => {
    const results = matchCiqual('salade de couscous');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].label.toLowerCase()).toContain('couscous');
  });

  it('returns per100 macros usable directly', () => {
    const results = matchCiqual('riz');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].per100.kcal).toBeGreaterThan(0);
  });

  it('returns an empty array for an empty query', () => {
    expect(matchCiqual('')).toEqual([]);
  });
});
