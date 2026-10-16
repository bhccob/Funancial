import { addDays, toLocalDate, type LocalDate } from '../dates';
import type { Category, Dividend, Expense } from '../entities';
import { periodRange } from '../periods';
import type { DataSnapshot } from '../snapshot';

/** The local calendar day an ISO timestamp falls on. */
export function localDay(iso: string): LocalDate {
  return toLocalDate(new Date(iso));
}

/**
 * Whether the person logged `e` themselves. A renewal the app adds for a subscription is not
 * logged; an expense typed with Repeat is, though it starts that subscription and carries its id.
 * The two differ by `recurrence`: only the typed one has one.
 */
export function isLoggedExpense(e: Expense): boolean {
  return e.subscriptionId === null || e.recurrence !== null;
}

/** The dividends the person confirmed, skipped ones left out. */
export function confirmedDividends(data: DataSnapshot): Dividend[] {
  return data.tables.dividend.filter((d) => d.status === 'confirmed');
}

/** Something the person entered by hand, and the local day they entered it. */
export type LoggedEntry = {
  table: 'expense' | 'income' | 'dividend';
  id: string;
  createdAt: string;
  day: LocalDate;
};

/**
 * What the person logged: their expenses (not subscription renewals), their extra income (not
 * salary) and the dividends they confirmed, oldest first. Each sits on the day it was created,
 * whatever date it carries.
 */
export function loggedEntries(data: DataSnapshot): LoggedEntry[] {
  const entries: LoggedEntry[] = [];
  for (const e of data.tables.expense) {
    if (isLoggedExpense(e)) {
      entries.push({
        table: 'expense',
        id: e.id,
        createdAt: e.createdAt,
        day: localDay(e.createdAt),
      });
    }
  }
  for (const i of data.tables.income) {
    if (i.source === 'extra') {
      entries.push({
        table: 'income',
        id: i.id,
        createdAt: i.createdAt,
        day: localDay(i.createdAt),
      });
    }
  }
  for (const d of confirmedDividends(data)) {
    entries.push({
      table: 'dividend',
      id: d.id,
      createdAt: d.createdAt,
      day: localDay(d.createdAt),
    });
  }
  return entries.sort(
    (a, b) =>
      (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** The days the person was active: a day with something logged, or with a no-spend check-in. */
export function activeDays(data: DataSnapshot): Set<LocalDate> {
  const days = new Set<LocalDate>(loggedEntries(data).map((e) => e.day));
  for (const c of data.tables.checkIn) {
    if (c.kind === 'no-spend') days.add(c.date);
  }
  return days;
}

export type SpendIndex = {
  /** Whether some limit that existed on `day` was over by the end of `day`. */
  overOn(day: LocalDate): boolean;
  /** Whether any limit existed on `day`. */
  limitsOn(day: LocalDate): boolean;
};

type DaySpend = { all: number; byCategory: Map<Category, number> };

/**
 * Looks up limits against spending one day at a time. A limit counts from the local day it was
 * created. Spending counts by expense date, up to and including the day asked about, so a later
 * expense never turns an earlier day over. Spending exactly the amount is not over.
 */
export function createSpendIndex(data: DataSnapshot, weekStartsOn: 0 | 1): SpendIndex {
  const spendByDate = new Map<LocalDate, DaySpend>();
  for (const e of data.tables.expense) {
    let day = spendByDate.get(e.date);
    if (!day) {
      day = { all: 0, byCategory: new Map() };
      spendByDate.set(e.date, day);
    }
    day.all += e.amount;
    day.byCategory.set(e.category, (day.byCategory.get(e.category) ?? 0) + e.amount);
  }

  const limits = data.tables.budgetLimit.map((limit) => ({
    limit,
    since: localDay(limit.createdAt),
  }));

  const spentThrough = (start: LocalDate, end: LocalDate, category: Category | null): number => {
    let spent = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const day = spendByDate.get(d);
      if (day) spent += category === null ? day.all : (day.byCategory.get(category) ?? 0);
    }
    return spent;
  };

  return {
    limitsOn: (day) => limits.some((l) => l.since <= day),
    overOn: (day) =>
      limits.some(({ limit, since }) => {
        if (since > day) return false;
        const range = periodRange(limit.period, day, weekStartsOn);
        const category = limit.scope === 'overall' ? null : limit.category;
        return spentThrough(range.start, day, category) > limit.amount;
      }),
  };
}

/** Whether any day from `start` to `end`, inclusive, was over a limit. */
export function anyOver(spend: SpendIndex, start: LocalDate, end: LocalDate): boolean {
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (spend.overOn(day)) return true;
  }
  return false;
}
