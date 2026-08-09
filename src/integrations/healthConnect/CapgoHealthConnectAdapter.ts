// SPDX-License-Identifier: GPL-3.0-or-later
import { Health } from '@capgo/capacitor-health';
import type { HealthConnectAdapter, HealthConnectSignals } from './HealthConnectAdapter';

const READ_TYPES = ['steps', 'calories'] as const; // 'calories' = active energy burned

function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

async function readTodayTotal(dataType: 'steps' | 'calories', now: Date): Promise<number | null> {
  try {
    const { samples } = await Health.queryAggregated({
      dataType,
      startDate: startOfDay(now).toISOString(),
      endDate: now.toISOString(),
      bucket: 'day',
    });
    const value = samples[0]?.value;
    return typeof value === 'number' ? Math.round(value) : null;
  } catch {
    // not authorized for this type, or the provider has nothing for today — either way,
    // this signal is optional/best-effort (see HealthConnectAdapter), never throw upward.
    return null;
  }
}

export class CapgoHealthConnectAdapter implements HealthConnectAdapter {
  async isAvailable(): Promise<boolean> {
    try {
      const result = await Health.isAvailable();
      return result.available;
    } catch {
      return false;
    }
  }

  async hasStepsPermission(): Promise<boolean> {
    try {
      const status = await Health.checkAuthorization({ read: [...READ_TYPES] });
      return status.readAuthorized.includes('steps');
    } catch {
      return false;
    }
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const status = await Health.requestAuthorization({ read: [...READ_TYPES] });
      return status.readAuthorized.includes('steps');
    } catch {
      return false;
    }
  }

  async readToday(): Promise<HealthConnectSignals> {
    const now = new Date();
    const [steps, activeCaloriesKcal] = await Promise.all([
      readTodayTotal('steps', now),
      readTodayTotal('calories', now),
    ]);
    return { steps, activeCaloriesKcal };
  }
}
