import { describe, expect, it } from 'vitest';
import type { RawTables } from '../migrations';
import { SnapshotSchema } from '../snapshot';
import v9demo from './__fixtures__/v9-demo.json';
import v9edge from './__fixtures__/v9-edge.json';
import {
  MAIN_ACCOUNT_ID,
  PASSIVE_ACCOUNT_ID,
  SAVINGS_ACCOUNT_ID,
  upgradeToV10,
  V10_DROPPED_TABLES,
} from './v10Accounts';

type Row = Record<string, unknown>;

/** A fresh copy of a fixture's tables, so no test sees another's changes. */
const tablesOf = (fixture: { tables: object }): RawTables =>
  structuredClone(fixture.tables) as RawTables;

const rows = (tables: RawTables, table: string): Row[] => (tables[table] ?? []) as Row[];
const row = (tables: RawTables, table: string, id: string): Row | undefined =>
  rows(tables, table).find((r) => r.id === id);
const ids = (tables: RawTables, table: string) => rows(tables, table).map((r) => r.id);

/** v9-edge without anything that names the passive bucket: its transfers and its dividends. */
function edgeWithoutPassive(): RawTables {
  const tables = tablesOf(v9edge);
  tables.transaction = rows(tables, 'transaction').filter(
    (t) => t.from !== 'passive' && t.to !== 'passive',
  );
  tables.dividend = rows(tables, 'dividend').filter((d) => d.bucket !== 'passive');
  tables.sale = rows(tables, 'sale').filter((s) => s.to !== 'passive');
  return tables;
}

const PROFILE_STAMP = '2026-01-01T12:00:00.000Z';

