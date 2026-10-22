import { describe, expect, it } from 'vitest';
import {
  makeAccount,
  makeDebt,
  makeDividend,
  makeExpense,
  makeIncome,
  makeProfile,
  makeTransaction,
} from '@/test/fixtures';
import { netWorthChangeThisMonth, netWorthOn } from './charts';
import { addDays } from './dates';
import { monthToDate, netWorthSummary } from './overview';
import { emptySnapshot, type DataSnapshot } from './snapshot';
import { computeFinanceView } from './view';

const TODAY = '2026-10-22';
const MAIN = 'acct-main';

const spent = (date: string, amount: number) => makeExpense({ date, amount, accountId: MAIN });
const earned = (date: string, amount: number, status: 'confirmed' | 'expected' | 'skipped') =>
  makeIncome({ date, amount, status, period: date.slice(0, 7) });

function world(): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ openingDate: '2026-01-01' })];
  data.tables.account = [makeAccount({ id: MAIN, openingDate: '2026-01-01' })];
  return data;
}

describe('monthToDate', () => {
  /**
   * October to the 22nd: 75.00 spent (the 999.00 of the 23rd is not yet) and 1,000.00 earned (an
   * expected and a skipped salary don't count). September 1-22: 50.00 spent (the 500.00 of the 23rd
   * is past the same day) and 800.00 earned.
   */
  function october() {
    const data = world();
    data.tables.expense = [
      spent('2026-10-01', 50_00),
      spent('2026-10-22', 25_00),
      spent('2026-10-23', 999_00),
      spent('2026-09-01', 20_00),
      spent('2026-09-22', 30_00),
      spent('2026-09-23', 500_00),
    ];
    data.tables.income = [
      earned('2026-10-05', 1_000_00, 'confirmed'),
      earned('2026-10-06', 3_000_00, 'expected'),
      earned('2026-10-07', 2_000_00, 'skipped'),
      earned('2026-09-10', 800_00, 'confirmed'),
      earned('2026-09-25', 4_000_00, 'confirmed'),
    ];
    return data;
  }

  it('adds up this month so far, and compares it with the same days of last month', () => {
    const overview = monthToDate(october(), TODAY);
    expect(overview.expenses).toBe(75_00);
    expect(overview.income).toBe(1_000_00);
    // Oct 1-22 against Sep 1-22: 75 against 50, 1,000 against 800.
    expect(overview.expensesChange).toBe(50);
    expect(overview.incomeChange).toBe(25);
  });

  it('counts expenses only, and confirmed income only', () => {
    const data = october();
    data.tables.transaction = [
      makeTransaction({ type: 'transfer', amount: 70_00, date: '2026-10-10' }),
      makeTransaction({ type: 'card_payment', amount: 40_00, date: '2026-10-10' }),
    ];
    data.tables.dividend = [makeDividend({ paidOn: '2026-10-08', amount: 25_00 })];
    const overview = monthToDate(data, TODAY);
    expect(overview.expenses).toBe(75_00);
    expect(overview.income).toBe(1_000_00);
  });

  it('compares the last day of a long month with the whole of a short one', () => {
    const data = world();
    data.tables.expense = [
      spent('2026-02-01', 40_00),
      spent('2026-02-28', 60_00),
      spent('2026-03-31', 150_00),
    ];
    // All of February (28 days) against March 1-31.
    expect(monthToDate(data, '2026-03-31').expensesChange).toBe(50);
    // A leap year's February has a 29th.
    data.tables.expense = [spent('2028-02-29', 100_00), spent('2028-03-31', 150_00)];
    expect(monthToDate(data, '2028-03-31').expensesChange).toBe(50);
    // Oct 31 against all of September, which has 30 days.
    data.tables.expense = [spent('2026-09-30', 100_00), spent('2026-10-31', 125_00)];
    expect(monthToDate(data, '2026-10-31').expensesChange).toBe(25);
    // January against December of the year before.
    data.tables.expense = [spent('2025-12-10', 100_00), spent('2026-01-10', 90_00)];
    expect(monthToDate(data, '2026-01-10').expensesChange).toBe(-10);
  });

  it('has no change when last month had nothing to compare with', () => {
    const data = world();
    data.tables.expense = [spent('2026-10-03', 10_00), spent('2026-09-30', 99_00)];
    const overview = monthToDate(data, '2026-10-22');
    // September 1-22 had nothing: the 30th is past the same day.
    expect(overview.expensesChange).toBeNull();
    expect(overview.incomeChange).toBeNull();
    expect(overview.income).toBe(0);
  });

  it('gives the last 7 months, oldest first, this one so far', () => {
    const overview = monthToDate(october(), TODAY);
    expect(overview.expensesSeries).toEqual([0, 0, 0, 0, 0, 550_00, 75_00]);
    expect(overview.incomeSeries).toEqual([0, 0, 0, 0, 0, 4_800_00, 1_000_00]);

    // Across a year's end: August to February.
    const data = world();
    data.tables.expense = [spent('2025-08-31', 1_00), spent('2025-07-31', 9_00)];
    data.tables.income = [earned('2026-02-01', 2_00, 'confirmed')];
    const early = monthToDate(data, '2026-02-10');
    expect(early.expensesSeries).toEqual([1_00, 0, 0, 0, 0, 0, 0]);
    expect(early.incomeSeries).toEqual([0, 0, 0, 0, 0, 0, 2_00]);
  });
});

