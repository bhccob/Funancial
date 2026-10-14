import { describe, expect, it } from 'vitest';
import {
  makeDebt,
  makeExpense,
  makeGoal,
  makeIncome,
  makeLimit,
  makeProfile,
  makeSettings,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import {
  BudgetLimitSchema,
  DebtSchema,
  defaultSettings,
  ExpenseSchema,
  GoalSchema,
  IncomeSchema,
  ProfileSchema,
  SalaryFreezeSchema,
  SettingsSchema,
  SubscriptionSchema,
  TransactionSchema,
} from './entities';

const ok = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

const validFreeze = {
  id: 'f1',
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  start: '2026-10-01',
  end: '2026-10-07',
  lostAmount: 98_000,
  mode: 'computed',
  note: '',
};

describe('fixtures', () => {
  it('produce valid entities', () => {
    expect(ok(ProfileSchema, makeProfile())).toBe(true);
    expect(ok(SettingsSchema, makeSettings())).toBe(true);
    expect(ok(ExpenseSchema, makeExpense())).toBe(true);
    expect(ok(IncomeSchema, makeIncome())).toBe(true);
    expect(ok(SubscriptionSchema, makeSubscription())).toBe(true);
    expect(ok(BudgetLimitSchema, makeLimit())).toBe(true);
    expect(ok(DebtSchema, makeDebt())).toBe(true);
    expect(ok(GoalSchema, makeGoal())).toBe(true);
    expect(ok(TransactionSchema, makeTransaction())).toBe(true);
  });
});

describe('money', () => {
  it('must be whole minor units', () => {
    expect(ok(ExpenseSchema, makeExpense({ amount: 12.5 }))).toBe(false);
    expect(ok(ExpenseSchema, makeExpense({ amount: 0 }))).toBe(false);
    expect(ok(ExpenseSchema, makeExpense({ amount: -100 }))).toBe(false);
    expect(ok(GoalSchema, makeGoal({ current: 0 }))).toBe(true);
  });
});

describe('payment method and card', () => {
  it('requires a card exactly when paying by credit card', () => {
    expect(ok(ExpenseSchema, makeExpense({ paymentMethod: 'credit_card', cardId: null }))).toBe(
      false,
    );
    expect(ok(ExpenseSchema, makeExpense({ paymentMethod: 'cash', cardId: 'card-1' }))).toBe(false);
    expect(ok(ExpenseSchema, makeExpense({ paymentMethod: 'credit_card', cardId: 'card-1' }))).toBe(
      true,
    );
    expect(
      ok(SubscriptionSchema, makeSubscription({ paymentMethod: 'credit_card', cardId: null })),
    ).toBe(false);
  });
});

describe('BudgetLimit', () => {
  it('needs a category only for category scope', () => {
    expect(ok(BudgetLimitSchema, makeLimit({ scope: 'category', category: null }))).toBe(false);
    expect(ok(BudgetLimitSchema, makeLimit({ scope: 'overall', category: 'food' }))).toBe(false);
    expect(ok(BudgetLimitSchema, makeLimit({ scope: 'overall', category: null }))).toBe(true);
  });
  it('needs ascending warning thresholds', () => {
    expect(ok(BudgetLimitSchema, makeLimit({ warnAt: [100, 80, 120] }))).toBe(false);
    expect(ok(BudgetLimitSchema, makeLimit({ warnAt: [] }))).toBe(false);
  });
});

describe('SalaryFreeze', () => {
  it('cannot end before it starts, but may last one day', () => {
    expect(ok(SalaryFreezeSchema, { ...validFreeze, start: '2026-10-10', end: '2026-10-01' })).toBe(
      false,
    );
    expect(ok(SalaryFreezeSchema, { ...validFreeze, start: '2026-10-10', end: '2026-10-10' })).toBe(
      true,
    );
  });
});

describe('Transaction', () => {
  it('transfers between two different buckets', () => {
    expect(ok(TransactionSchema, makeTransaction({ from: 'cash', to: 'cash' }))).toBe(false);
    expect(ok(TransactionSchema, makeTransaction({ from: null }))).toBe(false);
  });
  it('allows negative adjustments but not empty ones', () => {
    expect(
      ok(
        TransactionSchema,
        makeTransaction({ type: 'adjustment', amount: -2_000, from: null, to: 'cash' }),
      ),
    ).toBe(true);
    expect(
      ok(
        TransactionSchema,
        makeTransaction({ type: 'adjustment', amount: 0, from: null, to: 'cash' }),
      ),
    ).toBe(false);
    expect(ok(TransactionSchema, makeTransaction({ amount: -500 }))).toBe(false);
  });
  it('ties card and debt payments to a debt, paid from a bucket', () => {
    const payment = { type: 'card_payment' as const, from: 'cash' as const, to: null };
    expect(ok(TransactionSchema, makeTransaction({ ...payment, debtId: null }))).toBe(false);
    expect(ok(TransactionSchema, makeTransaction({ ...payment, debtId: 'card-1' }))).toBe(true);
    expect(
      ok(TransactionSchema, makeTransaction({ ...payment, from: null, debtId: 'card-1' })),
    ).toBe(false);
  });
});

describe('Profile and Settings', () => {
  it('needs an ISO currency code', () => {
    expect(ok(ProfileSchema, makeProfile({ currency: 'usd' }))).toBe(false);
    expect(ok(ProfileSchema, makeProfile({ currency: 'EUR' }))).toBe(true);
  });
  it('limits pay day to a day of the month', () => {
    expect(ok(ProfileSchema, makeProfile({ salary: { monthlyAmount: 1, payDay: 32 } }))).toBe(
      false,
    );
  });
  it('only allows the offered auto-lock choices', () => {
    expect(ok(SettingsSchema, { ...makeSettings(), autoLockMinutes: 2 })).toBe(false);
  });
  it('has the documented defaults', () => {
    const s = defaultSettings('2026-10-14T10:00:00.000Z');
    expect(s).toEqual({
      id: 'settings',
      createdAt: '2026-10-14T10:00:00.000Z',
      updatedAt: '2026-10-14T10:00:00.000Z',
      weekStartsOn: 1,
      warningTone: 'motivational',
      autoLockMinutes: 5,
      lastBackupAt: null,
    });
    expect(ok(SettingsSchema, s)).toBe(true);
  });
});
