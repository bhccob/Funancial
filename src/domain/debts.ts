import type { LocalDate } from './dates';
import type { Debt, Subscription } from './entities';
import type { DataSnapshot } from './snapshot';

/** Whether a card or loan is archived by `day`: hidden, and what it owes no longer counts. */
export const archivedBy = (debt: Debt, day: LocalDate): boolean =>
  debt.archivedOn !== undefined && debt.archivedOn <= day;

/** The cards and loans still in use: an archived one is kept only for the history that names it. */
export const activeDebts = (debts: readonly Debt[]): Debt[] =>
  debts.filter((d) => d.archivedOn === undefined);

/**
 * What deleting a card or loan does. The subscriptions paid with it move to debit, so no renewal
 * lands on a card that is gone. One with history (an expense on it, or a payment to it) is archived
 * rather than deleted, so that history keeps its name and nothing it paid for changes.
 */
export function debtRemoval(
  data: DataSnapshot,
  debtId: string,
): { subscriptions: Subscription[]; archive: boolean } {
  const { expense, transaction, subscription } = data.tables;
  return {
    subscriptions: subscription.filter((s) => s.cardId === debtId),
    archive:
      expense.some((e) => e.cardId === debtId) || transaction.some((t) => t.debtId === debtId),
  };
}
