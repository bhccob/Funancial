import { percentChange } from './cardSpend';
import { netWorthChangeThisMonth, netWorthSeries } from './charts';
import type { LocalDate } from './dates';
import { dayOfMonth, lastMonths, monthRange, sameDaysLastMonth } from './periods';
import type { DataSnapshot } from './snapshot';
import type { FinanceView } from './view';

/**
 * Home's Overview: what came in and what went out this month so far. Each `change` is a percent to
 * two decimals against the same days of last month, `null` when last month had nothing on those
 * days; each series is the last 7 months, oldest first, ending with this month so far.
 */
export type MonthToDate = {
  income: number;
  expenses: number;
  incomeChange: number | null;
  expensesChange: number | null;
  incomeSeries: number[];
  expensesSeries: number[];
};

/** How many months the Overview tiles' lines run over. */
const SERIES_MONTHS = 7;

type Dated = { date: LocalDate; amount: number };

const between = (rows: Dated[], from: LocalDate, to: LocalDate) =>
  rows.reduce((sum, r) => (r.date >= from && r.date <= to ? sum + r.amount : sum), 0);

/**
 * This month so far (to `today`, as nothing dated later has happened yet). Income is the income that
 * arrived (confirmed): an expected salary, or one that didn't arrive, is not. Expenses are the
 * expenses: transfers, card payments, loan payments and investments only move money.
 */
export function monthToDate(data: DataSnapshot, today: LocalDate): MonthToDate {
  const income = data.tables.income.filter((i) => i.status === 'confirmed' && i.date <= today);
  const expenses = data.tables.expense.filter((e) => e.date <= today);
  const { start } = monthRange(today);
  const last = sameDaysLastMonth(today);
  const months = lastMonths(today, SERIES_MONTHS).map((key) => monthRange(`${key}-01`));
  const summed = (rows: Dated[]) => {
    const now = between(rows, start, today);
    return {
      now,
      change: percentChange(now, between(rows, last.start, last.end)),
      series: months.map((m) => between(rows, m.start, m.end)),
    };
  };
  const inn = summed(income);
  const out = summed(expenses);
  return {
    income: inn.now,
    expenses: out.now,
    incomeChange: inn.change,
    expensesChange: out.change,
    incomeSeries: inn.series,
    expensesSeries: out.series,
  };
}

/**
 * Home's Net worth tile. `have` and `owe` are the two parts of `total` (what the bank accounts, cash,
 * savings and investments hold; what the cards and loans owe), so `have - owe` is `total`.
 * `change` is how far it has moved since the month began and `series` its line, from the end of last
 * month to today; both are `null` unless the data reaches the start of this month (the profile
 * opened on the 1st or before), as there is nothing true to measure from otherwise.
 */
export type NetWorthSummary = {
  total: number;
  have: number;
  owe: number;
  change: number | null;
  series: number[] | null;
};

export function netWorthSummary(
  data: DataSnapshot,
  today: LocalDate,
  view: FinanceView,
): NetWorthSummary {
  const parts = { total: view.netWorth, have: view.netWorth + view.owed, owe: view.owed };
  const opened = data.tables.profile[0]?.openingDate;
  if (opened === undefined || opened > monthRange(today).start) {
    return { ...parts, change: null, series: null };
  }
  // The last day of last month, then each day of this one to today.
  const series = netWorthSeries(data, today, dayOfMonth(today) + 1).map((p) => p.value);
  return { ...parts, change: netWorthChangeThisMonth(data, today), series };
}
