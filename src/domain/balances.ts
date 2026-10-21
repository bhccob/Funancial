import { activeAccounts } from './accounts';
import type { LocalDate } from './dates';
import type { Account, Debt } from './entities';
import type { DataSnapshot } from './snapshot';

/** An account and what it holds on a day, or for a credit card what is owed on it. */
export type AccountRow = { account: Account; balance: number };

/**
 * What an account holds as of a day: its opening balance plus every event that names it, dated
 * from its own opening date through `asOf`.
 *
 * A bank, cash or savings account gains confirmed income, transfers in, adjustments, confirmed
 * dividends paid into it (a reinvested one went into shares) and the proceeds of sales paid into
 * it, and loses what was spent with it, transfers out, and the card payments, loan payments and
 * investments paid from it.
 *
 * A credit card's balance is what is owed on it: its expenses raise it, the card payments made
 * into it lower it, and an adjustment corrects it. Negative means overpaid (a credit).
 */
export function accountBalance(account: Account, data: DataSnapshot, asOf: LocalDate): number {
  const id = account.id;
  const counts = (d: LocalDate) => d >= account.openingDate && d <= asOf;
  const { expense, income, transaction, dividend, sale } = data.tables;
  let balance = account.openingBalance;

  if (account.kind === 'credit') {
    for (const e of expense) if (e.accountId === id && counts(e.date)) balance += e.amount;
    for (const t of transaction) {
      if (t.toAccountId !== id || !counts(t.date)) continue;
      if (t.type === 'card_payment') balance -= t.amount;
      else if (t.type === 'adjustment') balance += t.amount;
    }
    return balance;
  }

  for (const i of income) {
    if (i.status === 'confirmed' && i.accountId === id && counts(i.date)) balance += i.amount;
  }
  for (const e of expense) if (e.accountId === id && counts(e.date)) balance -= e.amount;
  for (const t of transaction) {
    if (!counts(t.date)) continue;
    switch (t.type) {
      case 'transfer':
        if (t.fromAccountId === id) balance -= t.amount;
        if (t.toAccountId === id) balance += t.amount;
        break;
      case 'adjustment':
        if (t.toAccountId === id) balance += t.amount;
        break;
      case 'card_payment':
      case 'debt_payment':
      case 'investment':
        if (t.fromAccountId === id) balance -= t.amount;
        break;
    }
  }
  for (const d of dividend) {
    if (d.status === 'confirmed' && !d.reinvested && d.accountId === id && counts(d.paidOn)) {
      balance += d.amount;
    }
  }
  for (const s of sale) if (s.toAccountId === id && counts(s.soldOn)) balance += s.proceeds;
  return balance;
}

/** The accounts in use on `asOf`, in carousel order, each with its balance that day. */
export function accountRows(data: DataSnapshot, asOf: LocalDate): AccountRow[] {
  return activeAccounts(data.tables.account, asOf).map((account) => ({
    account,
    balance: accountBalance(account, data, asOf),
  }));
}

/** What is owed on a loan as of a day: its opening balance less the payments made to it. */
export function debtBalance(debt: Debt, data: DataSnapshot, asOf: LocalDate): number {
  const counts = (d: LocalDate) => d >= debt.openingDate && d <= asOf;
  let balance = debt.openingBalance;
  for (const t of data.tables.transaction) {
    if (t.type === 'debt_payment' && t.debtId === debt.id && counts(t.date)) balance -= t.amount;
  }
  return balance;
}

/** What the accounts hold, less what the credit cards and loans owe, plus investments. */
export function netWorth(rows: AccountRow[], loanTotal: number, investments: number): number {
  const accounts = rows.reduce(
    (sum, r) => (r.account.kind === 'credit' ? sum - r.balance : sum + r.balance),
    0,
  );
  return accounts - loanTotal + investments;
}
