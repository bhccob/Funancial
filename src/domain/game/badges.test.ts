import { describe, expect, it } from 'vitest';
import {
  localIso,
  makeExpense,
  makeIncome,
  makeLedgerEntry,
  makeLimit,
  makeSubscription,
} from '@/test/fixtures';
import type { SalaryFreeze } from '../entities';
import { emptySnapshot, type DataSnapshot } from '../snapshot';
import { BADGES, badgeAwards, badgeViews } from './badges';
import type { BadgeId, GameContext } from './types';

// 2026-10-15 is a Thursday.
const ctx: GameContext = {
  today: '2026-10-15',
  now: localIso('2026-10-15', 8),
  weekStartsOn: 1,
  canBackUp: true,
};

function snap(tables: Partial<DataSnapshot['tables']>): DataSnapshot {
  const base = emptySnapshot();
  return { ...base, tables: { ...base.tables, ...tables } };
}

const earned = (data: DataSnapshot): BadgeId[] =>
  badgeAwards(data, ctx).map((a) => a.key.replace('badge:', '') as BadgeId);

/** A weekly food limit of 120.00 that has existed since `since`. */
const limitSince = (since: string) => makeLimit({ createdAt: localIso(since) });

/** A food expense logged at noon on `day`, dated `day`. */
const spent = (day: string, amount: number) =>
  makeExpense({ date: day, amount, category: 'food', createdAt: localIso(day) });

function freeze(start: string, end: string): SalaryFreeze {
  const stamp = localIso(start);
  return {
    id: `freeze-${start}`,
    createdAt: stamp,
    updatedAt: stamp,
    start,
    end,
    lostAmount: 0,
    mode: 'manual',
    note: '',
  };
}

describe('BADGES', () => {
  it('lists the four badges in order', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      'first-expense',
      'subscription-slayer',
      'limit-keeper',
      'freeze-master',
    ]);
    expect(BADGES.map((b) => b.name)).toEqual([
      'First Expense Logged',
      'Subscription Slayer',
      'Limit Keeper',
      'Freeze Master',
    ]);
    expect(BADGES[2]?.description).toBe('Finish a calendar month without going over any limit.');
  });
});

