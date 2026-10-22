import type { LocalDate } from './dates';
import type { Dividend, Expense, Income, Sale, Transaction } from './entities';
import type { DataSnapshot } from './snapshot';

/** One line of History: a row of any of the five tables that move money. */
export type Entry =
  | { kind: 'expense'; item: Expense }
  | { kind: 'income'; item: Income }
  | { kind: 'transaction'; item: Transaction }
  | { kind: 'dividend'; item: Dividend }
  | { kind: 'sale'; item: Sale };

/** The day an entry belongs to: a dividend's pay day, a sale's day, else the row's own date. */
export const entryDate = (e: Entry): LocalDate =>
  e.kind === 'dividend' ? e.item.paidOn : e.kind === 'sale' ? e.item.soldOn : e.item.date;

/**
 * Everything History lists, newest first: by day, then the one made last. Entries of the same day
 * and moment stay in the order expenses, income, transfers and payments, dividends, sales. The
 * History screen filters this list by month and kind, and Home and the card sheet show its first
 * entries, so they all read in one order.
 */
export function historyEntries(data: DataSnapshot): Entry[] {
  const { expense, income, transaction, dividend, sale } = data.tables;
  const entries: Entry[] = [
    ...expense.map((item) => ({ kind: 'expense' as const, item })),
    ...income.map((item) => ({ kind: 'income' as const, item })),
    ...transaction.map((item) => ({ kind: 'transaction' as const, item })),
    ...dividend.map((item) => ({ kind: 'dividend' as const, item })),
    ...sale.map((item) => ({ kind: 'sale' as const, item })),
  ];
  return entries.sort(
    (a, b) =>
      entryDate(b).localeCompare(entryDate(a)) || b.item.createdAt.localeCompare(a.item.createdAt),
  );
}
