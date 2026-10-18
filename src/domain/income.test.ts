import { describe, expect, it } from 'vitest';
import { makeDividend, makeIncome, makeProfile, makeTransaction } from '@/test/fixtures';
import { dividendTotals } from './dividends';
import { averageIncome, incomeByMonth, incomeThisYear, wholePercents } from './income';
import { emptySnapshot, type DataSnapshot } from './snapshot';

const TODAY = '2026-10-14';

function snapshot(): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile());
  return data;
}

const salary = (date: string, amount: number, over: Parameters<typeof makeIncome>[0] = {}) =>
  makeIncome({ source: 'salary', label: 'Salary', date, amount, ...over });
const extra = (date: string, amount: number, label = 'Freelance') =>
  makeIncome({ source: 'extra', label, date, amount });
const dividend = (paidOn: string, amount: number, over: Parameters<typeof makeDividend>[0] = {}) =>
  makeDividend({ paidOn, expectedPayDate: paidOn, amount, ...over });

describe('incomeByMonth', () => {
  it('lists twelve local calendar months, oldest first, ending with this month', () => {
    const rows = incomeByMonth(snapshot(), TODAY, 12);
    expect(rows).toHaveLength(12);
    expect(rows[0]!.month).toBe('2025-11');
    expect(rows[11]!.month).toBe('2026-10');
  });

  it('gives an empty month 0 in every part', () => {
    for (const row of incomeByMonth(snapshot(), TODAY, 12)) {
      expect(row).toEqual({ month: row.month, salary: 0, extra: 0, dividends: 0, total: 0 });
    }
  });

  it('splits salary, extra and dividends by the month each arrived', () => {
    const data = snapshot();
    data.tables.income.push(
      salary('2026-10-05', 4_200_00),
      extra('2026-10-10', 150_00),
      extra('2026-10-12', 50_00, 'Gift'),
      salary('2026-09-25', 4_000_00),
    );
    data.tables.dividend.push(dividend('2026-10-03', 13_00), dividend('2026-08-20', 7_50));
    const rows = incomeByMonth(data, TODAY, 12);
    const at = (month: string) => rows.find((r) => r.month === month);

    expect(at('2026-10')).toEqual({
      month: '2026-10',
      salary: 4_200_00,
      extra: 200_00,
      dividends: 13_00,
      total: 4_413_00,
    });
    expect(at('2026-09')).toMatchObject({ salary: 4_000_00, extra: 0, dividends: 0 });
    expect(at('2026-08')).toMatchObject({ salary: 0, extra: 0, dividends: 7_50, total: 7_50 });
  });

  it('counts a dividend on the day it was paid, whichever bucket it went to, reinvested included', () => {
    const data = snapshot();
    data.tables.dividend.push(
      dividend('2026-10-02', 10_00, { bucket: 'cash' }),
      dividend('2026-10-03', 20_00, { bucket: 'savings' }),
      dividend('2026-10-04', 30_00, { bucket: 'passive' }),
      dividend('2026-10-05', 40_00, { bucket: 'reinvest', sharesAdded: 0.5 }),
      // Expected in September, but it arrived in October.
      makeDividend({ expectedPayDate: '2026-09-28', paidOn: '2026-10-06', amount: 5_00 }),
    );
    expect(incomeByMonth(data, TODAY, 1)[0]!.dividends).toBe(105_00);
    expect(incomeByMonth(data, TODAY, 12)[10]!.dividends).toBe(0);
  });

  it('leaves out salaries that are expected or skipped, and dividends that were skipped', () => {
    const data = snapshot();
    data.tables.income.push(
      salary('2026-10-25', 4_200_00, { status: 'expected' }),
      salary('2026-09-25', 4_200_00, { status: 'skipped' }),
      salary('2026-08-25', 4_200_00, { status: 'confirmed' }),
    );
    data.tables.dividend.push(
      dividend('2026-10-01', 0, { status: 'skipped', bucket: null }),
      dividend('2026-09-01', 0, { status: 'skipped', bucket: null }),
    );
    const rows = incomeByMonth(data, TODAY, 12).filter((r) => r.total > 0);
    expect(rows.map((r) => [r.month, r.total])).toEqual([['2026-08', 4_200_00]]);
  });

  it('does not count moving money between cash and savings, or a balance correction, as income', () => {
    const data = snapshot();
    data.tables.transaction.push(
      makeTransaction({
        type: 'transfer',
        amount: 300_00,
        date: '2026-10-05',
        from: 'cash',
        to: 'savings',
      }),
      makeTransaction({
        type: 'adjustment',
        amount: 80_00,
        date: '2026-10-06',
        from: null,
        to: 'cash',
      }),
    );
    expect(incomeByMonth(data, TODAY, 12).every((r) => r.total === 0)).toBe(true);
  });

  it('puts income either side of a year boundary in the right month', () => {
    const data = snapshot();
    data.tables.income.push(
      salary('2025-12-31', 100_00),
      salary('2026-01-01', 200_00),
      extra('2025-02-01', 999_00), // 12 months back from Jan 2026 starts in Feb 2025
      extra('2025-01-31', 888_00), // one month too old to show
    );
    const rows = incomeByMonth(data, '2026-01-20', 12);
    expect(rows[0]!.month).toBe('2025-02');
    expect(rows[0]!.extra).toBe(999_00);
    expect(rows.find((r) => r.month === '2025-12')!.salary).toBe(100_00);
    expect(rows.find((r) => r.month === '2026-01')!.salary).toBe(200_00);
    expect(rows.reduce((sum, r) => sum + r.total, 0)).toBe(100_00 + 200_00 + 999_00);
  });

  it('returns the last few months when asked for fewer', () => {
    const data = snapshot();
    data.tables.income.push(
      salary('2026-10-05', 1_00),
      salary('2026-08-05', 2_00),
      salary('2026-07-05', 4_00),
    );
    const rows = incomeByMonth(data, TODAY, 3);
    expect(rows.map((r) => [r.month, r.total])).toEqual([
      ['2026-08', 2_00],
      ['2026-09', 0],
      ['2026-10', 1_00],
    ]);
  });
});

