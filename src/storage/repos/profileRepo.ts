// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { Profile } from '../../core/types';

const PROFILE_KEY = 'profile';

// NEW in this app — was the hardcoded CONFIG.profile constant in carb-cycling.html:372-379.
// Same initial values, now user-editable via a Settings screen (Phase 3).
export const DEFAULT_PROFILE: Profile = {
  height_cm: 185,
  age: 44,
  sex: 'male',
  weight_default_kg: 121,
  weight_start_kg: 121,
  weight_goal_kg: 90,
};

export class ProfileRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<Profile> {
    const raw = await this.storage.get(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    try {
      return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
    } catch {
      return DEFAULT_PROFILE;
    }
  }

  async save(profile: Profile): Promise<void> {
    await this.storage.set(PROFILE_KEY, JSON.stringify(profile));
  }
}
