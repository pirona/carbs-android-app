// SPDX-License-Identifier: GPL-3.0-or-later
import type { HealthConnectAdapter, HealthConnectSignals } from './HealthConnectAdapter';

// All-null fallback — Health Connect absent, denied, or unavailable on this platform.
// The app degrades to manual sport_kcal entry, same as before Phase 4 (steps are the
// reliable signal in theory, but this keeps the app fully usable either way).
export class NullHealthConnectAdapter implements HealthConnectAdapter {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async hasStepsPermission(): Promise<boolean> {
    return false;
  }

  async requestPermissions(): Promise<boolean> {
    return false;
  }

  async readToday(): Promise<HealthConnectSignals> {
    return { steps: null, activeCaloriesKcal: null };
  }
}
