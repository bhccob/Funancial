import { addDays, type LocalDate } from './dates';
import { CategorySchema, type Category, type Expense } from './entities';
import { wholePercents } from './income';
import { daysInMonth, monthKey, monthRange, yearRange } from './periods';
import type { DataSnapshot } from './snapshot';

/** How far back the chart on the Cards tab looks: 14 days, 12 months or 4 years. */
export type SpendRange = 'day' | 'month' | 'year';

/** One bar: a day (`2026-10-22`), a month (`2026-10`) or a year (`2026`), and what was spent in it. */
export type SpendBar = { key: string; amount: number };

/**
 * What the chart for one account shows. `total` is what the headline says (the last 14 days, this
 * month so far, this year so far), `change` is how that compares with the same stretch just before,
 * as a percent to two decimals, and `bars` run oldest first and end with today's.
 */
export type SpendSeries = {
  label: string;
  total: number;
  change: number | null;
  bars: SpendBar[];
};

/** A category's part of an account's spending this month. `percent` is whole, and they add up to 100. */
export type CategoryRow = { category: Category; count: number; amount: number; percent: number };

const DAYS = 14;
const MONTHS = 12;
const YEARS = 4;

const pad = (n: number) => String(n).padStart(2, '0');

/** From `base` to `now` as a percent to two decimals; `null` when there was nothing to compare with. */
function percentChange(now: number, base: number): number | null {
  if (base === 0) return null;
  const percent = Math.round(((now - base) / base) * 10_000) / 100;
  return percent === 0 ? 0 : percent; // never -0
}

/** The month keys of the last `count` months, oldest first, ending with the month of `day`. */
function lastMonths(day: LocalDate, count: number): string[] {
  let y = Number(day.slice(0, 4));
  let m = Number(day.slice(5, 7));
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.unshift(`${y}-${pad(m)}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return keys;
}

/** The expenses paid with an account, up to and including `today`. */
const spentWith = (data: DataSnapshot, accountId: string, today: LocalDate): Expense[] =>
  data.tables.expense.filter((e) => e.accountId === accountId && e.date <= today);

/**
 * What an account spent, for the chart on the Cards tab. Only expenses count: income, transfers,
 * card payments and dividends are not spending, and a card's expenses are what it was used for.
 *
 * - `day`: the last 14 days, change against the 14 days before.
 * - `month`: the last 12 months, `total` this month so far, change against the same days of last
 *   month (Oct 1-22 against Sep 1-22; the 31st of March against all of February, as it has no 31st).
 * - `year`: the last 4 years, `total` this year so far, change against the same days of last year.
 *
 * `change` is `null` when what it is compared with is 0.
 */
export function spendSeries(
  data: DataSnapshot,
  accountId: string,
  range: SpendRange,
  today: LocalDate,
): SpendSeries {
  const expenses = spentWith(data, accountId, today);
  const between = (from: LocalDate, to: LocalDate) =>
    expenses.reduce((sum, e) => (e.date >= from && e.date <= to ? sum + e.amount : sum), 0);
  const sumOf = (bars: SpendBar[]) => bars.reduce((sum, b) => sum + b.amount, 0);

  if (range === 'day') {
    const bars = Array.from({ length: DAYS }, (_, i) => {
      const key = addDays(today, i + 1 - DAYS);
      return { key, amount: between(key, key) };
    });
    const total = sumOf(bars);
    const before = between(addDays(today, 1 - 2 * DAYS), addDays(today, -DAYS));
    return {
      label: `Spent in the last ${DAYS} days`,
      total,
      change: percentChange(total, before),
      bars,
    };
  }

  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const d = Number(today.slice(8, 10));

  if (range === 'month') {
    const bars = lastMonths(today, MONTHS).map((key) => {
      const { start, end } = monthRange(`${key}-01`);
      return { key, amount: between(start, end) };
    });
    const total = bars[MONTHS - 1]!.amount;
    // The same days of last month; a month that is shorter ends on its own last day.
    const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    const sameDay = Math.min(d, daysInMonth(py, pm));
    const before = between(`${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-${pad(sameDay)}`);
    return { label: 'Spent this month', total, change: percentChange(total, before), bars };
  }

  const bars = Array.from({ length: YEARS }, (_, i) => {
    const key = String(y - (YEARS - 1) + i);
    const { start, end } = yearRange(`${key}-01-01`);
    return { key, amount: between(start, end) };
  });
  const total = bars[YEARS - 1]!.amount;
  // The same days of last year; February 29 ends on the 28th when last year had none.
  const sameDay = Math.min(d, daysInMonth(y - 1, m));
  const before = between(`${y - 1}-01-01`, `${y - 1}-${pad(m)}-${pad(sameDay)}`);
  return { label: 'Spent this year', total, change: percentChange(total, before), bars };
}

/**
 * What an account spent this month, by category, the biggest first (a tie keeps the order the
 * categories are offered in). Each row has how many expenses, how much, and its whole percent of
 * the month's total. Empty when nothing was spent.
 */
export function categoryRows(
  data: DataSnapshot,
  accountId: string,
  today: LocalDate,
): CategoryRow[] {
  const month = monthKey(today);
  const byCategory = new Map<Category, { count: number; amount: number }>();
  for (const e of spentWith(data, accountId, today)) {
    if (monthKey(e.date) !== month) continue;
    const row = byCategory.get(e.category) ?? { count: 0, amount: 0 };
    byCategory.set(e.category, { count: row.count + 1, amount: row.amount + e.amount });
  }
  const order = CategorySchema.options;
  const rows = [...byCategory]
    .map(([category, row]) => ({ category, ...row }))
    .sort((a, b) => b.amount - a.amount || order.indexOf(a.category) - order.indexOf(b.category));
  const percents = wholePercents(rows.map((r) => r.amount));
  return rows.map((row, i) => ({ ...row, percent: percents[i]! }));
}
