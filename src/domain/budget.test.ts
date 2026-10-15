import { describe, expect, it } from 'vitest';
import { makeDebt, makeExpense, makeLimit, makeProfile, makeSubscription } from '@/test/fixtures';
import { bucketBalances } from './balances';
import {
  availableBalance,
  categoryBreakdown,
  limitLabel,
  limitStatus,
  reservedTotal,
  spendingSummary,
  upcomingBills,
} from './budget';
import { EXAMPLES } from './examples';
import { emptySnapshot } from './snapshot';

const TODAY = '2026-10-14';
const avl = EXAMPLES.find((e) => e.id === 'AVL-1')!;

describe('AVL-1 available balance', () => {
  it('lists this month’s bills: renewals to month end and the card balance', () => {
    expect(
      upcomingBills(avl.data, avl.today).map((b) => [b.date, b.name, b.amount, b.kind]),
    ).toEqual([
      ['2026-10-20', 'Streamflix', 15_99, 'subscription'],
      ['2026-10-21', 'Visa', 230_00, 'card'],
    ]);
  });

  it('computes reserved and available', () => {
    const bills = upcomingBills(avl.data, avl.today);
    const reserved = reservedTotal(avl.data, avl.today, 1);
    expect(reserved).toBe(1_200_00);
    expect(availableBalance(bucketBalances(avl.data, avl.today), bills, reserved)).toBe(2_654_01);
  });

  it('puts the food limit in the warning zone', () => {
    const food = avl.data.tables.budgetLimit.find((l) => l.category === 'food')!;
    expect(limitStatus(food, avl.data, avl.today, 1)).toMatchObject({
      spent: 100_00,
      remaining: 20_00,
      pct: 83,
      level: 'warn',
      range: { start: '2026-10-12', end: '2026-10-18' },
    });
  });
});

describe('limit levels', () => {
  it.each([
    [79_00, 'ok'],
    [80_00, 'warn'],
    [99_99, 'warn'],
    [100_00, 'over'],
    [119_99, 'over'],
    [120_00, 'way-over'],
  ])('spent %d of 100.00 is %s', (spent, level) => {
    const data = emptySnapshot();
    const limit = makeLimit({ category: 'food', period: 'monthly', amount: 100_00 });
    data.tables.expense = [makeExpense({ amount: spent, date: TODAY, category: 'food' })];
    expect(limitStatus(limit, data, TODAY, 1).level).toBe(level);
  });

  it('counts subscription charges and card spending, and only the matching category', () => {
    const data = emptySnapshot();
    const fun = makeLimit({ category: 'entertainment', period: 'monthly', amount: 100_00 });
    const overall = makeLimit({
      scope: 'overall',
      category: null,
      period: 'monthly',
      amount: 1_000_00,
    });
    data.tables.expense = [
      makeExpense({
        amount: 15_99,
        date: '2026-10-03',
        category: 'entertainment',
        subscriptionId: 'sub-1',
      }),
      makeExpense({
        amount: 30_00,
        date: '2026-10-05',
        category: 'entertainment',
        paymentMethod: 'credit_card',
        cardId: 'c1',
      }),
      makeExpense({ amount: 50_00, date: '2026-10-06', category: 'food' }),
      makeExpense({ amount: 70_00, date: '2026-09-30', category: 'entertainment' }),
    ];
    expect(limitStatus(fun, data, TODAY, 1).spent).toBe(45_99);
    expect(limitStatus(overall, data, TODAY, 1).spent).toBe(95_99);
  });

  it('labels limits', () => {
    expect(limitLabel(makeLimit({ category: 'food' }))).toBe('Food');
    expect(limitLabel(makeLimit({ scope: 'overall', category: null }))).toBe('Overall');
  });
});

