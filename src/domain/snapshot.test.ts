import { describe, expect, it } from 'vitest';
import {
  makeAboutYou,
  makeBuyDecision,
  makeDividend,
  makeExpense,
  makeHolding,
  makeProfile,
  makeSale,
  makeSettings,
  makeSubscription,
} from '@/test/fixtures';
import {
  CURRENT_SCHEMA_VERSION,
  emptySnapshot,
  migrateSnapshot,
  SchemaVersionError,
  SnapshotSchema,
  TABLES,
} from './snapshot';

describe('emptySnapshot', () => {
  it('has every table and validates', () => {
    const s = emptySnapshot();
    expect(Object.keys(s.tables).sort()).toEqual([...TABLES].sort());
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(SnapshotSchema.safeParse(s).success).toBe(true);
  });
});

describe('SnapshotSchema', () => {
  it('rejects duplicate ids within a table', () => {
    const s = emptySnapshot();
    s.tables.expense = [makeExpense({ id: 'e1' }), makeExpense({ id: 'e1' })];
    expect(SnapshotSchema.safeParse(s).success).toBe(false);
  });
  it('allows at most one profile', () => {
    const s = emptySnapshot();
    s.tables.profile = [makeProfile(), makeProfile()];
    expect(SnapshotSchema.safeParse(s).success).toBe(false);
  });
});

