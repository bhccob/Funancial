import { describe, expect, it } from 'vitest';
import {
  makeDebt,
  makeExpense,
  makeHolding,
  makeLimit,
  makeProfile,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import {
  categorySlices,
  monthLine,
  netWorthChangeThisMonth,
  netWorthOn,
  netWorthSeries,
  paceStatus,
  periodProgress,
  spendingByDay,
} from './charts';
import type { Category } from './entities';
import { emptySnapshot } from './snapshot';
import { computeFinanceView } from './view';

const TODAY = '2026-10-15'; // a Thursday
const OCTOBER = { start: '2026-10-01', end: '2026-10-31' };

function spend(category: Category, amount: number, date = '2026-10-05') {
  return makeExpense({ category, amount, date });
}

describe('spendingByDay', () => {
  it('lists every day of the window, oldest first, with 0 for quiet days', () => {
    const expenses = [
      makeExpense({ date: '2026-10-13', amount: 20_00 }),
      makeExpense({ date: '2026-10-15', amount: 15_00 }),
      makeExpense({ date: '2026-10-15', amount: 5_00 }),
      makeExpense({ date: '2026-10-12', amount: 99_00 }), // outside the window
    ];
    expect(spendingByDay(expenses, TODAY, 3)).toEqual([
      { day: '2026-10-13', amount: 20_00 },
      { day: '2026-10-14', amount: 0 },
      { day: '2026-10-15', amount: 20_00 },
    ]);
  });

  it('crosses a month boundary without skipping or repeating a day', () => {
    const days = spendingByDay([], '2026-11-02', 4).map((d) => d.day);
    expect(days).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('is empty for a window of no days', () => {
    expect(spendingByDay([makeExpense({ date: TODAY })], TODAY, 0)).toEqual([]);
  });
});

describe('categorySlices', () => {
  it('lists the categories with spending, highest first', () => {
    const expenses = [
      spend('transport', 10_00),
      spend('food', 30_00),
      spend('food', 5_00),
      spend('shopping', 0),
      spend('rent', 20_00, '2026-09-30'), // outside the range
    ];
    expect(categorySlices(expenses, OCTOBER)).toEqual([
      { key: 'food', label: 'Food', amount: 35_00 },
      { key: 'transport', label: 'Transport', amount: 10_00 },
    ]);
  });

  it('keeps the top five categories and folds the rest into Other', () => {
    const expenses = [
      spend('food', 70_00),
      spend('transport', 60_00),
      spend('rent', 50_00),
      spend('utilities', 40_00),
      spend('entertainment', 30_00),
      spend('health', 20_00),
      spend('shopping', 10_00),
    ];
    const slices = categorySlices(expenses, OCTOBER);
    expect(slices).toHaveLength(6);
    expect(slices.slice(0, 5).map((s) => s.key)).toEqual([
      'food',
      'transport',
      'rent',
      'utilities',
      'entertainment',
    ]);
    expect(slices[5]).toEqual({ key: 'other', label: 'Other', amount: 30_00 });
  });

  it('folds the "other" category into Other, and returns [] with no spending', () => {
    expect(categorySlices([], OCTOBER)).toEqual([]);
    expect(categorySlices([spend('food', 10_00, '2026-09-01')], OCTOBER)).toEqual([]);

    // Even the biggest "other" spending is never ranked: it sits in the Other slice, last.
    const few = [spend('other', 90_00), spend('food', 10_00)];
    expect(categorySlices(few, OCTOBER)).toEqual([
      { key: 'food', label: 'Food', amount: 10_00 },
      { key: 'other', label: 'Other', amount: 90_00 },
    ]);

    // And it joins the categories that were folded away.
    const many = [
      spend('food', 70_00),
      spend('transport', 60_00),
      spend('rent', 50_00),
      spend('utilities', 40_00),
      spend('entertainment', 30_00),
      spend('health', 20_00),
      spend('other', 5_00),
    ];
    const slices = categorySlices(many, OCTOBER);
    expect(slices).toHaveLength(6);
    expect(slices[5]).toEqual({ key: 'other', label: 'Other', amount: 25_00 });
  });

  it('shows exactly five categories without an Other slice', () => {
    const five = [
      spend('food', 50_00),
      spend('transport', 40_00),
      spend('rent', 30_00),
      spend('utilities', 20_00),
      spend('health', 10_00),
    ];
    expect(categorySlices(five, OCTOBER).map((s) => s.key)).toEqual([
      'food',
      'transport',
      'rent',
      'utilities',
      'health',
    ]);
  });

  it('takes the number of categories to keep', () => {
    const expenses = [spend('food', 30_00), spend('transport', 20_00), spend('rent', 10_00)];
    expect(categorySlices(expenses, OCTOBER, 2).map((s) => [s.key, s.amount])).toEqual([
      ['food', 30_00],
      ['transport', 20_00],
      ['other', 10_00],
    ]);
  });
});

describe('net worth over time', () => {
  function worth() {
    const data = emptySnapshot();
    data.tables.profile = [
      makeProfile({ openingDate: '2026-09-01', openingCash: 1_000_00, openingSavings: 0 }),
    ];
    data.tables.expense = [makeExpense({ date: '2026-10-05', amount: 200_00 })];
    return data;
  }

  it('computes net worth on a past day and the change this month', () => {
    const data = worth();
    expect(netWorthOn(data, '2026-09-30')).toBe(1_000_00);
    expect(netWorthOn(data, TODAY)).toBe(800_00);
    expect(netWorthChangeThisMonth(data, TODAY)).toBe(-200_00);
  });

  it('subtracts debts as they stood on the day', () => {
    const data = worth();
    data.tables.debt = [
      makeDebt({ id: 'visa', openingBalance: 100_00, openingDate: '2026-09-01' }),
    ];
    data.tables.transaction = [
      makeTransaction({
        type: 'card_payment',
        from: 'cash',
        to: null,
        debtId: 'visa',
        amount: 40_00,
        date: '2026-10-10',
      }),
    ];
    expect(netWorthOn(data, '2026-10-09')).toBe(800_00 - 100_00);
    // 40.00 left cash and 40.00 left the card: net worth is unchanged by paying it.
    expect(netWorthOn(data, '2026-10-10')).toBe(760_00 - 60_00);
  });

  it('measures the change from the day before the 1st, even on the 1st', () => {
    const data = worth();
    data.tables.expense = [makeExpense({ date: '2026-10-01', amount: 30_00 })];
    expect(netWorthChangeThisMonth(data, '2026-10-01')).toBe(-30_00);
    expect(netWorthChangeThisMonth(data, '2026-11-01')).toBe(0);
  });

  it('adds investments to net worth and to the trend from each purchase date', () => {
    const data = worth();
    const quote = {
      price: 60,
      previousClose: null,
      fxRate: null,
      asOf: '2026-10-15T10:00:00.000Z',
    };
    data.tables.holding = [
      makeHolding({ shares: 10, purchaseDate: '2026-10-08', quote }), // 600.00 at today's price
      makeHolding({ shares: 1, purchaseDate: '2026-10-12', manualPrice: 25 }), // 25.00
      makeHolding({ shares: 5, purchaseDate: '2026-10-01', quote: null }), // unpriced: adds nothing
    ];
    expect(netWorthOn(data, '2026-10-07')).toBe(800_00);
    expect(netWorthOn(data, '2026-10-08')).toBe(800_00 + 600_00);
    expect(netWorthOn(data, '2026-10-11')).toBe(800_00 + 600_00);
    expect(netWorthOn(data, TODAY)).toBe(800_00 + 600_00 + 25_00);
    const series = netWorthSeries(data, TODAY, 10);
    expect(series.map((p) => p.value)).toEqual([
      800_00, 800_00, 1_400_00, 1_400_00, 1_400_00, 1_400_00, 1_425_00, 1_425_00, 1_425_00,
      1_425_00,
    ]);
  });

  it('gives a 30-point series ending today', () => {
    const series = netWorthSeries(worth(), TODAY, 30);
    expect(series).toHaveLength(30);
    expect(series[0]).toEqual({ day: '2026-09-16', value: 1_000_00 });
    expect(series[29]).toEqual({ day: TODAY, value: 800_00 });
    expect(series.map((p) => p.day)).toEqual([...series.map((p) => p.day)].sort());
    expect(series.find((p) => p.day === '2026-10-04')?.value).toBe(1_000_00);
    expect(series.find((p) => p.day === '2026-10-05')?.value).toBe(800_00);
  });
});

describe('limit pace', () => {
  it('measures how far through the period today is', () => {
    expect(periodProgress('monthly', TODAY, 1)).toBeCloseTo(15 / 31, 10);
    expect(periodProgress('weekly', TODAY, 1)).toBeCloseTo(4 / 7, 10); // Thursday, Monday start
    expect(periodProgress('weekly', TODAY, 0)).toBeCloseTo(5 / 7, 10); // Thursday, Sunday start
  });

  it('is a full period on its last day and a first day on its first', () => {
    expect(periodProgress('monthly', '2026-10-31', 1)).toBe(1);
    expect(periodProgress('monthly', '2026-02-01', 1)).toBeCloseTo(1 / 28, 10);
    expect(periodProgress('weekly', '2026-10-18', 1)).toBe(1); // Sunday ends a Monday week
    expect(periodProgress('weekly', '2026-10-12', 1)).toBeCloseTo(1 / 7, 10);
  });

  it('calls pace ahead, on or under with a 5-point band', () => {
    expect(paceStatus(72, 15 / 31)).toBe('ahead');
    expect(paceStatus(50, 15 / 31)).toBe('on');
    expect(paceStatus(39, 4 / 7)).toBe('under');
    expect(paceStatus(135, 0.5)).toBe('ahead');
  });
});

describe('monthLine', () => {
  function view(limits = [] as ReturnType<typeof makeLimit>[]) {
    const data = emptySnapshot();
    data.tables.profile = [makeProfile({ openingDate: '2026-10-01' })];
    data.tables.expense = [
      makeExpense({ date: '2026-10-03', amount: 300_00 }),
      makeExpense({ date: '2026-10-10', amount: 100_00 }),
      makeExpense({ date: '2026-09-20', amount: 999_00 }), // last month
    ];
    data.tables.budgetLimit = limits;
    return computeFinanceView(data, TODAY, 1);
  }

  it('builds the month line from spending, bills and the overall monthly limit', () => {
    const overall = makeLimit({
      scope: 'overall',
      category: null,
      period: 'monthly',
      amount: 1_000_00,
    });
    const line = monthLine(view([makeLimit({ period: 'monthly', amount: 50_00 }), overall]));
    expect(line).toEqual({ spent: 400_00, bills: 0, left: 600_00 });
  });

  it('counts the bills still to come this month', () => {
    const data = emptySnapshot();
    data.tables.profile = [makeProfile({ openingDate: '2026-10-01' })];
    data.tables.subscription = [makeSubscription({ amount: 15_99, nextRenewal: '2026-10-20' })];
    expect(monthLine(computeFinanceView(data, TODAY, 1))).toEqual({
      spent: 0,
      bills: 15_99,
      left: null,
    });
  });

  it('never lets left go below zero', () => {
    const overall = makeLimit({
      scope: 'overall',
      category: null,
      period: 'monthly',
      amount: 250_00,
    });
    expect(monthLine(view([overall])).left).toBe(0);
  });

  it('has left null when there is no overall monthly limit', () => {
    expect(monthLine(view()).left).toBeNull();
    const weeklyOverall = makeLimit({ scope: 'overall', category: null, period: 'weekly' });
    const categoryMonthly = makeLimit({ category: 'food', period: 'monthly' });
    expect(monthLine(view([weeklyOverall, categoryMonthly])).left).toBeNull();
  });
});