describe('averageIncome', () => {
  it('is the total over the months shown, divided by their number', () => {
    const data = snapshot();
    // Twelve months, 1000 in every one of them but October's 4000: (11 * 1000 + 4000) / 12 = 1250.
    for (let m = 11; m <= 12; m++) data.tables.income.push(salary(`2025-${m}-05`, 1_000_00));
    for (let m = 1; m <= 9; m++) {
      data.tables.income.push(salary(`2026-${String(m).padStart(2, '0')}-05`, 1_000_00));
    }
    data.tables.income.push(salary('2026-10-05', 3_000_00), extra('2026-10-06', 1_000_00));
    expect(averageIncome(incomeByMonth(data, TODAY, 12))).toBe(1_250_00);
  });

  it('starts at the first month with income, so months before the person began do not drag it down', () => {
    const data = snapshot();
    data.tables.income.push(salary('2026-08-25', 4_000_00), salary('2026-09-25', 2_000_00));
    // Aug, Sep and Oct (nothing yet): 6000 / 3, not 6000 / 12.
    expect(averageIncome(incomeByMonth(data, TODAY, 12))).toBe(2_000_00);
  });

  it('counts empty months after the first income, and rounds to a whole minor unit', () => {
    const data = snapshot();
    data.tables.income.push(salary('2026-08-25', 1_00));
    expect(averageIncome(incomeByMonth(data, TODAY, 12))).toBe(33); // 100 / 3
  });

  it('is 0 with no income at all', () => {
    expect(averageIncome(incomeByMonth(snapshot(), TODAY, 12))).toBe(0);
    expect(averageIncome([])).toBe(0);
  });
});

