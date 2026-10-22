import { describe, expect, it } from 'vitest';
import { localIso, makeDividend, makeExpense, makeIncome, makeLedgerEntry } from '@/test/fixtures';
import type { LedgerEntry } from '../entities';
import { emptySnapshot, type DataSnapshot } from '../snapshot';
import { ledgerId, ledgerTotals, loggingAwards, netByKey, reconcileLedger } from './ledger';
import { LOG_CAP_PER_DAY, LOG_XP } from './rules';
import type { Award } from './types';

function snap(tables: Partial<DataSnapshot['tables']>): DataSnapshot {
  const base = emptySnapshot();
  return { ...base, tables: { ...base.tables, ...tables } };
}

const NOW = localIso('2026-10-15', 18);

const logAward = (id: string, table: 'expense' | 'income' = 'expense'): Award => {
  const label = table === 'expense' ? 'Logged an expense' : 'Logged income';
  return { key: `log:${table}:${id}`, kind: 'log', title: label, label, xp: LOG_XP, coins: 0 };
};

const questAward: Award = {
  key: 'quest:log-today:2026-10-15',
  kind: 'quest',
  title: 'Log today',
  label: 'Quest: log today',
  xp: 20,
  coins: 5,
};

const loggedA = makeLedgerEntry({
  id: 'log:expense:a#0',
  key: 'log:expense:a',
  xp: 10,
  coins: 0,
  label: 'Logged an expense',
});

const none = { reversible: [], oneTime: [] };

describe('ledgerId', () => {
  it('derives the id from the key and a count', () => {
    expect(ledgerId('log:expense:a', 0)).toBe('log:expense:a#0');
    expect(ledgerId('shop:theme-ocean:p1', 3)).toBe('shop:theme-ocean:p1#3');
  });
});

describe('loggingAwards', () => {
  it('pays logging XP for the first five entries of a local day', () => {
    // e1..e7 are logged at hours 15 down to 9, so the earliest five are e7 to e3.
    const sevenToday = Array.from({ length: 7 }, (_, i) =>
      makeExpense({ id: `e${i + 1}`, createdAt: localIso('2026-10-15', 15 - i) }),
    );
    const tomorrow = makeExpense({ id: 'next', createdAt: localIso('2026-10-16', 9) });
    const awards = loggingAwards(snap({ expense: [...sevenToday, tomorrow] }));
    expect(LOG_CAP_PER_DAY).toBe(5);
    expect(awards.map((a) => a.key)).toEqual([
      'log:expense:e7',
      'log:expense:e6',
      'log:expense:e5',
      'log:expense:e4',
      'log:expense:e3',
      'log:expense:next',
    ]);
    expect(awards[0]).toEqual({
      key: 'log:expense:e7',
      kind: 'log',
      title: 'Logged an expense',
      label: 'Logged an expense',
      xp: 10,
      coins: 0,
    });
  });

  it('counts an entry on the day it was logged, whatever its date', () => {
    const backdated = makeExpense({
      id: 'old',
      date: '2026-10-01',
      createdAt: localIso('2026-10-15', 9),
    });
    const others = Array.from({ length: 4 }, (_, i) =>
      makeExpense({ id: `n${i}`, date: '2026-10-15', createdAt: localIso('2026-10-15', 10 + i) }),
    );
    const sixth = makeExpense({ id: 'sixth', createdAt: localIso('2026-10-15', 20) });
    const keys = loggingAwards(snap({ expense: [backdated, ...others, sixth] })).map((a) => a.key);
    expect(keys).toContain('log:expense:old');
    expect(keys).not.toContain('log:expense:sixth');
  });

  it('shares the daily cap between expenses and extra income, and labels each', () => {
    const awards = loggingAwards(
      snap({
        expense: [makeExpense({ id: 'e', createdAt: localIso('2026-10-15', 9) })],
        income: [makeIncome({ id: 'i', source: 'extra', createdAt: localIso('2026-10-15', 10) })],
      }),
    );
    expect(awards.map((a) => [a.key, a.title, a.label])).toEqual([
      ['log:expense:e', 'Logged an expense', 'Logged an expense'],
      ['log:income:i', 'Logged income', 'Logged income'],
    ]);
  });

  it('pays a confirmed dividend as a logged entry, and nothing for a skipped one', () => {
    const awards = loggingAwards(
      snap({
        dividend: [
          makeDividend({ id: 'd1', createdAt: localIso('2026-10-15', 9) }),
          makeDividend({
            id: 'd2',
            status: 'skipped',
            amount: 0,
            accountId: null,
            createdAt: localIso('2026-10-15', 10),
          }),
        ],
      }),
    );
    expect(awards).toEqual([
      {
        key: 'log:dividend:d1',
        kind: 'log',
        title: 'Logged a dividend',
        label: 'Logged a dividend',
        xp: 10,
        coins: 0,
      },
    ]);
  });

  it('shares the daily cap between dividends and the rest', () => {
    // Four expenses and two dividends on one local day: the sixth entry, a dividend, is past the cap.
    const expense = Array.from({ length: 4 }, (_, i) =>
      makeExpense({ id: `e${i}`, createdAt: localIso('2026-10-15', 9 + i) }),
    );
    const dividend = ['d1', 'd2'].map((id, i) =>
      makeDividend({ id, createdAt: localIso('2026-10-15', 14 + i) }),
    );
    const keys = loggingAwards(snap({ expense, dividend })).map((a) => a.key);
    expect(keys).toEqual([
      'log:expense:e0',
      'log:expense:e1',
      'log:expense:e2',
      'log:expense:e3',
      'log:dividend:d1',
    ]);

    // The next day starts again.
    const next = makeDividend({ id: 'd3', createdAt: localIso('2026-10-16', 9) });
    const more = loggingAwards(snap({ expense, dividend: [...dividend, next] })).map((a) => a.key);
    expect(more).toContain('log:dividend:d3');
  });

  it('awards nothing for subscription charges or salary', () => {
    expect(
      loggingAwards(
        snap({
          expense: [makeExpense({ subscriptionId: 'sub1' })],
          income: [makeIncome({ source: 'salary' })],
        }),
      ),
    ).toEqual([]);
  });
});

