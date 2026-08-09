// SPDX-License-Identifier: GPL-3.0-or-later

export interface HealthConnectSignals {
  steps: number | null;
  // best-effort/secondary — see plan §Phase 4: never load-bearing, the
  // steps+sport_kcal branch in detectDayType stays primary regardless.
  activeCaloriesKcal: number | null;
}

export interface HealthConnectAdapter {
  isAvailable(): Promise<boolean>;
  hasStepsPermission(): Promise<boolean>;
  // Returns whether the mandatory 'steps' read scope was granted — the caller
  // shouldn't block on activeCalories being denied, only steps.
  requestPermissions(): Promise<boolean>;
  readToday(): Promise<HealthConnectSignals>;
}