describe('netWorthSummary', () => {
  /**
   * Main account 1,000.00 and Savings 3,000.00, a Visa owing 230.00 and a 1,000.00 car loan, all from
   * the opening date; 200.00 spent on Oct 5.
   */
  function money(opened: string) {
    const data = emptySnapshot();
    data.tables.profile = [makeProfile({ openingDate: opened })];
    data.tables.account = [
      makeAccount({ id: MAIN, openingBalance: 1_000_00, openingDate: opened }),
      makeAccount({
        id: 'savings',
        name: 'Savings',
        kind: 'savings',
        inAvailable: false,
        openingBalance: 3_000_00,
        openingDate: opened,
        order: 1,
      }),
      makeAccount({
        id: 'visa',
        name: 'Visa',
        kind: 'credit',
        inAvailable: false,
        openingBalance: 230_00,
        openingDate: opened,
        order: 2,
        credit: {
          limit: 1_000_00,
          statementDay: null,
          dueDay: 21,
          payInFull: true,
          minimumPayment: 0,
          interestRate: 0,
        },
      }),
    ];
    data.tables.debt = [makeDebt({ openingBalance: 1_000_00, openingDate: opened })];
    data.tables.expense = [makeExpense({ date: '2026-10-05', amount: 200_00, accountId: MAIN })];
    return data;
  }

  const summaryOf = (data: DataSnapshot, today = TODAY) =>
    netWorthSummary(data, today, computeFinanceView(data, today, 1));

  it('splits net worth into what you have and what you owe', () => {
    const summary = summaryOf(money('2026-09-01'));
    // 800 + 3,000 held, 230 + 1,000 owed.
    expect(summary).toMatchObject({ total: 2_570_00, have: 3_800_00, owe: 1_230_00 });
    expect(summary.have - summary.owe).toBe(summary.total);
  });

  it('shows the change this month, and its line from the end of last month to today', () => {
    const data = money('2026-09-01');
    const summary = summaryOf(data);
    expect(summary.change).toBe(-200_00);
    expect(summary.change).toBe(netWorthChangeThisMonth(data, TODAY));
    // Sep 30, then Oct 1 to Oct 22: 23 days.
    expect(summary.series).toHaveLength(23);
    expect(summary.series?.[0]).toBe(netWorthOn(data, '2026-09-30'));
    expect(summary.series?.at(-1)).toBe(summary.total);
    expect(summary.series?.[4]).toBe(2_770_00); // Oct 4
    expect(summary.series?.[5]).toBe(2_570_00); // Oct 5
  });

  it('counts the 1st as reaching the start of the month', () => {
    const summary = summaryOf(money('2026-10-01'));
    expect(summary.change).toBe(-200_00);
    expect(summary.series).toHaveLength(23);
    // On the 1st itself there are still two points: the month's start and today.
    const first = summaryOf(money('2026-10-01'), '2026-10-01');
    expect(first.change).toBe(0);
    expect(first.series).toEqual([2_770_00, 2_770_00]);
  });

  it('hides the change and its line when the data starts after the 1st', () => {
    const data = money('2026-10-02');
    const summary = summaryOf(data);
    expect(summary.change).toBeNull();
    expect(summary.series).toBeNull();
    // The figures themselves are still shown.
    expect(summary).toMatchObject({ total: 2_570_00, have: 3_800_00, owe: 1_230_00 });
    // With no profile there is nothing to say it starts in time either.
    data.tables.profile = [];
    expect(summaryOf(data).change).toBeNull();
  });

  it('starts the line on the day before the month began', () => {
    const summary = summaryOf(money('2026-09-01'), '2026-11-03');
    expect(summary.series).toHaveLength(4);
    expect(summary.series?.[0]).toBe(netWorthOn(money('2026-09-01'), addDays('2026-11-01', -1)));
  });
});
