import { accountRows, debtBalance, netWorth, type AccountRow } from './balances';
import {
  availableBalance,
  cashInPocket,
  limitStatus,
  reservedTotal,
  savedTotal,
  spendingSummary,
  upcomingBills,
  type Bill,
  type LimitStatus,
} from './budget';
import type { LocalDate } from './dates';
import { activeDebts } from './debts';
import type { Debt, Income } from './entities';
import { monthKey } from './periods';
import { portfolio } from './portfolio';
import { monthlyEquivalent } from './recurrence';
import { expectedSalary } from './salary';
import type { DataSnapshot } from './snapshot';

export type FinanceView = {
  /** The accounts in use, in carousel order, with what each holds (or, for a card, owes). */
  accounts: AccountRow[];
  loans: Array<{ debt: Debt; balance: number }>;
  /** What the credit cards and the loans owe together. */
  owed: number;
  /** Cash in pocket: what the cash accounts hold. */
  cash: number;
  /** What the savings accounts hold. */
  saved: number;
  /** The priced holdings, in minor units of the profile currency; part of `netWorth`. */
  investments: number;
  netWorth: number;
  bills: Bill[];
  billsTotal: number;
  reserved: number;
  available: number;
  limits: LimitStatus[];
  spending: { today: number; week: number; month: number; year: number };
  pendingSalary: Income[];
  expectedSalaryThisMonth: number;
  subscriptionsMonthly: number;
};

/** Everything the screens show, computed once from the data and today's date. */
export function computeFinanceView(
  data: DataSnapshot,
  today: LocalDate,
  weekStartsOn: 0 | 1,
): FinanceView {
  const accounts = accountRows(data, today);
  const loans = activeDebts(data.tables.debt).map((debt) => ({
    debt,
    balance: debtBalance(debt, data, today),
  }));
  const loanTotal = loans.reduce((s, l) => s + l.balance, 0);
  const cardsOwed = accounts
    .filter((r) => r.account.kind === 'credit')
    .reduce((s, r) => s + r.balance, 0);
  const bills = upcomingBills(data, today);
  const reserved = reservedTotal(data, today, weekStartsOn);
  const profile = data.tables.profile[0];
  const investments = profile ? portfolio(data, profile.currency).value : 0;

  return {
    accounts,
    loans,
    owed: cardsOwed + loanTotal,
    cash: cashInPocket(accounts),
    saved: savedTotal(accounts),
    investments,
    netWorth: netWorth(accounts, loanTotal, investments),
    bills,
    billsTotal: bills.reduce((s, b) => s + b.amount, 0),
    reserved,
    available: availableBalance(accounts, bills, reserved),
    limits: data.tables.budgetLimit
      .map((l) => limitStatus(l, data, today, weekStartsOn))
      .sort((a, b) => b.pct - a.pct),
    spending: spendingSummary(data.tables.expense, today, weekStartsOn),
    pendingSalary: data.tables.income
      .filter((i) => i.source === 'salary' && i.status === 'expected')
      .sort((a, b) => a.date.localeCompare(b.date)),
    expectedSalaryThisMonth: profile ? expectedSalary(profile, monthKey(today)) : 0,
    subscriptionsMonthly: data.tables.subscription
      .filter((s) => s.status === 'active')
      .reduce((s, sub) => s + monthlyEquivalent(sub.amount, sub.cycle), 0),
  };
}
