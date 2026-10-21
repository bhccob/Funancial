import { makeAccount, makeExpense, makeProfile, makeSettings } from './fixtures';
import type {
  Account,
  BudgetLimit,
  Debt,
  Expense,
  Goal,
  Holding,
  Income,
  Subscription,
} from '@/domain/entities';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';

/** A Wednesday: this week is Oct 12 to 18 (Monday start), this month Oct 1 to 31. */
export const TODAY = '2026-10-14';

const MAIN = 'acct-main';

type World = {
  /**
   * What Main account holds after `expenses` and `incomes`. Only the ones on Main move it, as only
   * the ones paid in or out of cash moved the cash bucket; one on a card or Savings does not.
   */
  cash?: number;
  /** What Savings opens with. */
  savings?: number;
  /** More accounts after Main and Savings, such as a credit card. */
  accounts?: Account[];
  expenses?: Expense[];
  incomes?: Income[];
  limits?: BudgetLimit[];
  goals?: Goal[];
  /** Loans. */
  debts?: Debt[];
  subscriptions?: Subscription[];
  holdings?: Holding[];
  weekStartsOn?: 0 | 1;
};

/** Data for `TODAY` whose Main account and Savings land on the amounts asked for. */
export function world(o: World = {}): DataSnapshot {
  const data = emptySnapshot();
  const expenses = o.expenses ?? [];
  const incomes = o.incomes ?? [];
  const spent = expenses.filter((e) => e.accountId === MAIN).reduce((sum, e) => sum + e.amount, 0);
  const earned = incomes
    .filter((i) => i.status === 'confirmed' && i.accountId === MAIN)
    .reduce((sum, i) => sum + i.amount, 0);
  const opened = '2026-01-01';
  data.tables.profile = [makeProfile({ openingDate: opened })];
  data.tables.account = [
    makeAccount({ openingDate: opened, openingBalance: (o.cash ?? 5_000_00) + spent - earned }),
    makeAccount({
      id: 'acct-savings',
      name: 'Savings',
      kind: 'savings',
      skin: 'mint',
      inAvailable: false,
      openingDate: opened,
      openingBalance: o.savings ?? 0,
      order: 1,
    }),
    ...(o.accounts ?? []),
  ];
  data.tables.settings = [
    makeSettings({ weekStartsOn: o.weekStartsOn ?? 1, defaultAccountId: MAIN }),
  ];
  data.tables.expense = expenses;
  data.tables.income = incomes;
  data.tables.budgetLimit = o.limits ?? [];
  data.tables.goal = o.goals ?? [];
  data.tables.debt = o.debts ?? [];
  data.tables.subscription = o.subscriptions ?? [];
  data.tables.holding = o.holdings ?? [];
  return data;
}

/** Spending of `perMonth` in each of the three full months before `TODAY`, paid from Main. */
export const history = (perMonth: number): Expense[] =>
  ['2026-07-10', '2026-08-10', '2026-09-10'].map((date) =>
    makeExpense({ amount: perMonth, date, category: 'food' }),
  );