describe('incomeThisYear', () => {
  it('totals the year so far into salary, extra and dividends', () => {
    const data = snapshot();
    data.tables.income.push(
      salary('2026-01-25', 4_000_00),
      salary('2026-09-25', 4_000_00),
      extra('2026-05-02', 500_00),
      salary('2025-12-25', 9_999_00), // last year
      salary('2026-10-25', 4_000_00, { status: 'expected' }),
      salary('2026-02-25', 4_000_00, { status: 'skipped' }),
    );
    data.tables.dividend.push(
      dividend('2026-03-10', 30_00),
      dividend('2026-04-10', 40_00, { bucket: 'reinvest' }),
      dividend('2025-12-30', 777_00),
    );
    const year = incomeThisYear(data, TODAY);
    expect(year).toMatchObject({ salary: 8_000_00, extra: 500_00, dividends: 70_00 });
    expect(year.total).toBe(8_570_00);
    expect(year.dividends).toBe(dividendTotals(data, TODAY).year);
  });

  it('starts the year on 1 January and ends it on 31 December', () => {
    const data = snapshot();
    data.tables.income.push(salary('2025-12-31', 1_00), salary('2026-01-01', 2_00));
    expect(incomeThisYear(data, '2026-01-02').total).toBe(2_00);
    expect(incomeThisYear(data, '2025-12-31').total).toBe(1_00);
  });

  it('is all zeros with nothing to count', () => {
    expect(incomeThisYear(snapshot(), TODAY)).toEqual({
      salary: 0,
      extra: 0,
      dividends: 0,
      total: 0,
      top: [],
    });
  });

  it('ranks the biggest sources: income by label, dividends by symbol, biggest first', () => {
    const data = snapshot();
    data.tables.income.push(
      salary('2026-01-25', 4_000_00),
      salary('2026-02-25', 4_000_00),
      extra('2026-03-01', 300_00, 'Freelance'),
      extra('2026-04-01', 250_00, 'Freelance'),
      extra('2026-05-01', 120_00, 'Gift'),
    );
    data.tables.dividend.push(
      dividend('2026-03-10', 30_00, { symbol: 'KO' }),
      dividend('2026-06-10', 31_00, { symbol: 'KO' }),
      dividend('2026-04-10', 12_00, { symbol: 'VWRL' }),
    );
    expect(incomeThisYear(data, TODAY).top).toEqual([
      { name: 'Salary', amount: 8_000_00 },
      { name: 'Freelance', amount: 550_00 },
      { name: 'Gift', amount: 120_00 },
      { name: 'KO', amount: 61_00 },
      { name: 'VWRL', amount: 12_00 },
    ]);
  });

  it('keeps the five biggest, skips a payout of nothing, and ignores last year', () => {
    const data = snapshot();
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach((label, i) =>
      data.tables.income.push(extra('2026-02-01', (i + 1) * 100_00, label)),
    );
    data.tables.dividend.push(dividend('2026-02-01', 0, { symbol: 'ZERO' }));
    data.tables.income.push(extra('2025-02-01', 5_000_00, 'Old'));
    expect(incomeThisYear(data, TODAY).top.map((s) => s.name)).toEqual(['F', 'E', 'D', 'C', 'B']);
  });

  it('keeps an income label and a dividend symbol of the same name apart, and names a blank label by its source', () => {
    const data = snapshot();
    data.tables.income.push(
      extra('2026-02-01', 10_00, 'KO'),
      extra('2026-02-02', 20_00, '  '),
      extra('2026-02-03', 5_00, ' Gift '),
      extra('2026-02-04', 5_00, 'Gift'),
    );
    data.tables.dividend.push(dividend('2026-02-05', 30_00, { symbol: 'KO' }));
    expect(incomeThisYear(data, TODAY).top).toEqual([
      { name: 'KO', amount: 30_00 },
      { name: 'Extra income', amount: 20_00 },
      { name: 'Gift', amount: 10_00 },
      { name: 'KO', amount: 10_00 },
    ]);
  });
});

describe('wholePercents', () => {
  it('adds up to 100 where plain rounding gives 99 or 101', () => {
    // Plain rounding: 33 + 33 + 33 = 99, and 17 + 17 + 67 = 101.
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholePercents([1, 1, 4])).toEqual([17, 16, 67]);
    expect(wholePercents([3, 0, 1])).toEqual([75, 0, 25]);
  });

  it('is all zeros with nothing to share', () => {
    expect(wholePercents([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
