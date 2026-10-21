import { describe, expect, it } from 'vitest';
import {
  LATEST_VERSION,
  migrateRecord,
  migrateTables,
  TABLE_STEPS,
  type RawTables,
} from './migrations';
import { CURRENT_SCHEMA_VERSION } from './snapshot';
import v9edge from './upgrades/__fixtures__/v9-edge.json';
import { upgradeToV10 } from './upgrades/v10Accounts';

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

// Migrating a settings record all the way up also runs step 6, which adds Invest's currency and rate,
// step 8, which turns the Buy it? reminder on, and step 9, which adds an empty inbox.
const invest = { investCurrency: null, investFx: null };
const buyIt = { buyIt: true };
const inbox = { inbox: { readBefore: null, read: [] } };

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
  // Migrating all the way up also runs step 5, which adds the dividend reminder, and step 8.
  const upgraded = { ...reminders, dividends: true, ...buyIt };

  it('v3 adds reminder settings to old settings records', () => {
    expect(migrateRecord('settings', v2Settings, 2)).toEqual({
      ...v2Settings,
      reminders: upgraded,
      cosmetics,
      ...invest,
      ...inbox,
    });
    expect(migrateRecord('settings', v2Settings, 1)).toEqual({
      ...v2Settings,
      reminders: upgraded,
      cosmetics,
      ...invest,
      ...inbox,
    });
  });

  it('keeps reminder settings that are already there', () => {
    const chosen = { ...reminders, enabled: true, dailyTime: '07:30' };
    expect(migrateRecord('settings', { ...v2Settings, reminders: chosen }, 2)).toEqual({
      ...v2Settings,
      reminders: { ...chosen, dividends: true, ...buyIt },
      cosmetics,
      ...invest,
      ...inbox,
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
      reminders: { ...v3Settings.reminders, dividends: true, ...buyIt },
      cosmetics: defaultCosmetics,
      ...invest,
      ...inbox,
    });
  });

  it('keeps cosmetics that are already there', () => {
    const chosen = { theme: 'theme-forest', avatar: 'avatar-fox', frame: 'frame-gold' };
    expect(migrateRecord('settings', { ...v3Settings, cosmetics: chosen }, 3)).toEqual({
      ...v3Settings,
      reminders: { ...v3Settings.reminders, dividends: true, ...buyIt },
      cosmetics: chosen,
      ...invest,
      ...inbox,
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
      reminders: { ...v4Settings.reminders, dividends: true, ...buyIt },
      ...invest,
      ...inbox,
    });
  });

  it('keeps a dividend reminder choice that is already there', () => {
    const chosen = { ...v4Settings, reminders: { ...v4Settings.reminders, dividends: false } };
    expect(migrateRecord('settings', chosen, 4)).toEqual({
      ...chosen,
      reminders: { ...chosen.reminders, ...buyIt },
      ...invest,
      ...inbox,
    });
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
    expect(migrateRecord('settings', v5Settings, 5)).toEqual({
      ...v5Settings,
      reminders: { ...v5Settings.reminders, ...buyIt },
      ...invest,
      ...inbox,
    });
  });

  it('keeps a currency and rate that are already there', () => {
    const chosen = {
      ...v5Settings,
      investCurrency: 'USD',
      investFx: { currency: 'USD', rate: 1.1, asOf: '2026-10-14T09:00:00.000Z' },
    };
    expect(migrateRecord('settings', chosen, 5)).toEqual({
      ...chosen,
      reminders: { ...chosen.reminders, ...buyIt },
      ...inbox,
    });
  });

  it('leaves the other tables alone', () => {
    const row = { id: 'h1', symbol: 'KO' };
    expect(migrateRecord('holding', row, 5)).toEqual(row);
    expect(migrateRecord('profile', row, 5)).toEqual(row);
  });
});

