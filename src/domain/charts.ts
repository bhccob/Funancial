import { bucketBalances, debtBalance, netWorth } from './balances';
import { categoryBreakdown, categoryLabel } from './budget';
import { addDays, type LocalDate } from './dates';
import type { Expense } from './entities';
import { monthRange, periodRange, type Range } from './periods';
import { holdingValue } from './portfolio';
import type { DataSnapshot } from './snapshot';
import type { FinanceView } from './view';

/** What was spent on each of the `days` days ending `endDay`, oldest first; quiet days are 0. */
export function spendingByDay(
  expenses: Expense[],
  endDay: LocalDate,
  days: number,
): Array<{ day: LocalDate; amount: number }> {
  const byDay = new Map<LocalDate, number>();
  for (const e of expenses) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.amount);
  const out: Array<{ day: LocalDate; amount: number }> = [];
  for (let back = days - 1; back >= 0; back--) {
    const day = addDays(endDay, -back);
    out.push({ day, amount: byDay.get(day) ?? 0 });
  }
  return out;
}

/** One slice of a donut. `key` is unique within the chart; `'other'` always means the folded Other. */
export type Slice = { key: string; label: string; amount: number };

/**
 * The categories with spending in the range, highest first. The `top` biggest are kept; the rest,
 * and the "other" category itself (never ranked), fold into one "Other" slice at the end.
 */
export function categorySlices(expenses: Expense[], range: Range, top = 5): Slice[] {
  const all = categoryBreakdown(expenses, range);
  const named = all.filter((b) => b.category !== 'other');
  const slices: Slice[] = named
    .slice(0, top)
    .map((b) => ({ key: b.category, label: categoryLabel(b.category), amount: b.amount }));
  const folded = [...named.slice(top), ...all.filter((b) => b.category === 'other')].reduce(
    (sum, b) => sum + b.amount,
    0,
  );
  if (folded > 0) slices.push({ key: 'other', label: categoryLabel('other'), amount: folded });
  return slices;
}

/**
 * What the shares sold after `day` were worth on it, which the holdings left no longer show: each
 * sale's proceeds, for a sale of shares bought by then. The purchase date is the live holding's, else
 * a snapshot of it a sale kept; a sale with neither is left out.
 */
function soldLater(data: DataSnapshot, day: LocalDate): number {
  const { holding, sale } = data.tables;
  let value = 0;
  for (const s of sale) {
    if (s.soldOn <= day) continue;
    const was =
      holding.find((h) => h.id === s.holdingId) ??
      sale.find((o) => o.holdingId === s.holdingId && o.restore)?.restore;
    // shortcut: the sold shares are valued at the sale price, there is no price history; upgrade when prices are stored by day
    if (was && was.purchaseDate <= day) value += s.proceeds;
  }
  return value;
}

/**
 * Cash, savings and passive income plus the holdings bought by then (and the shares sold since, at
 * their sale price), less everything owed, as of the end of `day`.
 */
export function netWorthOn(data: DataSnapshot, day: LocalDate): number {
  const debtTotal = data.tables.debt.reduce((sum, d) => sum + debtBalance(d, data, day), 0);
  // shortcut: no price history, uses today's prices; upgrade when prices are stored by day
  const currency = data.tables.profile[0]?.currency;
  const investments = currency
    ? data.tables.holding.reduce(
        (sum, h) => (h.purchaseDate <= day ? sum + (holdingValue(h, currency) ?? 0) : sum),
        0,
      )
    : 0;
  return netWorth(bucketBalances(data, day), debtTotal, investments + soldLater(data, day));
}

/** Net worth on each of the `days` days ending `endDay`, oldest first. */
export function netWorthSeries(
  data: DataSnapshot,
  endDay: LocalDate,
  days: number,
): Array<{ day: LocalDate; value: number }> {
  const out: Array<{ day: LocalDate; value: number }> = [];
  for (let back = days - 1; back >= 0; back--) {
    const day = addDays(endDay, -back);
    out.push({ day, value: netWorthOn(data, day) });
  }
  return out;
}

/** How much net worth has moved since the last day of the month before. */
export function netWorthChangeThisMonth(data: DataSnapshot, today: LocalDate): number {
  const dayBefore = addDays(monthRange(today).start, -1);
  return netWorthOn(data, today) - netWorthOn(data, dayBefore);
}

/** How far through its week or month `today` is, counting today: 0 to 1, 1 on the last day. */
export function periodProgress(
  period: 'weekly' | 'monthly',
  today: LocalDate,
  weekStartsOn: 0 | 1,
): number {
  const range = periodRange(period, today, weekStartsOn);
  let elapsed = 0;
  let total = 0;
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
    total += 1;
    if (d <= today) elapsed += 1;
  }
  return elapsed / total;
}

/** Whether a limit's use (`pct`, in percent) runs ahead of, on or under the period's progress. */
export function paceStatus(pct: number, progress: number): 'ahead' | 'on' | 'under' {
  const used = pct / 100;
  if (used > progress + 0.05) return 'ahead';
  if (used < progress - 0.05) return 'under';
  return 'on';
}

export type MonthLineData = { spent: number; bills: number; left: number | null };

/**
 * This month in three numbers: what is spent, what bills are still to come, and what is left of
 * the overall monthly limit (null without one, and never below 0).
 */
export function monthLine(view: FinanceView): MonthLineData {
  const overall = view.limits.find(
    (l) => l.limit.scope === 'overall' && l.limit.period === 'monthly',
  );
  return {
    spent: view.spending.month,
    bills: view.billsTotal,
    left: overall ? Math.max(0, overall.remaining) : null,
  };
}
