import { describe, expect, it } from 'vitest';
import { makeDebt, makeExpense, makeProfile, makeTransaction } from '@/test/fixtures';
import { bucketBalances, debtBalance, netWorth } from './balances';
import { emptySnapshot } from './snapshot';

function base() {
  const data = emptySnapshot();
  data.tables.profile = [
    makeProfile({ openingDate: '2026-10-01', openingCash: 1_000_00, openingSavings: 5_000_00 }),
  ];
  return data;
}

describe('bucketBalances', () => {
  it('ignores expenses dated before the opening date', () => {
    const data = base();
    data.tables.expense = [makeExpense({ date: '2026-09-30', amount: 50_00 })];
    expect(bucketBalances(data, '2026-10-10').cash).toBe(1_000_00);
  });

  it('ignores events after the as-of day', () => {
    const data = base();
    data.tables.expense = [makeExpense({ date: '2026-10-11', amount: 50_00 })];
    expect(bucketBalances(data, '2026-10-10').cash).toBe(1_000_00);
    expect(bucketBalances(data, '2026-10-11').cash).toBe(950_00);
  });

  it('starts from zero without a profile', () => {
    const data = emptySnapshot();
    data.tables.expense = [makeExpense({ date: '2026-10-01', amount: 10_00 })];
    expect(bucketBalances(data, '2026-10-10')).toEqual({ cash: -10_00, savings: 0, passive: 0 });
  });
});

describe('debtBalance', () => {
  it('a loan falls with payments and never counts card expenses', () => {
    const data = base();
    const loan = makeDebt({
      id: 'loan-1',
      kind: 'loan',
      openingBalance: 5_000_00,
      openingDate: '2026-10-01',
      creditLimit: null,
      statementDay: null,
      dueDay: null,
      payInFull: false,
    });
    data.tables.debt = [loan];
    data.tables.expense = [
      makeExpense({
        date: '2026-10-02',
        paymentMethod: 'credit_card',
        cardId: 'loan-1',
        amount: 99_00,
      }),
    ];
    data.tables.transaction = [
      makeTransaction({
        type: 'debt_payment',
        debtId: 'loan-1',
        from: 'cash',
        to: null,
        amount: 250_00,
        date: '2026-10-03',
      }),
    ];
    expect(debtBalance(loan, data, '2026-10-10')).toBe(4_750_00);
  });

  it('an overpaid card shows a negative balance', () => {
    const data = base();
    const card = makeDebt({ id: 'card-1', openingBalance: 0, openingDate: '2026-10-01' });
    data.tables.debt = [card];
    data.tables.expense = [
      makeExpense({
        date: '2026-10-02',
        paymentMethod: 'credit_card',
        cardId: 'card-1',
        amount: 40_00,
      }),
    ];
    data.tables.transaction = [
      makeTransaction({
        type: 'card_payment',
        debtId: 'card-1',
        from: 'cash',
        to: null,
        amount: 50_00,
        date: '2026-10-03',
      }),
    ];
    expect(debtBalance(card, data, '2026-10-10')).toBe(-10_00);
  });
});

describe('netWorth', () => {
  it('adds buckets and investments and subtracts debts', () => {
    expect(netWorth({ cash: 100, savings: 200, passive: 50 }, 30, 1000)).toBe(1320);
    expect(netWorth({ cash: 100, savings: 0, passive: 0 }, 30)).toBe(70);
  });
});