describe('v7 sales', () => {
  // The new table has no old rows to upgrade, so step 7 touches nothing.
  it('leaves the v6 records that are not settings as they were', () => {
    const row = { id: 'h1', symbol: 'KO' };
    for (const table of ['holding', 'dividend', 'profile', 'transaction'] as const) {
      expect(migrateRecord(table, row, 6)).toEqual(row);
    }
  });

  it('runs the holding steps on the holding a sale keeps to restore', () => {
    // A later holding step, as one would be added.
    const steps = { [LATEST_VERSION]: { holding: (r: object) => ({ ...r, upgraded: true }) } };
    const restore = { id: 'h1', symbol: 'KO' };
    const sale = { id: 's1', symbol: 'KO', restore };
    expect(migrateRecord('sale', sale, LATEST_VERSION - 1, steps)).toEqual({
      ...sale,
      restore: { ...restore, upgraded: true },
    });
    // Nothing to restore, or a sale already past the step: nothing changes.
    const partial = { ...sale, restore: null };
    expect(migrateRecord('sale', partial, LATEST_VERSION - 1, steps)).toEqual(partial);
    expect(migrateRecord('sale', sale, LATEST_VERSION, steps)).toEqual(sale);
  });

  it('leaves a sale alone', () => {
    const sale = { id: 's1', symbol: 'KO', restore: null };
    expect(migrateRecord('sale', sale, 1)).toEqual(sale);
    expect(migrateRecord('sale', sale, 6)).toEqual(sale);
  });
});

describe('v8 buy decisions and About you', () => {
  // The two new tables have no old rows to upgrade. Step 8 only turns the Buy it? reminder on.
  const v7Settings = {
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
    investCurrency: 'USD',
    investFx: { currency: 'USD', rate: 1.1, asOf: '2026-10-14T09:00:00.000Z' },
  };

  it('adds the Buy it? reminder, on, to v7 settings and keeps everything else', () => {
    expect(migrateRecord('settings', v7Settings, 7)).toEqual({
      ...v7Settings,
      reminders: { ...v7Settings.reminders, buyIt: true },
      ...inbox,
    });
  });

  it('keeps a Buy it? choice that is already there', () => {
    const chosen = { ...v7Settings, reminders: { ...v7Settings.reminders, buyIt: false } };
    expect(migrateRecord('settings', chosen, 7)).toEqual({ ...chosen, ...inbox });
  });

  it('gives every settings record its own reminders object', () => {
    const a = migrateRecord('settings', v7Settings, 7) as { reminders: object };
    const b = migrateRecord('settings', v7Settings, 7) as { reminders: object };
    expect(a.reminders).not.toBe(b.reminders);
    expect(a.reminders).not.toBe(v7Settings.reminders);
  });

  it('leaves every other record as it was', () => {
    const row = { id: 'h1', symbol: 'KO' };
    for (const table of ['holding', 'profile', 'transaction'] as const) {
      expect(migrateRecord(table, row, 7)).toEqual(row);
    }
  });
});

describe('v9 inbox', () => {
  // Step 9 adds the read state; the owner's phone holds v7 data, which the next build upgrades past 8.
  const v8Settings = {
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
      buyIt: false,
      prompted: true,
    },
    cosmetics: { theme: 'theme-forest', avatar: 'avatar-fox', frame: 'frame-gold' },
    investCurrency: 'USD',
    investFx: { currency: 'USD', rate: 1.1, asOf: '2026-10-14T09:00:00.000Z' },
  };

  it('adds an inbox with nothing read to v8 settings and keeps everything else', () => {
    expect(migrateRecord('settings', v8Settings, 8)).toEqual({ ...v8Settings, ...inbox });
  });

  it('keeps an inbox that is already there', () => {
    const read = { inbox: { readBefore: '2026-10-14T09:00:00.000Z', read: ['week:2026-10-11'] } };
    expect(migrateRecord('settings', { ...v8Settings, ...read }, 8)).toEqual({
      ...v8Settings,
      ...read,
    });
  });

  it('upgrades v7 settings all the way: the Buy it? reminder on, and the inbox', () => {
    const reminders: Record<string, unknown> = { ...v8Settings.reminders };
    delete reminders.buyIt;
    const v7 = { ...v8Settings, reminders };
    expect(migrateRecord('settings', v7, 7)).toEqual({
      ...v8Settings,
      reminders: { ...reminders, buyIt: true },
      ...inbox,
    });
  });

  it('gives every settings record its own inbox', () => {
    const a = migrateRecord('settings', v8Settings, 8) as { inbox: { read: string[] } };
    const b = migrateRecord('settings', v8Settings, 8) as { inbox: { read: string[] } };
    expect(a.inbox).not.toBe(b.inbox);
    expect(a.inbox.read).not.toBe(b.inbox.read);
  });

  it('leaves every other record as it was', () => {
    const row = { id: 'h1', symbol: 'KO' };
    for (const table of ['holding', 'profile'] as const) {
      expect(migrateRecord(table, row, 8)).toEqual(row);
    }
  });
});

