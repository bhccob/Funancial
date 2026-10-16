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

// Migrating a settings record all the way up also runs step 6, which adds Invest's currency and rate.
const invest = { investCurrency: null, investFx: null };

it('has a step up to the current schema version', () => {
  expect(LATEST_VERSION).toBe(CURRENT_SCHEMA_VERSION);
});

describe('migrateRecord', () => {
  it('gives v1 subscriptions an anchor day from their next renewal', () => {
    expect(migrateRecord('subscription', v1Sub, 1)).toEqual({
      ...v1Sub,
      anchorDay: 30,
      auditedAt: null,
    });
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
    expect(migrateRecord('subscription', v1Sub, 4)).toEqual(v1Sub);
  });

  it('does not touch a subscription that was already upgraded to v2', () => {
    expect(migrateRecord('subscription', { ...v1Sub, auditedAt: null }, 2)).toEqual({
      ...v1Sub,
      auditedAt: null,
    });
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

  const cosmetics = { theme: 'theme-violet', avatar: 'avatar-sprout', frame: 'frame-none' };
  // Migrating all the way up also runs step 5, which adds the dividend reminder.
  const upgraded = { ...reminders, dividends: true };

  it('v3 adds reminder settings to old settings records', () => {
    expect(migrateRecord('settings', v2Settings, 2)).toEqual({
      ...v2Settings,
      reminders: upgraded,
      cosmetics,
      ...invest,
    });
    expect(migrateRecord('settings', v2Settings, 1)).toEqual({
      ...v2Settings,
      reminders: upgraded,
      cosmetics,
      ...invest,
    });
  });

  it('keeps reminder settings that are already there', () => {
    const chosen = { ...reminders, enabled: true, dailyTime: '07:30' };
    expect(migrateRecord('settings', { ...v2Settings, reminders: chosen }, 2)).toEqual({
      ...v2Settings,
      reminders: { ...chosen, dividends: true },
      cosmetics,
      ...invest,
    });
  });

  it('gives every record its own copy of the defaults', () => {
    const a = migrateRecord('settings', v2Settings, 2) as { reminders: object };
    const b = migrateRecord('settings', v2Settings, 2) as { reminders: object };
    expect(a.reminders).not.toBe(b.reminders);
  });
});

describe('v4 game data', () => {
  const v3Settings = {
    id: 'settings',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    weekStartsOn: 1,
    warningTone: 'motivational',
    autoLockMinutes: 5,
    lastBackupAt: null,
    reminders: {
      enabled: true,
      dailyLog: true,
      dailyTime: '07:30',
      bills: true,
      freeze: true,
      reviews: true,
      backup: true,
      prompted: true,
    },
  };
  const defaultCosmetics = { theme: 'theme-violet', avatar: 'avatar-sprout', frame: 'frame-none' };
  const v3Sub = { ...v1Sub, anchorDay: 30 };

  it('gives v3 settings the default cosmetics and keeps everything else', () => {
    expect(migrateRecord('settings', v3Settings, 3)).toEqual({
      ...v3Settings,
      reminders: { ...v3Settings.reminders, dividends: true },
      cosmetics: defaultCosmetics,
      ...invest,
    });
  });

  it('keeps cosmetics that are already there', () => {
    const chosen = { theme: 'theme-forest', avatar: 'avatar-fox', frame: 'frame-gold' };
    expect(migrateRecord('settings', { ...v3Settings, cosmetics: chosen }, 3)).toEqual({
      ...v3Settings,
      reminders: { ...v3Settings.reminders, dividends: true },
      cosmetics: chosen,
      ...invest,
    });
  });

  it('gives every settings record its own copy of the default cosmetics', () => {
    const a = migrateRecord('settings', v3Settings, 3) as { cosmetics: object };
    const b = migrateRecord('settings', v3Settings, 3) as { cosmetics: object };
    expect(a.cosmetics).not.toBe(b.cosmetics);
  });

  it('marks v3 subscriptions as never audited', () => {
    expect(migrateRecord('subscription', v3Sub, 3)).toEqual({ ...v3Sub, auditedAt: null });
  });

  it('keeps an audit stamp that is already there', () => {
    const audited = { ...v3Sub, audit: 'keep', auditedAt: '2026-10-10T08:00:00.000Z' };
    expect(migrateRecord('subscription', audited, 3)).toEqual(audited);
  });

  it('leaves the new game tables alone', () => {
    const entry = { id: 'a#0', key: 'a' };
    expect(migrateRecord('ledger', entry, 3)).toEqual(entry);
    expect(migrateRecord('checkIn', entry, 3)).toEqual(entry);
    expect(migrateRecord('challenge', entry, 3)).toEqual(entry);
    expect(migrateRecord('streakFreeze', entry, 3)).toEqual(entry);
  });
});

describe('v5 investments', () => {
  const v4Settings = {
    id: 'settings',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    weekStartsOn: 1,
    warningTone: 'motivational',
    autoLockMinutes: 5,
    lastBackupAt: null,
    reminders: {
      enabled: true,
      dailyLog: true,
      dailyTime: '07:30',
      bills: true,
      freeze: true,
      reviews: true,
      backup: true,
      prompted: true,
    },
    cosmetics: { theme: 'theme-forest', avatar: 'avatar-fox', frame: 'frame-gold' },
  };

  it('turns the dividend reminder on in v4 settings and keeps everything else', () => {
    expect(migrateRecord('settings', v4Settings, 4)).toEqual({
      ...v4Settings,
      reminders: { ...v4Settings.reminders, dividends: true },
      ...invest,
    });
  });

  it('keeps a dividend reminder choice that is already there', () => {
    const chosen = { ...v4Settings, reminders: { ...v4Settings.reminders, dividends: false } };
    expect(migrateRecord('settings', chosen, 4)).toEqual({ ...chosen, ...invest });
  });

  it('gives every settings record its own reminders object', () => {
    const a = migrateRecord('settings', v4Settings, 4) as { reminders: object };
    const b = migrateRecord('settings', v4Settings, 4) as { reminders: object };
    expect(a.reminders).not.toBe(b.reminders);
    expect(a.reminders).not.toBe(v4Settings.reminders);
  });

  it('leaves the new holding and dividend tables alone', () => {
    const row = { id: 'h1', symbol: 'KO' };
    expect(migrateRecord('holding', row, 4)).toEqual(row);
    expect(migrateRecord('dividend', row, 4)).toEqual(row);
  });
});

describe('v6 Invest currency', () => {
  const v5Settings = {
    id: 'settings',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    weekStartsOn: 1,
    warningTone: 'motivational',
    autoLockMinutes: 5,
    lastBackupAt: null,
    reminders: {
      enabled: true,
      dailyLog: true,
      dailyTime: '07:30',
      bills: true,
      freeze: true,
      reviews: true,
      backup: true,
      dividends: false,
      prompted: true,
    },
    cosmetics: { theme: 'theme-forest', avatar: 'avatar-fox', frame: 'frame-gold' },
  };

  it('adds the currency and rate as null to v5 settings and keeps everything else', () => {
    expect(migrateRecord('settings', v5Settings, 5)).toEqual({ ...v5Settings, ...invest });
  });

  it('keeps a currency and rate that are already there', () => {
    const chosen = {
      ...v5Settings,
      investCurrency: 'USD',
      investFx: { currency: 'USD', rate: 1.1, asOf: '2026-10-14T09:00:00.000Z' },
    };
    expect(migrateRecord('settings', chosen, 5)).toEqual(chosen);
  });

  it('leaves the other tables alone', () => {
    const row = { id: 'h1', symbol: 'KO' };
    expect(migrateRecord('holding', row, 5)).toEqual(row);
    expect(migrateRecord('profile', row, 5)).toEqual(row);
  });
});
