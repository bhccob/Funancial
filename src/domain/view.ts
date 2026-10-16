import { bucketBalances, debtBalance, netWorth, type Buckets } from './balances';
import {
  availableBalance,
  limitStatus,
  reservedTotal,
  spendingSummary,
  upcomingBills,
  type Bill,
  type LimitStatus,
} from './budget';
import type { LocalDate } from './dates';
import type { Debt, Income, SalaryFreeze } from './entities';
import { monthKey } from './periods';
import { portfolio } from './portfolio';
import { monthlyEquivalent } from './recurrence';
import { expectedSalary } from './salary';
import type { DataSnapshot } from './snapshot';

export type FinanceView = {
  buckets: Buckets;
  debts: Array<{ debt: Debt; balance: number }>;
  debtTotal: number;
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
  activeFreeze: SalaryFreeze | null;
  subscriptionsMonthly: number;
};

/** Everything the screens show, computed once from the data and today's date. */
export function computeFinanceView(
  data: DataSnapshot,
  today: LocalDate,
  weekStartsOn: 0 | 1,
): FinanceView {
  const buckets = bucketBalances(data, today);
  const debts = data.tables.debt.map((debt) => ({ debt, balance: debtBalance(debt, data, today) }));
  const debtTotal = debts.reduce((s, d) => s + d.balance, 0);
  const bills = upcomingBills(data, today);
  const reserved = reservedTotal(data, today, weekStartsOn);
  const profile = data.tables.profile[0];
  const investments = profile ? portfolio(data, profile.currency).value : 0;

  return {
    buckets,
    debts,
    debtTotal,
    investments,
    netWorth: netWorth(buckets, debtTotal, investments),
    bills,
    billsTotal: bills.reduce((s, b) => s + b.amount, 0),
    reserved,
    available: availableBalance(buckets, bills, reserved),
    limits: data.tables.budgetLimit
      .map((l) => limitStatus(l, data, today, weekStartsOn))
      .sort((a, b) => b.pct - a.pct),
    spending: spendingSummary(data.tables.expense, today, weekStartsOn),
    pendingSalary: data.tables.income
      .filter((i) => i.source === 'salary' && i.status === 'expected')
      .sort((a, b) => a.date.localeCompare(b.date)),
    expectedSalaryThisMonth: profile
      ? expectedSalary(profile, data.tables.salaryFreeze, monthKey(today))
      : 0,
    activeFreeze: data.tables.salaryFreeze.find((f) => f.start <= today && today <= f.end) ?? null,
    subscriptionsMonthly: data.tables.subscription
      .filter((s) => s.status === 'active')
      .reduce((s, sub) => s + monthlyEquivalent(sub.amount, sub.cycle), 0),
  };
}
