import { describe, expect, it } from 'vitest';
import {
  localIso,
  makeBuyDecision,
  makeDividend,
  makeExpense,
  makeHolding,
  makeIncome,
  makeLedgerEntry,
  makeLimit,
  makeProfile,
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
  it('lists the twelve badges in order', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      'first-expense',
      'subscription-slayer',
      'limit-keeper',
      'freeze-master',
      'first-etf',
      'portfolio-pro',
      'first-dividend',
      'dividend-collector',
      'passive-income-pro',
      'smart-shopper',
      'impulse-controller',
      'budget-defender',
    ]);
    expect(BADGES.map((b) => b.name)).toEqual([
      'First Expense Logged',
      'Subscription Slayer',
      'Limit Keeper',
      'Freeze Master',
      'First ETF',
      'Portfolio Pro',
      'First Dividend',
      'Dividend Collector',
      'Passive Income Pro',
      'Smart Shopper',
      'Impulse Controller',
      'Budget Defender',
    ]);
    expect(BADGES[2]?.description).toBe('Finish a calendar month without going over any limit.');
    expect(BADGES.slice(4).map((b) => b.description)).toEqual([
      'Add an ETF to your portfolio.',
      'Hold five or more investments.',
      'Confirm your first dividend.',
      'Confirm 12 dividends.',
      'Collect 100 in dividends in one month.',
      'Rate a purchase 4 or 5.',
      'Skip 5 purchases.',
      'Skip 3 purchases that would have gone over a limit.',
    ]);
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

  it('earns First ETF from an ETF holding, not from a stock', () => {
    expect(earned(snap({ holding: [makeHolding({ type: 'stock' })] }))).toEqual([]);
    expect(earned(snap({ holding: [makeHolding({ type: 'other' })] }))).toEqual([]);
    expect(badgeAwards(snap({ holding: [makeHolding({ type: 'etf' })] }), ctx)).toEqual([
      {
        key: 'badge:first-etf',
        kind: 'badge',
        title: 'First ETF',
        label: 'Badge: First ETF',
        xp: 100,
        coins: 25,
      },
    ]);
  });

  it('earns Portfolio Pro from five holdings', () => {
    const holdings = (n: number) => Array.from({ length: n }, () => makeHolding());
    expect(earned(snap({ holding: holdings(4) }))).toEqual([]);
    expect(badgeAwards(snap({ holding: holdings(5) }), ctx)).toEqual([
      {
        key: 'badge:portfolio-pro',
        kind: 'badge',
        title: 'Portfolio Pro',
        label: 'Badge: Portfolio Pro',
        xp: 150,
        coins: 40,
      },
    ]);
    expect(earned(snap({ holding: holdings(6) }))).toEqual(['portfolio-pro']);
  });

  it('earns First Dividend from a confirmed dividend, not a skipped one', () => {
    const skipped = makeDividend({ status: 'skipped', amount: 0, bucket: null });
    expect(earned(snap({ dividend: [skipped] }))).toEqual([]);
    expect(badgeAwards(snap({ dividend: [skipped, makeDividend()] }), ctx)).toEqual([
      {
        key: 'badge:first-dividend',
        kind: 'badge',
        title: 'First Dividend',
        label: 'Badge: First Dividend',
        xp: 100,
        coins: 25,
      },
    ]);
  });

  it('earns Dividend Collector from twelve confirmed dividends', () => {
    const confirmed = (n: number) => Array.from({ length: n }, () => makeDividend());
    const skipped = Array.from({ length: 5 }, () =>
      makeDividend({ status: 'skipped', amount: 0, bucket: null }),
    );
    expect(earned(snap({ dividend: [...confirmed(11), ...skipped] }))).toEqual(['first-dividend']);
    const twelve = snap({ dividend: confirmed(12) });
    expect(earned(twelve)).toEqual(['first-dividend', 'dividend-collector']);
    expect(badgeAwards(twelve, ctx)[1]).toMatchObject({
      key: 'badge:dividend-collector',
      title: 'Dividend Collector',
      label: 'Badge: Dividend Collector',
      xp: 150,
      coins: 40,
    });
  });

  it('earns Passive Income Pro from 100 in confirmed dividends in one calendar month', () => {
    const paid = (paidOn: string, amount: number) => makeDividend({ paidOn, amount });
    const usd = (...dividend: ReturnType<typeof paid>[]) =>
      snap({ profile: [makeProfile({ currency: 'USD' })], dividend });

    expect(earned(usd(paid('2026-10-03', 60_00), paid('2026-10-20', 40_00)))).toEqual([
      'first-dividend',
      'passive-income-pro',
    ]);
    expect(
      badgeAwards(usd(paid('2026-10-03', 100_00)), ctx).find(
        (a) => a.title === 'Passive Income Pro',
      ),
    ).toEqual({
      key: 'badge:passive-income-pro',
      kind: 'badge',
      title: 'Passive Income Pro',
      label: 'Badge: Passive Income Pro',
      xp: 200,
      coins: 50,
    });

    // 99.99 is short, and 100.00 split over two months is not one month's.
    expect(earned(usd(paid('2026-10-03', 99_99)))).toEqual(['first-dividend']);
    expect(earned(usd(paid('2026-09-30', 60_00), paid('2026-10-01', 40_00)))).toEqual([
      'first-dividend',
    ]);
    // A skipped payout adds nothing.
    const skipped = makeDividend({
      paidOn: '2026-10-05',
      status: 'skipped',
      amount: 0,
      bucket: null,
    });
    expect(earned(usd(paid('2026-10-03', 99_99), skipped))).toEqual(['first-dividend']);
  });

  it('reads the Passive Income Pro target in the profile currency', () => {
    // A yen has no minor unit, so 100 is 100.
    const yen = (amount: number) =>
      snap({
        profile: [makeProfile({ currency: 'JPY' })],
        dividend: [makeDividend({ paidOn: '2026-10-03', amount })],
      });
    expect(earned(yen(99))).toEqual(['first-dividend']);
    expect(earned(yen(100))).toEqual(['first-dividend', 'passive-income-pro']);
    // Without a profile there is no currency to measure in.
    expect(earned(snap({ dividend: [makeDividend({ amount: 1_000_00 })] }))).toEqual([
      'first-dividend',
    ]);
  });

  it('earns Smart Shopper from a bought decision rated 4 or 5', () => {
    const rated = (usage: 1 | 2 | 3 | 4 | 5 | null, status: 'bought' | 'skipped' = 'bought') =>
      snap({ buyDecision: [makeBuyDecision({ status, usage })] });

    expect(earned(rated(4))).toEqual(['smart-shopper']);
    expect(earned(rated(5))).toEqual(['smart-shopper']);
    expect(badgeAwards(rated(5), ctx)).toEqual([
      {
        key: 'badge:smart-shopper',
        kind: 'badge',
        title: 'Smart Shopper',
        label: 'Badge: Smart Shopper',
        xp: 100,
        coins: 25,
      },
    ]);

    // One short: a 3, no rating yet, or a rating on something that was not bought.
    expect(earned(rated(3))).toEqual([]);
    expect(earned(rated(null))).toEqual([]);
    expect(earned(rated(5, 'skipped'))).toEqual([]);
  });

  it('earns Impulse Controller from 5 skipped decisions', () => {
    const skipped = (n: number) =>
      Array.from({ length: n }, () => makeBuyDecision({ status: 'skipped' }));

    expect(earned(snap({ buyDecision: skipped(5) }))).toEqual(['impulse-controller']);
    expect(badgeAwards(snap({ buyDecision: skipped(5) }), ctx)).toEqual([
      {
        key: 'badge:impulse-controller',
        kind: 'badge',
        title: 'Impulse Controller',
        label: 'Badge: Impulse Controller',
        xp: 150,
        coins: 40,
      },
    ]);

    // One short; a decision bought or still waiting is not a skip.
    expect(earned(snap({ buyDecision: skipped(4) }))).toEqual([]);
    const others = [makeBuyDecision({ status: 'bought' }), makeBuyDecision({ status: 'waiting' })];
    expect(earned(snap({ buyDecision: [...skipped(4), ...others] }))).toEqual([]);
  });

  it('earns Budget Defender from 3 skipped decisions that would have gone over a limit', () => {
    const decision = (status: 'skipped' | 'bought', overBy: number) => {
      const base = makeBuyDecision({ status });
      return { ...base, facts: { ...base.facts, overBy } };
    };
    const over = (n: number) => Array.from({ length: n }, () => decision('skipped', 10_00));

    expect(earned(snap({ buyDecision: over(3) }))).toEqual(['budget-defender']);
    expect(badgeAwards(snap({ buyDecision: over(3) }), ctx)).toEqual([
      {
        key: 'badge:budget-defender',
        kind: 'badge',
        title: 'Budget Defender',
        label: 'Badge: Budget Defender',
        xp: 150,
        coins: 40,
      },
    ]);

    // One short; skips within the limits do not count, nor does buying over a limit.
    expect(earned(snap({ buyDecision: over(2) }))).toEqual([]);
    const within = [decision('skipped', 0), decision('bought', 10_00)];
    expect(earned(snap({ buyDecision: [...over(2), ...within] }))).toEqual([]);
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
      {
        id: 'first-etf',
        name: 'First ETF',
        description: 'Add an ETF to your portfolio.',
        earnedAt: null,
        reward: { xp: 100, coins: 25 },
      },
      {
        id: 'portfolio-pro',
        name: 'Portfolio Pro',
        description: 'Hold five or more investments.',
        earnedAt: null,
        reward: { xp: 150, coins: 40 },
      },
      {
        id: 'first-dividend',
        name: 'First Dividend',
        description: 'Confirm your first dividend.',
        earnedAt: null,
        reward: { xp: 100, coins: 25 },
      },
      {
        id: 'dividend-collector',
        name: 'Dividend Collector',
        description: 'Confirm 12 dividends.',
        earnedAt: null,
        reward: { xp: 150, coins: 40 },
      },
      {
        id: 'passive-income-pro',
        name: 'Passive Income Pro',
        description: 'Collect 100 in dividends in one month.',
        earnedAt: null,
        reward: { xp: 200, coins: 50 },
      },
      {
        id: 'smart-shopper',
        name: 'Smart Shopper',
        description: 'Rate a purchase 4 or 5.',
        earnedAt: null,
        reward: { xp: 100, coins: 25 },
      },
      {
        id: 'impulse-controller',
        name: 'Impulse Controller',
        description: 'Skip 5 purchases.',
        earnedAt: null,
        reward: { xp: 150, coins: 40 },
      },
      {
        id: 'budget-defender',
        name: 'Budget Defender',
        description: 'Skip 3 purchases that would have gone over a limit.',
        earnedAt: null,
        reward: { xp: 150, coins: 40 },
      },
    ]);
  });
});
