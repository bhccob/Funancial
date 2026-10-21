import type { LocalDate } from './dates';
import type { Debt } from './entities';
import type { DataSnapshot } from './snapshot';

/** Whether a loan is archived by `day`: hidden, and what it owes no longer counts. */
export const archivedBy = (debt: Debt, day: LocalDate): boolean =>
  debt.archivedOn !== undefined && debt.archivedOn <= day;

/** The loans still in use: an archived one is kept only for the payments that name it. */
export const activeDebts = (debts: readonly Debt[]): Debt[] =>
  debts.filter((d) => d.archivedOn === undefined);

/**
 * What deleting a loan does. One with a payment made to it is archived rather than deleted, so that
 * payment keeps its name and nothing it paid changes.
 */
export function loanRemoval(data: DataSnapshot, debtId: string): { archive: boolean } {
  return {
    archive: data.tables.transaction.some((t) => t.type === 'debt_payment' && t.debtId === debtId),
  };
}
