import { describe, expect, it } from 'vitest';
import {
  makeDividend,
  makeExpense,
  makeHolding,
  makeProfile,
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
    expect(s.schemaVersion).toBe(5);
    expect(s.tables.settings[0]!.reminders).toEqual({ ...v4Reminders, dividends: true });
    expect(s.tables.holding).toEqual([]);
    expect(s.tables.dividend).toEqual([]);
  });

  it('keeps holdings and dividends through a round trip', () => {
    const s = emptySnapshot();
    s.tables.holding = [makeHolding({ id: 'h1' })];
    s.tables.dividend = [makeDividend({ id: 'd1', holdingId: 'h1' })];
    expect(migrateSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