describe('badgeAwards', () => {
  it('earns nothing from an empty app', () => {
    expect(badgeAwards(snap({}), ctx)).toEqual([]);
  });

  it('earns First Expense Logged from a logged expense, not a subscription charge', () => {
    const charge = makeExpense({ subscriptionId: 'sub-1', createdAt: localIso('2026-10-14') });
    const extra = makeIncome({ source: 'extra', createdAt: localIso('2026-10-14') });
    expect(earned(snap({ expense: [charge], income: [extra] }))).toEqual([]);

    const logged = makeExpense({ createdAt: localIso('2026-10-14') });
    expect(badgeAwards(snap({ expense: [charge, logged] }), ctx)).toEqual([
      {
        key: 'badge:first-expense',
        kind: 'badge',
        title: 'First Expense Logged',
        label: 'Badge: First Expense Logged',
        xp: 50,
        coins: 10,
      },
    ]);
  });

  it('earns Subscription Slayer from a cancelled subscription', () => {
    expect(earned(snap({ subscription: [makeSubscription({ status: 'active' })] }))).toEqual([]);
    const awards = badgeAwards(
      snap({ subscription: [makeSubscription({ status: 'cancelled' })] }),
      ctx,
    );
    expect(awards).toEqual([
      {
        key: 'badge:subscription-slayer',
        kind: 'badge',
        title: 'Subscription Slayer',
        label: 'Badge: Subscription Slayer',
        xp: 100,
        coins: 25,
      },
    ]);
  });

  it('earns Limit Keeper for a clean month with a limit from its first day', () => {
    // A limit from 09-01 and nothing over in September.
    expect(earned(snap({ budgetLimit: [limitSince('2026-09-01')] }))).toEqual(['limit-keeper']);
    expect(badgeAwards(snap({ budgetLimit: [limitSince('2026-09-01')] }), ctx)[0]).toMatchObject({
      title: 'Limit Keeper',
      label: 'Badge: Limit Keeper',
      xp: 150,
      coins: 40,
    });

    // Over on 09-20 (130.00 against a 120.00 weekly limit).
    const over = snap({
      budgetLimit: [limitSince('2026-09-01')],
      expense: [spent('2026-09-20', 130_00)],
    });
    expect(earned(over)).toEqual(['first-expense']);

    // Spending exactly the limit is not over.
    const exact = snap({
      budgetLimit: [limitSince('2026-09-01')],
      expense: [spent('2026-09-20', 120_00)],
    });
    expect(earned(exact)).toEqual(['first-expense', 'limit-keeper']);

    // A limit set on 09-10 did not exist on the month's first day, and October is still open.
    expect(earned(snap({ budgetLimit: [limitSince('2026-09-10')] }))).toEqual([]);
  });

  it('does not judge a month that has not closed', () => {
    // October's last day (10-31) is not before today (10-15).
    expect(earned(snap({ budgetLimit: [limitSince('2026-10-01')] }))).toEqual([]);
    // September closed, and August is too early for a limit set on 09-01.
    expect(earned(snap({ budgetLimit: [limitSince('2026-09-01')] }))).toEqual(['limit-keeper']);
  });

  it('earns Limit Keeper from a month long past, whichever month was clean', () => {
    // A limit since July, overspent in July and August, then clean through September.
    const data = snap({
      budgetLimit: [limitSince('2026-07-01')],
      expense: [spent('2026-07-10', 200_00), spent('2026-08-12', 200_00)],
    });
    expect(earned(data)).toEqual(['first-expense', 'limit-keeper']);
  });

  it('earns Freeze Master after a freeze ends cleanly', () => {
    const limit = limitSince('2026-10-01');
    expect(
      earned(snap({ salaryFreeze: [freeze('2026-10-01', '2026-10-07')], budgetLimit: [limit] })),
    ).toEqual(['freeze-master']);
    expect(
      badgeAwards(
        snap({ salaryFreeze: [freeze('2026-10-01', '2026-10-07')], budgetLimit: [limit] }),
        ctx,
      )[0],
    ).toMatchObject({
      key: 'badge:freeze-master',
      kind: 'badge',
      title: 'Freeze Master',
      label: 'Badge: Freeze Master',
      xp: 150,
      coins: 40,
    });

    // Still running, or ending today: not through it yet.
    expect(
      earned(snap({ salaryFreeze: [freeze('2026-10-01', '2026-10-20')], budgetLimit: [limit] })),
    ).toEqual([]);
    expect(
      earned(snap({ salaryFreeze: [freeze('2026-10-08', '2026-10-15')], budgetLimit: [limit] })),
    ).toEqual([]);

    // No limit on the freeze's first day.
    expect(
      earned(
        snap({
          salaryFreeze: [freeze('2026-10-01', '2026-10-07')],
          budgetLimit: [limitSince('2026-10-02')],
        }),
      ),
    ).toEqual([]);

    // Over a limit on a day of the freeze.
    expect(
      earned(
        snap({
          salaryFreeze: [freeze('2026-10-01', '2026-10-07')],
          budgetLimit: [limit],
          expense: [spent('2026-10-05', 130_00)],
        }),
      ),
    ).toEqual(['first-expense']);
  });

  it('keeps a badge once in the ledger', () => {
    const entry = makeLedgerEntry({
      key: 'badge:first-expense',
      createdAt: localIso('2026-09-01'),
    });
    // The expense that earned it has been deleted: no new award, and the badge stays earned.
    expect(badgeAwards(snap({ ledger: [entry] }), ctx)).toEqual([]);
    // With an expense present it is not awarded a second time either.
    const withExpense = snap({
      ledger: [entry],
      expense: [makeExpense({ createdAt: localIso('2026-10-14') })],
    });
    expect(badgeAwards(withExpense, ctx)).toEqual([]);

    const views = badgeViews(snap({ ledger: [entry] }));
    expect(views.find((v) => v.id === 'first-expense')?.earnedAt).toBe(entry.createdAt);
  });
});

describe('badgeViews', () => {
  it('lists every badge with its reward and when it was earned', () => {
    const entry = makeLedgerEntry({
      key: 'badge:subscription-slayer',
      createdAt: localIso('2026-10-02'),
    });
    expect(badgeViews(snap({ ledger: [entry] }))).toEqual([
      {
        id: 'first-expense',
        name: 'First Expense Logged',
        description: 'Log your first expense.',
        earnedAt: null,
        reward: { xp: 50, coins: 10 },
      },
      {
        id: 'subscription-slayer',
        name: 'Subscription Slayer',
        description: "Cancel a subscription you don't need.",
        earnedAt: entry.createdAt,
        reward: { xp: 100, coins: 25 },
      },
      {
        id: 'limit-keeper',
        name: 'Limit Keeper',
        description: 'Finish a calendar month without going over any limit.',
        earnedAt: null,
        reward: { xp: 150, coins: 40 },
      },
      {
        id: 'freeze-master',
        name: 'Freeze Master',
        description: 'Get through a salary freeze without going over any limit.',
        earnedAt: null,
        reward: { xp: 150, coins: 40 },
      },
    ]);
  });
});
