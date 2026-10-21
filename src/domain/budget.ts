import { activeAccounts } from './accounts';
import { accountBalance, type AccountRow } from './balances';
import type { LocalDate } from './dates';
import type { Account, BudgetLimit, Category, Expense } from './entities';
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
  /** The account it is charged to: a subscription's own account, or the card's for a card bill. */
  accountId: string;
  /** Cards only: the payment is the whole balance, not the minimum. */
  inFull?: boolean;
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The first date on or after `today` that falls on `dueDay` (clamped to short months), or `today`
 * itself when there is no due day.
 */
export function nextDueDate(today: LocalDate, dueDay: number | null): LocalDate {
  if (dueDay === null) return today;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (dueDay >= dayOfMonth(today)) {
    return `${y}-${pad(m)}-${pad(Math.min(dueDay, daysInMonth(y, m)))}`;
  }
  const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
  return `${ny}-${pad(nm)}-${pad(Math.min(dueDay, daysInMonth(ny, nm)))}`;
}

/**
 * What has been paid into a card since its previous due date, up to today: the payments that
 * count toward the due date `nextDueDate` gives. A card with no due day has no cycle to count in.
 */
function paidThisCycle(data: DataSnapshot, card: Account, today: LocalDate): number {
  const dueDay = card.credit?.dueDay ?? null;
  if (dueDay === null) return 0; // shortcut: no cycle without a due day, unless one is asked for
  const next = nextDueDate(today, dueDay);
  const [y, m] = [Number(next.slice(0, 4)), Number(next.slice(5, 7))];
  const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  // The same day a month earlier, clamped to a short month the way `nextDueDate` clamps.
  const since = `${py}-${pad(pm)}-${pad(Math.min(dueDay, daysInMonth(py, pm)))}`;
  return data.tables.transaction
    .filter(
      (t) =>
        t.type === 'card_payment' && t.toAccountId === card.id && t.date > since && t.date <= today,
    )
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * What a card's next payment is: the whole of what is owed when it is paid in full or has no
 * minimum on file, else what is left of its minimum after the payments made since the previous
 * due date (never more than is owed, and 0 once the minimum is paid). What is owed already
 * reflects payments, so a card paid in full needs no such step.
 */
export function cardPayment(
  data: DataSnapshot,
  card: Account,
  owed: number,
  today: LocalDate,
): { amount: number; inFull: boolean } {
  const minimum = card.credit?.minimumPayment ?? 0;
  const inFull = (card.credit?.payInFull ?? true) || minimum <= 0;
  if (inFull) return { inFull, amount: owed };
  const left = minimum - paidThisCycle(data, card, today);
  return { inFull, amount: Math.max(0, Math.min(owed, left)) };
}

/**
 * Subscription renewals from today to `until` (month end unless asked for another day), plus what's
 * due on each credit card in use today: its next due date, whether or not that is before `until`.
 */
export function upcomingBills(
  data: DataSnapshot,
  today: LocalDate,
  until: LocalDate = endOfMonth(today),
): Bill[] {
  const bills: Bill[] = [];
  for (const s of data.tables.subscription) {
    if (s.status !== 'active') continue;
    for (let d = s.nextRenewal; d <= until; d = nextOccurrence(d, s.cycle, s.anchorDay)) {
      if (d >= today)
        bills.push({
          date: d,
          name: s.name,
          amount: s.amount,
          kind: 'subscription',
          refId: s.id,
          accountId: s.accountId,
        });
    }
  }
  for (const card of activeAccounts(data.tables.account, today)) {
    if (card.kind !== 'credit' || !card.credit) continue;
    const owed = accountBalance(card, data, today);
    if (owed <= 0) continue;
    const { amount, inFull } = cardPayment(data, card, owed, today);
    // The minimum is paid for this due date: nothing is due.
    if (amount === 0) continue;
    bills.push({
      date: nextDueDate(today, card.credit.dueDay),
      name: card.name,
      amount,
      kind: 'card',
      refId: card.id,
      accountId: card.id,
      inFull,
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

const sumBalances = (rows: AccountRow[]) => rows.reduce((s, r) => s + r.balance, 0);

/**
 * Available to spend: what the accounts that count in Available hold, less the subscription bills
 * charged to those accounts, every card bill, and what reserved limits hold back. A subscription
 * on a credit card is not taken off: it lands on the card and comes back as the card's bill.
 */
export function availableBalance(rows: AccountRow[], bills: Bill[], reserved: number): number {
  const counted = rows.filter((r) => r.account.inAvailable);
  const inAvailable = new Set(counted.map((r) => r.account.id));
  const billed = bills
    .filter((b) => b.kind === 'card' || inAvailable.has(b.accountId))
    .reduce((s, b) => s + b.amount, 0);
  return sumBalances(counted) - billed - reserved;
}

/** Cash in pocket: what the cash accounts hold, with nothing taken off. */
export function cashInPocket(rows: AccountRow[]): number {
  return sumBalances(rows.filter((r) => r.account.kind === 'cash'));
}

/** Saved: what the savings accounts hold. Goals are labels on savings, so they are not added. */
export function savedTotal(rows: AccountRow[]): number {
  return sumBalances(rows.filter((r) => r.account.kind === 'savings'));
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
