// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, ProfileRepo } from '../profileRepo';
import { InMemoryStorageAdapter } from '../../InMemoryStorageAdapter';

describe('ProfileRepo', () => {
  it('returns the default profile (matching the original hardcoded CONFIG.profile) when unset', async () => {
    const repo = new ProfileRepo(new InMemoryStorageAdapter());
    expect(await repo.load()).toEqual(DEFAULT_PROFILE);
    expect(DEFAULT_PROFILE).toEqual({
      height_cm: 185,
      age: 44,
      sex: 'male',
      weight_default_kg: 121,
      weight_start_kg: 121,
      weight_goal_kg: 90,
    });
  });

  it('round-trips an edited profile', async () => {
    const repo = new ProfileRepo(new InMemoryStorageAdapter());
    const edited = { ...DEFAULT_PROFILE, weight_goal_kg: 85 };
    await repo.save(edited);
    expect(await repo.load()).toEqual(edited);
  });
});