describe('reconcileLedger', () => {
  it('grants missing awards with key-derived ids', () => {
    expect(reconcileLedger([], { reversible: [logAward('a')], oneTime: [] }, NOW)).toEqual([
      {
        id: 'log:expense:a#0',
        createdAt: NOW,
        updatedAt: NOW,
        key: 'log:expense:a',
        kind: 'award',
        xp: 10,
        coins: 0,
        label: 'Logged an expense',
      },
    ]);
  });

  it('reverses logging XP when the entry is gone', () => {
    expect(reconcileLedger([loggedA], none, NOW)).toEqual([
      {
        id: 'log:expense:a#1',
        createdAt: NOW,
        updatedAt: NOW,
        key: 'log:expense:a',
        kind: 'reversal',
        xp: -10,
        coins: 0,
        label: 'Removed: Logged an expense',
      },
    ]);
  });

  it('takes the coins back too', () => {
    const withCoins = { ...loggedA, coins: 2 };
    expect(reconcileLedger([withCoins], none, NOW)[0]).toMatchObject({ xp: -10, coins: -2 });
  });

  it('grants again after a reversal', () => {
    const reversal = makeLedgerEntry({
      id: 'log:expense:a#1',
      key: 'log:expense:a',
      kind: 'reversal',
      xp: -10,
      coins: 0,
      label: 'Removed: Logged an expense',
    });
    const next = reconcileLedger(
      [loggedA, reversal],
      { reversible: [logAward('a')], oneTime: [] },
      NOW,
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: 'log:expense:a#2', kind: 'award', xp: 10 });
  });

  it('leaves an award alone while it is still earned', () => {
    expect(reconcileLedger([loggedA], { reversible: [logAward('a')], oneTime: [] }, NOW)).toEqual(
      [],
    );
  });

  it('grants one-time awards once and never reverses them', () => {
    const first = reconcileLedger([], { reversible: [], oneTime: [questAward] }, NOW);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      id: 'quest:log-today:2026-10-15#0',
      kind: 'award',
      xp: 20,
      coins: 5,
      label: 'Quest: log today',
    });
    expect(reconcileLedger(first, { reversible: [], oneTime: [questAward] }, NOW)).toEqual([]);
    // The key is missing from the awards afterwards, and it still is not reversed.
    expect(reconcileLedger(first, none, NOW)).toEqual([]);
  });

  it('never touches purchases', () => {
    const purchase = makeLedgerEntry({
      id: 'shop:theme-ocean:p1#0',
      key: 'shop:theme-ocean:p1',
      kind: 'purchase',
      xp: 0,
      coins: -40,
      label: 'Ocean theme',
    });
    expect(reconcileLedger([purchase], none, NOW)).toEqual([]);
    const next = reconcileLedger(
      [purchase],
      { reversible: [logAward('a')], oneTime: [questAward] },
      NOW,
    );
    expect(next.map((e) => e.key)).toEqual(['log:expense:a', 'quest:log-today:2026-10-15']);
  });

  it('gives a key awarded twice in one call a single entry', () => {
    const next = reconcileLedger(
      [],
      { reversible: [logAward('a'), logAward('a')], oneTime: [questAward, questAward] },
      NOW,
    );
    expect(next.map((e) => e.id)).toEqual(['log:expense:a#0', 'quest:log-today:2026-10-15#0']);
  });

  it('is idempotent', () => {
    const gone = makeLedgerEntry({
      id: 'log:expense:gone#0',
      key: 'log:expense:gone',
      xp: 10,
      coins: 0,
      label: 'Logged an expense',
    });
    const ledger: LedgerEntry[] = [gone];
    const awards = { reversible: [logAward('a'), logAward('b', 'income')], oneTime: [questAward] };
    const first = reconcileLedger(ledger, awards, NOW);
    expect(first.map((e) => [e.id, e.kind])).toEqual([
      ['log:expense:a#0', 'award'],
      ['log:income:b#0', 'award'],
      ['log:expense:gone#1', 'reversal'],
      ['quest:log-today:2026-10-15#0', 'award'],
    ]);
    expect(reconcileLedger([...ledger, ...first], awards, NOW)).toEqual([]);
  });
});

describe('netByKey and ledgerTotals', () => {
  const ledger = [
    makeLedgerEntry({ key: 'a', kind: 'award', xp: 40, coins: 30 }),
    makeLedgerEntry({ key: 'a', kind: 'reversal', xp: -10, coins: 0 }),
    makeLedgerEntry({ key: 'shop:x:p', kind: 'purchase', xp: 0, coins: -10 }),
  ];

  it('nets each key', () => {
    expect(netByKey(ledger)).toEqual(
      new Map([
        ['a', { xp: 30, coins: 30 }],
        ['shop:x:p', { xp: 0, coins: -10 }],
      ]),
    );
  });

  it('totals XP and coins across awards, reversals and purchases', () => {
    expect(ledgerTotals(ledger)).toEqual({ xp: 30, coins: 20 });
    expect(ledgerTotals([])).toEqual({ xp: 0, coins: 0 });
  });
});
