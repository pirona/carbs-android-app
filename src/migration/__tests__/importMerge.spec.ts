// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { mergeByKey, mergeByUpdatedAt, mergeRecord } from '../importMerge';

describe('mergeByKey', () => {
  it('unions by key, existing wins on conflict', () => {
    const existing = [{ date: '2026-08-10', v: 'old' }];
    const incoming = [
      { date: '2026-08-10', v: 'imported-but-ignored' },
      { date: '2026-08-11', v: 'new' },
    ];
    const result = mergeByKey(existing, incoming, (e) => e.date);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.merged).toEqual([
      { date: '2026-08-10', v: 'old' },
      { date: '2026-08-11', v: 'new' },
    ]);
  });

  it('is idempotent — importing the same data twice adds nothing the second time', () => {
    const existing = [{ date: '2026-08-10', v: 'a' }];
    const incoming = [{ date: '2026-08-10', v: 'a' }];
    const first = mergeByKey(existing, incoming, (e) => e.date);
    const second = mergeByKey(first.merged, incoming, (e) => e.date);
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(1);
  });
});

describe('mergeByUpdatedAt', () => {
  it('keeps the most recently updated version on conflict', () => {
    const existing = [{ id: 'h1', label: 'old', updated_at: 100 }];
    const incoming = [{ id: 'h1', label: 'newer', updated_at: 200 }];
    const result = mergeByUpdatedAt(existing, incoming, (e) => e.id);
    expect(result.merged).toEqual([{ id: 'h1', label: 'newer', updated_at: 200 }]);
    expect(result.added).toBe(1);
  });

  it('ignores a stale incoming entry', () => {
    const existing = [{ id: 'h1', label: 'current', updated_at: 200 }];
    const incoming = [{ id: 'h1', label: 'stale', updated_at: 100 }];
    const result = mergeByUpdatedAt(existing, incoming, (e) => e.id);
    expect(result.merged).toEqual([{ id: 'h1', label: 'current', updated_at: 200 }]);
    expect(result.skipped).toBe(1);
  });
});

describe('mergeRecord', () => {
  it('unions keys, existing value wins on conflict', () => {
    const result = mergeRecord({ '2026-08-10': 200 }, { '2026-08-10': 999, '2026-08-11': 300 });
    expect(result.merged).toEqual({ '2026-08-10': 200, '2026-08-11': 300 });
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