describe('migrateSnapshot', () => {
  it('passes a valid current-version snapshot through unchanged', () => {
    const s = emptySnapshot();
    s.tables.expense = [makeExpense({ id: 'e1' })];
    expect(migrateSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('refuses snapshots from a newer version', () => {
    expect(() => migrateSnapshot({ ...emptySnapshot(), schemaVersion: 99 })).toThrow(
      SchemaVersionError,
    );
  });
  it('rejects malformed content', () => {
    expect(() => migrateSnapshot({ schemaVersion: 1, tables: { expense: 'nope' } })).toThrow();
    expect(() => migrateSnapshot('garbage')).toThrow();
  });
});

describe('migrateSnapshot from older versions', () => {
  it('adds reminder settings to a v2 snapshot and stamps the current version', () => {
    const { reminders, ...old } = makeSettings();
    const v2 = emptySnapshot() as unknown as {
      schemaVersion: number;
      tables: Record<string, unknown[]>;
    };
    v2.schemaVersion = 2;
    v2.tables.settings = [old];
    const migrated = migrateSnapshot(v2);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.tables.settings[0]?.reminders).toEqual(reminders);
    expect(migrated.tables.settings[0]?.reminders.enabled).toBe(false);
  });

  it('adds anchorDay to subscriptions and stamps the current version', () => {
    const v1 = emptySnapshot() as unknown as {
      schemaVersion: number;
      tables: Record<string, unknown[]>;
    };
    v1.schemaVersion = 1;
    const sub = { ...makeSubscription({ id: 's1', nextRenewal: '2026-11-28' }) } as Record<
      string,
      unknown
    >;
    delete sub.anchorDay;
    v1.tables.subscription = [sub];
    const migrated = migrateSnapshot(v1);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.tables.subscription[0]?.anchorDay).toBe(28);
  });

  it('upgrades a v3 snapshot: empty game tables, default cosmetics, auditedAt null', () => {
    const v3Settings: Record<string, unknown> = { ...makeSettings() };
    delete v3Settings.cosmetics;
    const v3Sub: Record<string, unknown> = { ...makeSubscription() };
    delete v3Sub.auditedAt;
    const v3 = {
      schemaVersion: 3,
      tables: {
        profile: [],
        settings: [v3Settings],
        income: [],
        expense: [],
        subscription: [v3Sub],
        budgetLimit: [],
        salaryFreeze: [],
        transaction: [],
        goal: [],
        debt: [],
      },
    };
    const s = migrateSnapshot(v3);
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(s.tables.holding).toEqual([]);
    expect(s.tables.dividend).toEqual([]);
    expect(s.tables.ledger).toEqual([]);
    expect(s.tables.checkIn).toEqual([]);
    expect(s.tables.challenge).toEqual([]);
    expect(s.tables.streakFreeze).toEqual([]);
    expect(s.tables.settings[0]!.cosmetics).toEqual({
      theme: 'theme-violet',
      avatar: 'avatar-sprout',
      frame: 'frame-none',
    });
    expect(s.tables.subscription[0]!.auditedAt).toBeNull();
    expect(s.tables.settings[0]!.reminders.dividends).toBe(true);
  });

  it('migrates v4 settings with reminders.dividends true and empty holding tables', () => {
    const v4Reminders: Record<string, unknown> = { ...makeSettings().reminders };
    delete v4Reminders.dividends;
    const v4 = {
      schemaVersion: 4,
      tables: {
        profile: [],
        settings: [{ ...makeSettings(), reminders: v4Reminders }],
        income: [],
        expense: [],
        subscription: [],
        budgetLimit: [],
        salaryFreeze: [],
        transaction: [],
        goal: [],
        debt: [],
        ledger: [],
        checkIn: [],
        challenge: [],
        streakFreeze: [],
      },
    };
    const s = migrateSnapshot(v4);
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(s.tables.settings[0]!.reminders).toEqual({ ...v4Reminders, dividends: true });
    expect(s.tables.holding).toEqual([]);
    expect(s.tables.dividend).toEqual([]);
  });

  it('migrates v5 settings to Invest in the profile currency, with no rate', () => {
    const old: Record<string, unknown> = { ...makeSettings() };
    delete old.investCurrency;
    delete old.investFx;
    const v5 = {
      schemaVersion: 5,
      tables: { ...emptySnapshot().tables, settings: [old] },
    };
    const s = migrateSnapshot(v5);
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(s.tables.settings[0]).toMatchObject({ investCurrency: null, investFx: null });
  });

  it('keeps holdings and dividends through a round trip', () => {
    const s = emptySnapshot();
    s.tables.holding = [makeHolding({ id: 'h1' })];
    s.tables.dividend = [makeDividend({ id: 'd1', holdingId: 'h1' })];
    expect(migrateSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe('sales (v7)', () => {
  it('gives a v6 snapshot an empty sale table and keeps its holdings', () => {
    const { sale, ...tables } = emptySnapshot().tables;
    expect(sale).toEqual([]);
    const v6 = {
      schemaVersion: 6,
      tables: { ...tables, holding: [makeHolding({ id: 'h1' })] },
    };
    const s = migrateSnapshot(v6);
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(s.tables.sale).toEqual([]);
    expect(s.tables.holding).toEqual(v6.tables.holding);
  });

  it('keeps sales, with the holding a full sale stored, through a round trip', () => {
    const s = emptySnapshot();
    s.tables.sale = [
      makeSale({ id: 's1', restore: makeHolding({ id: 'h1' }) }),
      makeSale({ id: 's2' }),
    ];
    expect(migrateSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('names the new table', () => {
    expect(TABLES).toContain('sale');
  });
});

describe('buy decisions and About you (v8)', () => {
  it('gives a v7 snapshot empty decision and About you tables and the Buy it? reminder', () => {
    const { buyDecision, aboutYou, ...tables } = emptySnapshot().tables;
    expect([buyDecision, aboutYou]).toEqual([[], []]);
    const old: Record<string, unknown> = { ...makeSettings() };
    const { buyIt, ...reminders } = makeSettings().reminders;
    expect(buyIt).toBe(true);
    old.reminders = reminders;
    const v7 = {
      schemaVersion: 7,
      tables: { ...tables, settings: [old], holding: [makeHolding({ id: 'h1' })] },
    };
    const s = migrateSnapshot(v7);
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(s.tables.buyDecision).toEqual([]);
    expect(s.tables.aboutYou).toEqual([]);
    expect(s.tables.settings[0]!.reminders).toEqual(makeSettings().reminders);
    expect(s.tables.holding).toEqual(v7.tables.holding);
  });

  it('keeps decisions and the About you record through a round trip', () => {
    const s = emptySnapshot();
    s.tables.buyDecision = [makeBuyDecision({ id: 'b1' }), makeBuyDecision({ id: 'b2', usage: 4 })];
    s.tables.aboutYou = [makeAboutYou({ situation: 'Renting.' })];
    expect(migrateSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('holds at most one About you record, and no duplicate decision ids', () => {
    const two = emptySnapshot();
    two.tables.aboutYou = [makeAboutYou(), makeAboutYou()];
    expect(SnapshotSchema.safeParse(two).success).toBe(false);
    const dup = emptySnapshot();
    dup.tables.buyDecision = [makeBuyDecision({ id: 'b1' }), makeBuyDecision({ id: 'b1' })];
    expect(SnapshotSchema.safeParse(dup).success).toBe(false);
  });

  it('names the new tables and the version', () => {
    expect(TABLES).toContain('buyDecision');
    expect(TABLES).toContain('aboutYou');
  });
});

describe('the inbox (v9)', () => {
  const empty = { readBefore: null, read: [] };
  const current = makeSettings();

  /** Settings as a build before v9 stored them: no inbox, and from v7 back, no Buy it? reminder. */
  function oldSettings(version: 7 | 8): Record<string, unknown> {
    const old: Record<string, unknown> = { ...current };
    delete old.inbox;
    if (version === 7) {
      const reminders: Record<string, unknown> = { ...current.reminders };
      delete reminders.buyIt;
      old.reminders = reminders;
    }
    return old;
  }

  it('gives a v8 snapshot an empty inbox and keeps the rest', () => {
    const tables = { ...emptySnapshot().tables, holding: [makeHolding({ id: 'h1' })] };
    const v8 = { schemaVersion: 8, tables: { ...tables, settings: [oldSettings(8)] } };
    const s = migrateSnapshot(v8);
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(s.tables.settings).toEqual([{ ...current, inbox: empty }]);
    expect(s.tables.holding).toEqual(tables.holding);
  });

  it("takes the owner's v7 data all the way: no decision tables, Buy it? on, an empty inbox", () => {
    const { buyDecision, aboutYou, ...tables } = emptySnapshot().tables;
    expect([buyDecision, aboutYou]).toEqual([[], []]);
    const v7 = { schemaVersion: 7, tables: { ...tables, settings: [oldSettings(7)] } };
    const s = migrateSnapshot(v7);
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(s.tables.buyDecision).toEqual([]);
    expect(s.tables.aboutYou).toEqual([]);
    expect(s.tables.settings).toEqual([{ ...current, inbox: empty }]);
  });

  it('keeps what was read through a round trip', () => {
    const s = emptySnapshot();
    s.tables.settings = [
      makeSettings({
        inbox: {
          readBefore: '2026-10-14T09:00:00.000Z',
          read: ['week:2026-10-11', 'renewal:s1:2026-10-15'],
        },
      }),
    ];
    expect(migrateSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('is the current version', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(9);
  });
});