describe('upgradeToV10', () => {
  it('upgrades the demo to a valid v10 snapshot', () => {
    const tables = upgradeToV10(tablesOf(v9demo));
    const parsed = SnapshotSchema.parse({ schemaVersion: 10, tables });
    expect(parsed.tables.account.map((a) => a.id)).toEqual([
      MAIN_ACCOUNT_ID,
      SAVINGS_ACCOUNT_ID,
      PASSIVE_ACCOUNT_ID,
      'demo-card',
    ]);
    // Parsing strips nothing: the upgrade leaves no v9 field behind.
    expect(parsed.tables).toEqual(tables);
  });

  it('upgrades the edge fixture to a valid v10 snapshot', () => {
    const tables = upgradeToV10(tablesOf(v9edge));
    expect(SnapshotSchema.parse({ schemaVersion: 10, tables }).tables).toEqual(tables);
  });

  describe('maps every v9 row of the edge fixture', () => {
    const out = upgradeToV10(tablesOf(v9edge));
    const cases: Array<[string, string, string, Row]> = [
      [
        'the profile makes Main account from its opening cash',
        'account',
        MAIN_ACCOUNT_ID,
        {
          id: 'acct-main',
          createdAt: PROFILE_STAMP,
          updatedAt: PROFILE_STAMP,
          name: 'Main account',
          kind: 'debit',
          skin: 'midnight',
          last4: null,
          openingBalance: 100_000,
          openingDate: '2026-01-01',
          inAvailable: true,
          frozen: false,
          order: 0,
          credit: null,
        },
      ],
      [
        'the profile makes Savings from its opening savings',
        'account',
        SAVINGS_ACCOUNT_ID,
        {
          id: 'acct-savings',
          createdAt: PROFILE_STAMP,
          updatedAt: PROFILE_STAMP,
          name: 'Savings',
          kind: 'savings',
          skin: 'mint',
          last4: null,
          openingBalance: 500_000,
          openingDate: '2026-01-01',
          inAvailable: false,
          frozen: false,
          order: 1,
          credit: null,
        },
      ],
      [
        'a row naming passive makes Passive income, opened with the profile',
        'account',
        PASSIVE_ACCOUNT_ID,
        {
          id: 'acct-passive',
          createdAt: PROFILE_STAMP,
          updatedAt: PROFILE_STAMP,
          name: 'Passive income',
          kind: 'savings',
          skin: 'amber',
          last4: null,
          openingBalance: 0,
          openingDate: '2026-01-01',
          inAvailable: false,
          frozen: false,
          order: 2,
          credit: null,
        },
      ],
      [
        'a credit-card debt becomes a credit account with the same id',
        'account',
        'card-a',
        {
          id: 'card-a',
          createdAt: PROFILE_STAMP,
          updatedAt: PROFILE_STAMP,
          name: 'Visa A',
          kind: 'credit',
          skin: 'violet',
          last4: null,
          openingBalance: 15_000,
          openingDate: '2026-02-01',
          inAvailable: false,
          frozen: false,
          order: 3,
          credit: {
            limit: 300_000,
            statementDay: 1,
            dueDay: 21,
            payInFull: true,
            minimumPayment: 2_500,
            interestRate: 22.9,
          },
        },
      ],
      [
        'the second card comes next, archived as it was',
        'account',
        'card-b',
        {
          id: 'card-b',
          name: 'Old Mastercard',
          kind: 'credit',
          openingBalance: 0,
          openingDate: '2026-01-01',
          order: 4,
          archivedOn: '2026-09-01',
        },
      ],
      ['a loan stays a debt', 'debt', 'loan-1', { kind: 'loan', openingBalance: 120_000 }],
      ['the profile loses its openings', 'profile', 'profile', { openingDate: '2026-01-01' }],
      ['a card expense names its card', 'expense', 'exp-card-a', { accountId: 'card-a' }],
      ['an archived card keeps its expenses', 'expense', 'exp-card-b', { accountId: 'card-b' }],
      ['a cash expense names Main', 'expense', 'exp-cash', { accountId: MAIN_ACCOUNT_ID }],
      ['a debit expense names Main', 'expense', 'exp-debit', { accountId: MAIN_ACCOUNT_ID }],
      ['an other expense names Main', 'expense', 'exp-other', { accountId: MAIN_ACCOUNT_ID }],
      ['a card subscription names its card', 'subscription', 'sub-card-a', { accountId: 'card-a' }],
      ['savings income names Savings', 'income', 'inc-savings', { accountId: SAVINGS_ACCOUNT_ID }],
      ['cash income names Main', 'income', 'inc-salary-confirmed', { accountId: MAIN_ACCOUNT_ID }],
      [
        'an expected salary names Main',
        'income',
        'inc-salary-expected',
        { accountId: MAIN_ACCOUNT_ID, status: 'expected' },
      ],
      [
        'a transfer maps both buckets',
        'transaction',
        'tx-transfer',
        { fromAccountId: SAVINGS_ACCOUNT_ID, toAccountId: PASSIVE_ACCOUNT_ID, debtId: null },
      ],
      [
        'a card payment goes into the card, and names no debt',
        'transaction',
        'tx-card-payment',
        { fromAccountId: SAVINGS_ACCOUNT_ID, toAccountId: 'card-a', debtId: null },
      ],
      [
        'a loan payment keeps its loan and gains its source',
        'transaction',
        'tx-loan-payment',
        { fromAccountId: MAIN_ACCOUNT_ID, toAccountId: null, debtId: 'loan-1' },
      ],
      [
        'an investment leaves its source',
        'transaction',
        'tx-investment',
        { fromAccountId: SAVINGS_ACCOUNT_ID, toAccountId: null, debtId: null },
      ],
      [
        'an adjustment corrects Main, by a signed amount',
        'transaction',
        'tx-adjustment',
        { fromAccountId: null, toAccountId: MAIN_ACCOUNT_ID, amount: -2_500 },
      ],
      [
        'a dividend paid to passive names Passive income',
        'dividend',
        'div-passive',
        { accountId: PASSIVE_ACCOUNT_ID, reinvested: false },
      ],
      [
        'a reinvested dividend names no account',
        'dividend',
        'div-reinvest',
        { accountId: null, reinvested: true, sharesAdded: 0.15 },
      ],
      [
        'a skipped dividend names no account',
        'dividend',
        'div-skipped',
        { accountId: null, reinvested: false, amount: 0 },
      ],
      ['a sale pays into Savings', 'sale', 'sale-1', { toAccountId: SAVINGS_ACCOUNT_ID }],
      [
        'the default account is Main',
        'settings',
        'settings',
        { defaultAccountId: MAIN_ACCOUNT_ID },
      ],
    ];

    it.each(cases)('%s', (_, table, id, expected) => {
      expect(row(out, table, id)).toMatchObject(expected);
    });

    it('builds the accounts in order: the buckets, then the cards', () => {
      expect(ids(out, 'account')).toEqual([
        MAIN_ACCOUNT_ID,
        SAVINGS_ACCOUNT_ID,
        PASSIVE_ACCOUNT_ID,
        'card-a',
        'card-b',
      ]);
    });

    it('drops the card debts and keeps the loan', () => {
      expect(ids(out, 'debt')).toEqual(['loan-1']);
    });

    it('leaves no v9 field behind', () => {
      const gone: Array<[string, string[]]> = [
        ['profile', ['openingCash', 'openingSavings']],
        ['expense', ['paymentMethod', 'cardId']],
        ['subscription', ['paymentMethod', 'cardId']],
        ['income', ['bucket']],
        ['transaction', ['from', 'to']],
        ['dividend', ['bucket']],
        ['sale', ['to']],
      ];
      for (const [table, fields] of gone) {
        expect(rows(out, table).length, table).toBeGreaterThan(0);
        for (const r of rows(out, table)) {
          for (const field of fields)
            expect(r, `${table} ${String(r.id)}`).not.toHaveProperty(field);
        }
      }
      const settings = row(out, 'settings', 'settings')!;
      expect(settings.reminders).not.toHaveProperty('freeze');
      expect(settings.reminders).not.toHaveProperty('buyIt');
    });

    it('changes nothing else on a row', () => {
      const v9 = tablesOf(v9edge);
      const { paymentMethod, cardId, ...expense } = row(v9, 'expense', 'exp-card-a')!;
      expect([paymentMethod, cardId]).toEqual(['credit_card', 'card-a']);
      expect(row(out, 'expense', 'exp-card-a')).toEqual({ ...expense, accountId: 'card-a' });

      const { from, to, ...transfer } = row(v9, 'transaction', 'tx-transfer')!;
      expect([from, to]).toEqual(['savings', 'passive']);
      expect(row(out, 'transaction', 'tx-transfer')).toEqual({
        ...transfer,
        fromAccountId: SAVINGS_ACCOUNT_ID,
        toAccountId: PASSIVE_ACCOUNT_ID,
      });

      expect(row(out, 'holding', 'holding-1')).toEqual(row(v9, 'holding', 'holding-1'));
      expect(row(out, 'debt', 'loan-1')).toEqual(row(v9, 'debt', 'loan-1'));
    });
  });

  describe('creates the passive account only when something names passive', () => {
    it('has no Passive income when no row names passive', () => {
      const out = upgradeToV10(edgeWithoutPassive());
      expect(ids(out, 'account')).toEqual([
        MAIN_ACCOUNT_ID,
        SAVINGS_ACCOUNT_ID,
        'card-a',
        'card-b',
      ]);
      expect(row(out, 'account', PASSIVE_ACCOUNT_ID)).toBeUndefined();
    });

    const stamp = { createdAt: PROFILE_STAMP, updatedAt: PROFILE_STAMP };
    const namers: Array<[string, string, Row]> = [
      [
        'a transfer out of passive',
        'transaction',
        {
          id: 't',
          ...stamp,
          type: 'transfer',
          amount: 1,
          date: '2026-03-01',
          from: 'passive',
          to: 'cash',
          debtId: null,
          note: '',
        },
      ],
      [
        'a transfer into passive',
        'transaction',
        {
          id: 't',
          ...stamp,
          type: 'transfer',
          amount: 1,
          date: '2026-03-01',
          from: 'cash',
          to: 'passive',
          debtId: null,
          note: '',
        },
      ],
      [
        'a dividend paid to passive',
        'dividend',
        { ...row(tablesOf(v9edge), 'dividend', 'div-passive')!, id: 'd' },
      ],
      [
        'a sale paid to passive',
        'sale',
        { ...row(tablesOf(v9edge), 'sale', 'sale-1')!, id: 's', to: 'passive' },
      ],
    ];

    it.each(namers)('makes it for %s', (_, table, named) => {
      const tables = edgeWithoutPassive();
      tables[table] = [...rows(tables, table), named];
      const out = upgradeToV10(tables);
      expect(row(out, 'account', PASSIVE_ACCOUNT_ID)).toMatchObject({ kind: 'savings', order: 2 });
    });
  });

  it("keeps the card's id and archivedOn", () => {
    const out = upgradeToV10(tablesOf(v9edge));
    expect(row(out, 'account', 'card-b')).toMatchObject({ id: 'card-b', archivedOn: '2026-09-01' });
    expect(row(out, 'account', 'card-a')).not.toHaveProperty('archivedOn');
  });

  it('numbers the cards by when they were made, then by id, whatever order the rows come in', () => {
    // Stored rows come back in the storage's order, an account copy in its own: both must agree.
    const orders = (tables: RawTables) =>
      Object.fromEntries(rows(tables, 'account').map((a) => [a.id, a.order]));
    const forward = upgradeToV10(tablesOf(v9edge));
    const reversed = tablesOf(v9edge);
    reversed.debt = rows(reversed, 'debt').toReversed();
    expect(ids(reversed, 'debt')).toEqual(['loan-1', 'card-b', 'card-a']);
    expect(orders(upgradeToV10(reversed))).toEqual(orders(forward));
    expect(orders(forward)).toMatchObject({ 'card-a': 3, 'card-b': 4 });

    // Both cards were made at the same moment above; an earlier one comes first whatever its id.
    const older = tablesOf(v9edge);
    older.debt = rows(older, 'debt').map((d) =>
      d.id === 'card-b' ? { ...d, createdAt: '2025-12-01T12:00:00.000Z' } : d,
    );
    const out = upgradeToV10(older);
    expect(orders(out)).toMatchObject({ 'card-b': 3, 'card-a': 4 });
    expect(ids(out, 'account').slice(3)).toEqual(['card-b', 'card-a']);
  });

  it('has no bucket accounts and a null default without a profile', () => {
    // The edge fixture names passive, so only a missing profile keeps Passive income away too.
    const tables = tablesOf(v9edge);
    tables.profile = [];
    const out = upgradeToV10(tables);
    expect(ids(out, 'account')).toEqual(['card-a', 'card-b']);
    expect(row(out, 'settings', 'settings')).toMatchObject({ defaultAccountId: null });

    const { profile, ...noTable } = tablesOf(v9edge);
    expect(profile).toHaveLength(1);
    const bare = upgradeToV10(noTable);
    expect(ids(bare, 'account')).toEqual(['card-a', 'card-b']);
    expect(bare).not.toHaveProperty('profile');
  });

  it('drops the three removed tables', () => {
    expect(V10_DROPPED_TABLES).toEqual(['salaryFreeze', 'buyDecision', 'aboutYou']);
    const v9 = tablesOf(v9edge);
    for (const table of V10_DROPPED_TABLES) expect(rows(v9, table)).toHaveLength(1);
    const out = upgradeToV10(v9);
    for (const table of V10_DROPPED_TABLES) expect(out).not.toHaveProperty(table);
  });

  it('leaves a dangling cardId as the accountId', () => {
    const tables = tablesOf(v9edge);
    const expense = row(tables, 'expense', 'exp-card-a')!;
    const payment = row(tables, 'transaction', 'tx-card-payment')!;
    tables.expense = [{ ...expense, id: 'exp-gone', cardId: 'gone' }];
    tables.transaction = [{ ...payment, id: 'tx-gone', debtId: 'gone' }];
    let out: RawTables = {};
    expect(() => (out = upgradeToV10(tables))).not.toThrow();
    expect(row(out, 'expense', 'exp-gone')).toMatchObject({ accountId: 'gone' });
    expect(row(out, 'transaction', 'tx-gone')).toMatchObject({ toAccountId: 'gone', debtId: null });
    expect(row(out, 'account', 'gone')).toBeUndefined();
  });

  it('leaves what it cannot read as it was, and does not throw', () => {
    const tables = tablesOf(v9edge);
    tables.expense = [null, 'garbage', ...rows(tables, 'expense')];
    (tables as Record<string, unknown>).dividend = 'not a table';
    (tables as Record<string, unknown>).debt = { not: 'rows' };
    const out = upgradeToV10(tables);
    expect(out.expense?.slice(0, 2)).toEqual([null, 'garbage']);
    expect((out as Record<string, unknown>).dividend).toBe('not a table');
    expect((out as Record<string, unknown>).debt).toEqual({ not: 'rows' });
    expect(ids(out, 'account')).toEqual([MAIN_ACCOUNT_ID, SAVINGS_ACCOUNT_ID, PASSIVE_ACCOUNT_ID]);
  });

  it('does not change the tables it is given', () => {
    const tables = tablesOf(v9edge);
    const before = structuredClone(tables);
    upgradeToV10(tables);
    expect(tables).toEqual(before);
  });
});
