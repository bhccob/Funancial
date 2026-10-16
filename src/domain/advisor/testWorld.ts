import { makeExpense, makeProfile, makeSettings } from '@/test/fixtures';
import type { BudgetLimit, Debt, Expense, Goal, Holding, Income, Subscription } from '../entities';
import { emptySnapshot, type DataSnapshot } from '../snapshot';

/** A Wednesday: this week is Oct 12 to 18 (Monday start), this month Oct 1 to 31. */
export const TODAY = '2026-10-14';

type World = {
  /** What the cash bucket holds after `expenses` and `incomes` (all paid in or out of cash). */
  cash?: number;
  savings?: number;
  expenses?: Expense[];
  incomes?: Income[];
  limits?: BudgetLimit[];
  goals?: Goal[];
  debts?: Debt[];
  subscriptions?: Subscription[];
  holdings?: Holding[];
  weekStartsOn?: 0 | 1;
};

/** Data for `TODAY` whose buckets land on the amounts asked for. */
export function world(o: World = {}): DataSnapshot {
  const data = emptySnapshot();
  const expenses = o.expenses ?? [];
  const incomes = o.incomes ?? [];
  const spent = expenses
    .filter((e) => e.paymentMethod !== 'credit_card')
    .reduce((sum, e) => sum + e.amount, 0);
  const earned = incomes
    .filter((i) => i.status === 'confirmed')
    .reduce((sum, i) => sum + i.amount, 0);
  data.tables.profile = [
    makeProfile({
      openingDate: '2026-01-01',
      openingCash: (o.cash ?? 5_000_00) + spent - earned,
      openingSavings: o.savings ?? 0,
    }),
  ];
  data.tables.settings = [makeSettings({ weekStartsOn: o.weekStartsOn ?? 1 })];
  data.tables.expense = expenses;
  data.tables.income = incomes;
  data.tables.budgetLimit = o.limits ?? [];
  data.tables.goal = o.goals ?? [];
  data.tables.debt = o.debts ?? [];
  data.tables.subscription = o.subscriptions ?? [];
  data.tables.holding = o.holdings ?? [];
  return data;
}

/** Spending of `perMonth` in each of the three full months before `TODAY`, paid from cash. */
export const history = (perMonth: number): Expense[] =>
  ['2026-07-10', '2026-08-10', '2026-09-10'].map((date) =>
    makeExpense({ amount: perMonth, date, category: 'food', paymentMethod: 'other' }),
  );
