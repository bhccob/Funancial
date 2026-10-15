import { debtBalance, type Buckets } from './balances';
import type { LocalDate } from './dates';
import type { BudgetLimit, Category, Expense } from './entities';
import {
  dayOfMonth,
  dayRange,
  daysInMonth,
  endOfMonth,
  inRange,
  monthRange,
  periodRange,
  weekRange,
  yearRange,
  type Range,
} from './periods';
import { nextOccurrence } from './recurrence';
import type { DataSnapshot } from './snapshot';

export type LimitLevel = 'ok' | 'warn' | 'over' | 'way-over';
const LEVELS: LimitLevel[] = ['ok', 'warn', 'over', 'way-over'];

export type LimitStatus = {
  limit: BudgetLimit;
  range: Range;
  spent: number;
  /** amount − spent; negative when over. */
  remaining: number;
  pct: number;
  level: LimitLevel;
};

const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food',
  transport: 'Transport',
  rent: 'Rent',
  utilities: 'Utilities',
  entertainment: 'Fun',
  health: 'Health',
  shopping: 'Shopping',
  other: 'Other',
};

export function categoryLabel(c: Category): string {
  return CATEGORY_LABELS[c];
}

export function limitLabel(limit: BudgetLimit): string {
  return limit.scope === 'overall' || !limit.category ? 'Overall' : categoryLabel(limit.category);
}

const sumIn = (expenses: Expense[], r: Range, category: Category | null) =>
  expenses.reduce(
    (s, e) =>
      inRange(e.date, r) && (category === null || e.category === category) ? s + e.amount : s,
    0,
  );

/** How a limit stands this period. Every expense counts by date: subscriptions and card purchases too. */
export function limitStatus(
  limit: BudgetLimit,
  data: DataSnapshot,
  today: LocalDate,
  weekStartsOn: 0 | 1,
): LimitStatus {
  const range = periodRange(limit.period, today, weekStartsOn);
  const spent = sumIn(
    data.tables.expense,
    range,
    limit.scope === 'overall' ? null : limit.category,
  );
  const crossed = limit.warnAt.filter((t) => spent * 100 >= limit.amount * t).length;
  return {
    limit,
    range,
    spent,
    remaining: limit.amount - spent,
    pct: Math.round((spent * 100) / limit.amount),
    level: LEVELS[Math.min(crossed, LEVELS.length - 1)]!,
  };
}

export type Bill = {
  date: LocalDate;
  name: string;
  amount: number;
  kind: 'subscription' | 'card';
  refId: string;
};

function nextDueDate(today: LocalDate, dueDay: number | null): LocalDate {
  if (dueDay === null) return today;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (dueDay >= dayOfMonth(today)) {
    return `${y}-${pad(m)}-${pad(Math.min(dueDay, daysInMonth(y, m)))}`;
  }
  const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
  return `${ny}-${pad(nm)}-${pad(Math.min(dueDay, daysInMonth(ny, nm)))}`;
}

/** Subscription renewals from today to month end, plus what's due on each credit card. */
export function upcomingBills(data: DataSnapshot, today: LocalDate): Bill[] {
  const end = endOfMonth(today);
  const bills: Bill[] = [];
  for (const s of data.tables.subscription) {
    if (s.status !== 'active') continue;
    for (let d = s.nextRenewal; d <= end; d = nextOccurrence(d, s.cycle, s.anchorDay)) {
      if (d >= today)
        bills.push({ date: d, name: s.name, amount: s.amount, kind: 'subscription', refId: s.id });
    }
  }
  for (const debt of data.tables.debt) {
    if (debt.kind !== 'credit_card') continue;
    const balance = debtBalance(debt, data, today);
    if (balance <= 0) continue;
    bills.push({
      date: nextDueDate(today, debt.dueDay),
      name: debt.name,
      // Without a minimum on file, the whole balance is what's due.
      amount:
        debt.payInFull || debt.minimumPayment <= 0
          ? balance
          : Math.min(debt.minimumPayment, balance),
      kind: 'card',
      refId: debt.id,
    });
  }
  return bills.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** Unspent part of every limit marked "reserve", held back from the available balance. */
export function reservedTotal(data: DataSnapshot, today: LocalDate, weekStartsOn: 0 | 1): number {
  return data.tables.budgetLimit
    .filter((l) => l.reserve)
    .reduce((s, l) => s + Math.max(0, limitStatus(l, data, today, weekStartsOn).remaining), 0);
}

export function availableBalance(buckets: Buckets, bills: Bill[], reserved: number): number {
  return buckets.cash + buckets.savings - bills.reduce((s, b) => s + b.amount, 0) - reserved;
}

export function spendingSummary(
  expenses: Expense[],
  today: LocalDate,
  weekStartsOn: 0 | 1,
): { today: number; week: number; month: number; year: number } {
  return {
    today: sumIn(expenses, dayRange(today), null),
    week: sumIn(expenses, weekRange(today, weekStartsOn), null),
    month: sumIn(expenses, monthRange(today), null),
    year: sumIn(expenses, yearRange(today), null),
  };
}

export function categoryBreakdown(
  expenses: Expense[],
  range: Range,
): Array<{ category: Category; amount: number }> {
  const totals = new Map<Category, number>();
  for (const e of expenses) {
    if (inRange(e.date, range)) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
  }
  return [...totals]
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}
