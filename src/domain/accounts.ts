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

export const NO_ACCOUNT = "That account doesn't exist.";
/** An archived account: what lands on it would no longer count. */
export const ACCOUNT_ARCHIVED = 'That account is no longer in use.';
/** Money is paid from, and moved between, bank accounts, cash and savings: never a credit card. */
export const CREDIT_CANT_PAY = 'Only a bank account, cash or savings can pay.';
/** A credit card's balance is what is owed on it, so money arriving on one would count nowhere. */
export const INCOME_NOT_CREDIT = 'Income goes into a bank account, cash or savings.';
/** A frozen account can't be spent from; money still arrives on it, and the subscriptions on it still renew. */
export const ACCOUNT_FROZEN = 'That card is frozen. Unfreeze it to use it.';

/** An account money can land on or leave from: one that exists and is not archived by `today`. */
export function accountInUse(data: DataSnapshot, id: string, today: LocalDate): Account {
  const account = data.tables.account.find((a) => a.id === id);
  if (!account) throw new Error(NO_ACCOUNT);
  if (archivedBy(account, today)) throw new Error(ACCOUNT_ARCHIVED);
  return account;
}

/**
 * An account a new expense can be charged to: one in use that is not frozen, a credit card
 * included. Only a new charge asks this: a row already on a frozen account stays there, and
 * renewals, income and transfers are not stopped by a freeze.
 */
export function spendingAccount(data: DataSnapshot, id: string, today: LocalDate): Account {
  const account = accountInUse(data, id, today);
  if (account.frozen) throw new Error(ACCOUNT_FROZEN);
  return account;
}

/** An account money can be paid from or moved with: a bank account, cash or savings in use. */
export function payingAccount(data: DataSnapshot, id: string, today: LocalDate): Account {
  const account = accountInUse(data, id, today);
  if (account.kind === 'credit') throw new Error(CREDIT_CANT_PAY);
  return account;
}

/**
 * An account money can arrive on, as income, the proceeds of a sale or a dividend: a bank account,
 * cash or savings in use.
 */
export function incomeAccount(data: DataSnapshot, id: string, today: LocalDate): Account {
  const account = accountInUse(data, id, today);
  if (account.kind === 'credit') throw new Error(INCOME_NOT_CREDIT);
  return account;
}

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
 * The account a new expense starts on and an expected salary lands on: the settings' default while
 * it is in use and not a credit card, else the first debit or cash account in use by order, else
 * none. So a default that was archived or deleted never leaves money landing on it.
 */
export function defaultAccount(data: DataSnapshot, today: LocalDate): Account | null {
  const active = activeAccounts(data.tables.account, today);
  const id = data.tables.settings[0]?.defaultAccountId ?? null;
  const named = id === null ? undefined : active.find((a) => a.id === id);
  if (named && named.kind !== 'credit') return named;
  return active.find((a) => a.kind === 'debit' || a.kind === 'cash') ?? null;
}

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

/**
 * The account Home and the Cards tab have selected: the stored one while it is in use, else the
 * default account (`defaultAccount`), else the first account in use by order, else none. Any kind
 * can be selected, a frozen account and a credit card included. A stored id that is gone or
 * archived is not honoured, and is not an error.
 */
export function selectedAccount(
  data: DataSnapshot,
  today: LocalDate,
  storedId: string | null,
): Account | null {
  const active = activeAccounts(data.tables.account, today);
  return active.find((a) => a.id === storedId) ?? defaultAccount(data, today) ?? active[0] ?? null;
}
