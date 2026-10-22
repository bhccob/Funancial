import { describe, expect, it } from 'vitest';
import {
  makeAccount,
  makeDividend,
  makeExpense,
  makeIncome,
  makeTransaction,
} from '@/test/fixtures';
import { categoryRows, spendSeries } from './cardSpend';
import type { Category } from './entities';
import { emptySnapshot, type DataSnapshot } from './snapshot';

const TODAY = '2026-10-22';
const MAIN = 'acct-main';
const VISA = 'card-1';

/** An expense of `amount` on `date`, paid with `accountId` (Main account unless said). */
const spent = (date: string, amount: number, category: Category = 'food', accountId = MAIN) =>
  makeExpense({ date, amount, category, accountId });

function world(...expenses: ReturnType<typeof spent>[]): DataSnapshot {
  const data = emptySnapshot();
  data.tables.account = [
    makeAccount({ id: MAIN, openingDate: '2020-01-01' }),
    makeAccount({ id: VISA, kind: 'credit', openingDate: '2020-01-01', order: 1 }),
  ];
  data.tables.expense = expenses;
  return data;
}

/**
 * Main account's spending around 22 Oct 2026: 75.00 this month so far, 45.00 in Sep 1-22 (1,045.00
 * with Sep 23), 30.00 in the last 14 days against 45.00 in the 14 before.
 */
function main() {
  return world(
    spent('2026-10-22', 10_00),
    spent('2026-10-15', 20_00),
    spent('2026-10-08', 15_00, 'transport'),
    spent('2026-10-01', 30_00, 'rent'),
    spent('2026-09-23', 1_000_00),
    spent('2026-09-22', 40_00),
    spent('2026-09-01', 5_00),
    spent('2026-08-31', 7_00),
    spent('2026-10-23', 999_00), // not yet: dated after today
    // Other years.
    spent('2025-10-23', 90_00),
    spent('2025-06-15', 500_00),
    spent('2024-01-01', 60_00),
    spent('2023-12-31', 70_00),
    spent('2022-12-31', 80_00),
    // Another account's.
    spent('2026-10-10', 99_00, 'food', VISA),
  );
}

describe('spendSeries by day', () => {
  it('is the last 14 days, oldest first, ending today', () => {
    const { label, bars } = spendSeries(main(), MAIN, 'day', TODAY);
    expect(label).toBe('Spent in the last 14 days');
    expect(bars).toHaveLength(14);
    expect(bars[0]).toEqual({ key: '2026-10-09', amount: 0 });
    expect(bars[13]).toEqual({ key: '2026-10-22', amount: 10_00 });
    expect(bars.find((b) => b.key === '2026-10-15')?.amount).toBe(20_00);
    // Oct 8 is the 15th day back.
    expect(bars.map((b) => b.key)).not.toContain('2026-10-08');
  });

  it('totals the bars, and changes against the 14 days before them', () => {
    const { total, change } = spendSeries(main(), MAIN, 'day', TODAY);
    expect(total).toBe(30_00);
    // Sep 25 to Oct 8 held 45.00 (Oct 1 and Oct 8): 30.00 is a third less.
    expect(change).toBe(-33.33);
  });

  it('sums the days of one date', () => {
    const data = world(spent('2026-10-20', 4_00), spent('2026-10-20', 6_50, 'transport'));
    const { bars, total } = spendSeries(data, MAIN, 'day', TODAY);
    expect(bars.find((b) => b.key === '2026-10-20')?.amount).toBe(10_50);
    expect(total).toBe(10_50);
  });

  it('crosses a month and a year on the way back', () => {
    const { bars } = spendSeries(world(), MAIN, 'day', '2027-01-05');
    expect(bars[0]!.key).toBe('2026-12-23');
    expect(bars[13]!.key).toBe('2027-01-05');
    expect(bars.map((b) => b.key)).toContain('2026-12-31');
  });
});