describe('upcomingBills', () => {
  const data = () => {
    const d = emptySnapshot();
    d.tables.profile = [makeProfile({ openingDate: '2026-10-01' })];
    return d;
  };

  it('skips cancelled subscriptions and renewals after month end', () => {
    const d = data();
    d.tables.subscription = [
      makeSubscription({ name: 'Old', nextRenewal: '2026-10-20', status: 'cancelled' }),
      makeSubscription({ name: 'Next month', nextRenewal: '2026-11-01' }),
    ];
    expect(upcomingBills(d, TODAY)).toEqual([]);
  });

  it('looks as far as `until` says, while the default stops at month end', () => {
    const d = data();
    d.tables.subscription = [
      makeSubscription({ name: 'Early next month', amount: 15_99, nextRenewal: '2026-11-02' }),
      makeSubscription({ name: 'Later', amount: 9_99, nextRenewal: '2026-11-04' }),
    ];
    const names = (bills: ReturnType<typeof upcomingBills>) => bills.map((b) => [b.date, b.name]);

    expect(upcomingBills(d, '2026-10-28')).toEqual([]);
    expect(names(upcomingBills(d, '2026-10-28', '2026-11-03'))).toEqual([
      ['2026-11-02', 'Early next month'],
    ]);
    // `until` is a day that still counts.
    expect(names(upcomingBills(d, '2026-10-28', '2026-11-04'))).toEqual([
      ['2026-11-02', 'Early next month'],
      ['2026-11-04', 'Later'],
    ]);
    expect(upcomingBills(d, '2026-10-28', '2026-11-01')).toEqual([]);
  });

  it('lists each weekly renewal left this month', () => {
    const d = data();
    d.tables.subscription = [
      makeSubscription({ name: 'Box', amount: 10_00, cycle: 'weekly', nextRenewal: '2026-10-20' }),
    ];
    expect(upcomingBills(d, TODAY).map((b) => b.date)).toEqual(['2026-10-20', '2026-10-27']);
  });

  it('asks only the minimum payment for cards not paid in full, and nothing for a zero balance', () => {
    const d = data();
    d.tables.debt = [
      makeDebt({
        id: 'c1',
        name: 'Store card',
        openingBalance: 900_00,
        openingDate: '2026-10-01',
        payInFull: false,
        minimumPayment: 35_00,
        dueDay: 5,
      }),
      makeDebt({ id: 'c2', name: 'Empty', openingBalance: 0, openingDate: '2026-10-01' }),
    ];
    expect(upcomingBills(d, TODAY).map((b) => [b.date, b.name, b.amount])).toEqual([
      ['2026-11-05', 'Store card', 35_00],
    ]);
  });
});

describe('upcomingBills for a card with no minimum set', () => {
  it('bills the whole balance instead of nothing', () => {
    const d = emptySnapshot();
    d.tables.profile = [makeProfile({ openingDate: '2026-10-01' })];
    d.tables.debt = [
      makeDebt({
        id: 'c3',
        name: 'Revolving',
        openingBalance: 500_00,
        openingDate: '2026-10-01',
        payInFull: false,
        minimumPayment: 0,
        dueDay: 21,
      }),
    ];
    expect(upcomingBills(d, '2026-10-14').map((b) => b.amount)).toEqual([500_00]);
  });
});

describe('reservedTotal', () => {
  it('holds back what is left of reserved limits, never less than zero', () => {
    const d = emptySnapshot();
    d.tables.budgetLimit = [
      makeLimit({ category: 'rent', period: 'monthly', amount: 1_200_00, reserve: true }),
      makeLimit({ category: 'utilities', period: 'monthly', amount: 100_00, reserve: true }),
      makeLimit({ category: 'food', period: 'monthly', amount: 300_00, reserve: false }),
    ];
    d.tables.expense = [
      makeExpense({ amount: 200_00, date: '2026-10-02', category: 'rent' }),
      makeExpense({ amount: 150_00, date: '2026-10-02', category: 'utilities' }),
    ];
    expect(reservedTotal(d, TODAY, 1)).toBe(1_000_00);
  });
});

describe('spending', () => {
  const expenses = [
    makeExpense({ amount: 10_00, date: TODAY, category: 'food' }),
    makeExpense({ amount: 20_00, date: '2026-10-12', category: 'transport' }),
    makeExpense({ amount: 30_00, date: '2026-10-02', category: 'food' }),
    makeExpense({ amount: 40_00, date: '2026-01-02', category: 'shopping' }),
    makeExpense({ amount: 50_00, date: '2025-12-31', category: 'food' }),
  ];

  it('totals today, this week, this month and this year', () => {
    expect(spendingSummary(expenses, TODAY, 1)).toEqual({
      today: 10_00,
      week: 30_00,
      month: 60_00,
      year: 100_00,
    });
  });

  it('breaks a range down by category, biggest first', () => {
    expect(categoryBreakdown(expenses, { start: '2026-01-01', end: '2026-12-31' })).toEqual([
      { category: 'food', amount: 40_00 },
      { category: 'shopping', amount: 40_00 },
      { category: 'transport', amount: 20_00 },
    ]);
  });
});
