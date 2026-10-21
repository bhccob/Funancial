import type { LocalDate } from './dates';
import type { Account, AccountKind, Subscription } from './entities';
import type { DataSnapshot } from './snapshot';

/** Whether an account is archived by `day`: hidden, and what it holds or owes no longer counts. */
export const archivedBy = (account: Account, day: LocalDate): boolean =>
  account.archivedOn !== undefined && account.archivedOn <= day;

/**
 * The accounts in use on `day`, in carousel order. An archived one is kept only for the history
 * that names it.
 */
export const activeAccounts = (accounts: readonly Account[], day: LocalDate): Account[] =>
  accounts.filter((a) => !archivedBy(a, day)).sort((a, b) => a.order - b.order);

const DEFAULTS: Record<AccountKind, { skin: string; inAvailable: boolean }> = {
  debit: { skin: 'midnight', inAvailable: true },
  cash: { skin: 'amber', inAvailable: true },
  savings: { skin: 'mint', inAvailable: false },
  credit: { skin: 'violet', inAvailable: false },
};

/** A new account's look, and whether what it holds counts in Available, by its kind. */
export const defaultsFor = (kind: AccountKind): { skin: string; inAvailable: boolean } => ({
  ...DEFAULTS[kind],
});

/**
 * What deleting an account does. The subscriptions paid with it have to move to another account,
 * so no renewal lands on one that is gone. One with history (an expense, an income, a transfer or
 * payment in or out, a dividend or a sale that names it) is archived rather than deleted, so that
 * history keeps its name and nothing it paid for changes.
 */
export function accountRemoval(
  data: DataSnapshot,
  accountId: string,
): { subscriptions: Subscription[]; archive: boolean } {
  const { expense, income, transaction, dividend, sale, subscription } = data.tables;
  return {
    subscriptions: subscription.filter((s) => s.accountId === accountId),
    archive:
      expense.some((e) => e.accountId === accountId) ||
      income.some((i) => i.accountId === accountId) ||
      transaction.some((t) => t.fromAccountId === accountId || t.toAccountId === accountId) ||
      dividend.some((d) => d.accountId === accountId) ||
      sale.some((s) => s.toAccountId === accountId),
  };
}