describe('spendSeries by month', () => {
  it('is the last 12 months, oldest first, ending with this one', () => {
    const { label, bars } = spendSeries(main(), MAIN, 'month', TODAY);
    expect(label).toBe('Spent this month');
    expect(bars.map((b) => b.key)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    // Each bar is its whole month; this month's is what has been spent so far.
    expect(bars.map((b) => b.amount)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 7_00, 1_045_00, 75_00]);
  });

  it('totals this month so far and changes against the same days of last month', () => {
    const { total, change } = spendSeries(main(), MAIN, 'month', TODAY);
    expect(total).toBe(75_00);
    // Oct 1-22 against Sep 1-22 (45.00): Sep 23 is not part of it.
    expect(change).toBe(66.67);
  });

  it('compares the last day of March with February as a whole', () => {
    const data = world(
      spent('2026-03-31', 30_00),
      spent('2026-03-01', 10_00),
      spent('2026-02-28', 20_00),
      spent('2026-02-01', 5_00),
      spent('2026-01-31', 1_000_00),
    );
    const { total, change } = spendSeries(data, MAIN, 'month', '2026-03-31');
    expect(total).toBe(40_00);
    expect(change).toBe(60); // against 25.00
  });

  it('compares the last day of March with a leap February, 29th included', () => {
    const data = world(spent('2028-03-31', 30_00), spent('2028-02-29', 20_00));
    expect(spendSeries(data, MAIN, 'month', '2028-03-31').change).toBe(50);
  });

  it('compares the 31st with the whole of a 30-day month', () => {
    const data = world(spent('2026-10-31', 30_00), spent('2026-09-30', 20_00));
    expect(spendSeries(data, MAIN, 'month', '2026-10-31').change).toBe(50);
  });

  it('compares January with the December before', () => {
    const data = world(
      spent('2027-01-15', 30_00),
      spent('2026-12-15', 10_00),
      spent('2026-12-16', 500_00),
    );
    const { total, change, bars } = spendSeries(data, MAIN, 'month', '2027-01-15');
    expect(total).toBe(30_00);
    expect(change).toBe(200);
    expect(bars[0]!.key).toBe('2026-02');
    expect(bars[11]!.key).toBe('2027-01');
  });
});

describe('spendSeries by year', () => {
  it('is the last 4 years, oldest first, ending with this one', () => {
    const { label, bars } = spendSeries(main(), MAIN, 'year', TODAY);
    expect(label).toBe('Spent this year');
    expect(bars).toEqual([
      { key: '2023', amount: 70_00 },
      { key: '2024', amount: 60_00 },
      { key: '2025', amount: 590_00 },
      { key: '2026', amount: 1_127_00 },
    ]);
  });

  it('totals this year so far and changes against the same days of last year', () => {
    const { total, change } = spendSeries(main(), MAIN, 'year', TODAY);
    expect(total).toBe(1_127_00);
    // Jan 1 to Oct 22 of 2025 held 500.00: Oct 23 is not part of it.
    expect(change).toBe(125.4);
  });

  it('compares Feb 29 with the end of February the year before', () => {
    const data = world(
      spent('2028-02-29', 30_00),
      spent('2027-02-28', 20_00),
      spent('2027-03-01', 900_00),
    );
    expect(spendSeries(data, MAIN, 'year', '2028-02-29').change).toBe(50);
  });
});