describe('migrateTables', () => {
  type Log = { id: string; log?: string[] };
  /** A record step that notes it ran on a row. */
  const noteRecord =
    (name: string) =>
    (r: Record<string, unknown>): Record<string, unknown> => ({
      ...r,
      log: [...((r as Log).log ?? []), name],
    });
  /** A table step that notes it ran on every settings row. */
  const noteTable =
    (name: string) =>
    (t: RawTables): RawTables => ({
      ...t,
      settings: (t.settings ?? []).map((r) => noteRecord(name)(r as Record<string, unknown>)),
    });
  const steps = {
    9: { settings: noteRecord('record 9') },
    10: { settings: noteRecord('record 10') },
  };
  const tableSteps = { 9: noteTable('table 9'), 10: noteTable('table 10') };
  const logOf = (tables: RawTables) => (tables.settings?.[0] as Log).log;

  it('counts the table steps in the latest version', () => {
    expect(LATEST_VERSION).toBe(10);
    expect(TABLE_STEPS[10]).toBe(upgradeToV10);
  });

  it("runs each version's record step, then its table step, version by version", () => {
    const tables: RawTables = { settings: [{ id: 'settings' }] };
    expect(logOf(migrateTables(tables, 8, steps, tableSteps))).toEqual([
      'record 9',
      'table 9',
      'record 10',
      'table 10',
    ]);
    expect(logOf(migrateTables(tables, 9, steps, tableSteps))).toEqual(['record 10', 'table 10']);
  });

  it('runs record step 9 before table step 10', () => {
    // A v8 settings row has no inbox: step 9 adds it, then the v10 upgrade sets the default account.
    const v8 = structuredClone(v9edge.tables) as unknown as RawTables;
    const settings = { ...(v8.settings![0] as Record<string, unknown>) };
    delete settings.inbox;
    v8.settings = [settings];
    const sawInbox: boolean[] = [];
    const out = migrateTables(v8, 8, undefined, {
      10: (t) => {
        sawInbox.push('inbox' in (t.settings![0] as object));
        return upgradeToV10(t);
      },
    });
    expect(sawInbox).toEqual([true]);
    expect(out.settings![0]).toMatchObject({
      inbox: { readBefore: null, read: [] },
      defaultAccountId: 'acct-main',
    });
    expect((out.account ?? []).length).toBe(5);
  });

  it('leaves a snapshot already at 10 unchanged', () => {
    const v10 = upgradeToV10(structuredClone(v9edge.tables) as unknown as RawTables);
    const before = structuredClone(v10);
    expect(migrateTables(v10, 10)).toEqual(before);
    expect(migrateTables(v10, 10, steps, tableSteps)).toEqual(before);
    expect(v10).toEqual(before);
  });

  it('runs the holding steps on the holding a sale keeps to restore', () => {
    const holdingSteps = { 10: { holding: (r: object) => ({ ...r, upgraded: true }) } };
    const restore = { id: 'h1', symbol: 'KO' };
    const tables: RawTables = { sale: [{ id: 's1', restore }], holding: [restore] };
    expect(migrateTables(tables, 9, holdingSteps, {})).toEqual({
      sale: [{ id: 's1', restore: { ...restore, upgraded: true } }],
      holding: [{ ...restore, upgraded: true }],
    });
  });

  it('does not change the tables it is given, and passes what is not a row through', () => {
    const tables: RawTables = { settings: [{ id: 'settings' }, null, 'x'] };
    const out = migrateTables(tables, 8, steps, {});
    expect(tables).toEqual({ settings: [{ id: 'settings' }, null, 'x'] });
    expect(out.settings).toEqual([{ id: 'settings', log: ['record 9', 'record 10'] }, null, 'x']);
  });
});
