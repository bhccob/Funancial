import { describe, expect, it } from 'vitest';
import { LATEST_VERSION, migrateRecord } from './migrations';
import { CURRENT_SCHEMA_VERSION } from './snapshot';

const v1Sub = {
  id: 's1',
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  name: 'Streamflix',
  amount: 15_99,
  cycle: 'monthly',
  nextRenewal: '2026-11-30',
  category: 'entertainment',
  paymentMethod: 'debit',
  cardId: null,
  status: 'active',
  audit: null,
  note: '',
};

it('has a step up to the current schema version', () => {
  expect(LATEST_VERSION).toBe(CURRENT_SCHEMA_VERSION);
});

describe('migrateRecord', () => {
  it('gives v1 subscriptions an anchor day from their next renewal', () => {
    expect(migrateRecord('subscription', v1Sub, 1)).toEqual({ ...v1Sub, anchorDay: 30 });
  });

  it('keeps an anchor day that is already there', () => {
    expect(migrateRecord('subscription', { ...v1Sub, anchorDay: 31 }, 1)).toMatchObject({
      anchorDay: 31,
    });
  });

  it('leaves other tables unchanged', () => {
    const goal = { id: 'g1', name: 'Bike' };
    expect(migrateRecord('goal', goal, 1)).toEqual(goal);
  });

  it('is the identity for current-version records', () => {
    expect(migrateRecord('subscription', v1Sub, 3)).toEqual(v1Sub);
  });

  it('does not touch a subscription that was already upgraded to v2', () => {
    expect(migrateRecord('subscription', v1Sub, 2)).toEqual(v1Sub);
  });
});

describe('v3 settings', () => {
  const v2Settings = {
    id: 'settings',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    weekStartsOn: 1,
    warningTone: 'motivational',
    autoLockMinutes: 5,
    lastBackupAt: null,
  };
  const reminders = {
    enabled: false,
    dailyLog: true,
    dailyTime: '20:00',
    bills: true,
    freeze: true,
    reviews: true,
    backup: true,
    prompted: false,
  };

  it('v3 adds reminder settings to old settings records', () => {
    expect(migrateRecord('settings', v2Settings, 2)).toEqual({ ...v2Settings, reminders });
    expect(migrateRecord('settings', v2Settings, 1)).toEqual({ ...v2Settings, reminders });
  });

  it('keeps reminder settings that are already there', () => {
    const chosen = { ...reminders, enabled: true, dailyTime: '07:30' };
    expect(migrateRecord('settings', { ...v2Settings, reminders: chosen }, 2)).toEqual({
      ...v2Settings,
      reminders: chosen,
    });
  });

  it('gives every record its own copy of the defaults', () => {
    const a = migrateRecord('settings', v2Settings, 2) as { reminders: object };
    const b = migrateRecord('settings', v2Settings, 2) as { reminders: object };
    expect(a.reminders).not.toBe(b.reminders);
  });
});