describe('spendSeries', () => {
  it('follows the account: only its own expenses count', () => {
    const data = main();
    expect(spendSeries(data, VISA, 'month', TODAY).total).toBe(99_00);
    expect(spendSeries(data, VISA, 'day', TODAY).total).toBe(99_00);
    expect(spendSeries(data, VISA, 'year', TODAY).total).toBe(99_00);
    expect(spendSeries(data, MAIN, 'month', TODAY).total).toBe(75_00);
    const octoberBar = spendSeries(data, VISA, 'month', TODAY).bars[11];
    expect(octoberBar).toEqual({ key: '2026-10', amount: 99_00 });
  });

  it('has no change when there is nothing to compare with', () => {
    const data = main();
    // The Visa spent nothing last month, in the 14 days before, or last year.
    expect(spendSeries(data, VISA, 'month', TODAY).change).toBeNull();
    expect(spendSeries(data, VISA, 'day', TODAY).change).toBeNull();
    expect(spendSeries(data, VISA, 'year', TODAY).change).toBeNull();
  });

  it('is empty for an account that spent nothing, or that does not exist', () => {
    for (const id of ['acct-gone', 'acct-empty']) {
      for (const range of ['day', 'month', 'year'] as const) {
        const series = spendSeries(main(), id, range, TODAY);
        expect(series.total).toBe(0);
        expect(series.change).toBeNull();
        expect(series.bars.every((b) => b.amount === 0)).toBe(true);
        expect(series.bars).toHaveLength({ day: 14, month: 12, year: 4 }[range]);
      }
    }
  });

  it('shows a fall to nothing as -100', () => {
    const data = world(spent('2026-09-10', 20_00));
    expect(spendSeries(data, MAIN, 'month', TODAY).change).toBe(-100);
  });

  it('counts expenses only: income, transfers, card payments and dividends are not spending', () => {
    const data = world(spent('2026-10-20', 12_50));
    data.tables.income = [makeIncome({ date: '2026-10-20', amount: 4_000_00, accountId: MAIN })];
    data.tables.transaction = [
      makeTransaction({ date: '2026-10-20', amount: 300_00, fromAccountId: MAIN }),
      makeTransaction({
        type: 'card_payment',
        date: '2026-10-20',
        amount: 50_00,
        fromAccountId: MAIN,
        toAccountId: VISA,
      }),
    ];
    data.tables.dividend = [makeDividend({ paidOn: '2026-10-20', accountId: MAIN })];
    expect(spendSeries(data, MAIN, 'month', TODAY).total).toBe(12_50);
    expect(spendSeries(data, VISA, 'month', TODAY).total).toBe(0);
  });

  it('counts a subscription renewal as spending, like any expense', () => {
    const data = world();
    data.tables.expense = [
      makeExpense({ date: '2026-10-12', amount: 15_99, subscriptionId: 'sub' }),
    ];
    expect(spendSeries(data, MAIN, 'month', TODAY).total).toBe(15_99);
  });
});

describe('categoryRows', () => {
  it('lists this month by category, the biggest first, with how many, how much and what share', () => {
    expect(categoryRows(main(), MAIN, TODAY)).toEqual([
      { category: 'food', count: 2, amount: 30_00, percent: 40 },
      { category: 'rent', count: 1, amount: 30_00, percent: 40 },
      { category: 'transport', count: 1, amount: 15_00, percent: 20 },
    ]);
  });

  it('leaves out other months, dates after today and other accounts', () => {
    const rows = categoryRows(main(), VISA, TODAY);
    expect(rows).toEqual([{ category: 'food', count: 1, amount: 99_00, percent: 100 }]);
  });

  it('shares add up to 100 whole percent', () => {
    const data = world(
      spent('2026-10-01', 10_00, 'rent'),
      spent('2026-10-02', 10_00, 'transport'),
      spent('2026-10-03', 10_00, 'food'),
    );
    const rows = categoryRows(data, MAIN, TODAY);
    // A tie keeps the order the categories are offered in.
    expect(rows.map((r) => [r.category, r.percent])).toEqual([
      ['food', 34],
      ['transport', 33],
      ['rent', 33],
    ]);
    expect(rows.reduce((sum, r) => sum + r.percent, 0)).toBe(100);
  });

  it('is empty when nothing was spent this month, or the account is unknown', () => {
    expect(categoryRows(world(spent('2026-09-30', 5_00)), MAIN, TODAY)).toEqual([]);
    expect(categoryRows(main(), 'acct-gone', TODAY)).toEqual([]);
  });

  it('follows the month of today', () => {
    const rows = categoryRows(main(), MAIN, '2026-09-30');
    expect(rows).toEqual([{ category: 'food', count: 3, amount: 1_045_00, percent: 100 }]);
  });
});
