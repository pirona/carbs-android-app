// SPDX-License-Identifier: GPL-3.0-or-later
import type { Profile } from '../../types';

// Mirrors the hardcoded CONFIG.profile in carb-cycling.html:372-379.
export const TEST_PROFILE: Profile = {
  height_cm: 185,
  age: 44,
  sex: 'male',
  weight_default_kg: 121,
  weight_start_kg: 121,
  weight_goal_kg: 90,
};
