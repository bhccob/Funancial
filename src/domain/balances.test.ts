import { describe, expect, it } from 'vitest';
import {
  makeDebt,
  makeDividend,
  makeExpense,
  makeProfile,
  makeSale,
  makeTransaction,
} from '@/test/fixtures';
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

describe('investments and dividends', () => {
  it('lowers cash for an investment and raises the chosen bucket for a confirmed dividend', () => {
    const data = base();
    data.tables.transaction = [
      makeTransaction({
        type: 'investment',
        from: 'cash',
        to: null,
        amount: 200_00,
        date: '2026-10-02',
      }),
      makeTransaction({
        type: 'investment',
        from: 'savings',
        to: null,
        amount: 300_00,
        date: '2026-10-02',
      }),
      makeTransaction({
        type: 'investment',
        from: 'cash',
        to: null,
        amount: 50_00,
        date: '2026-10-12',
      }),
    ];
    const paid = (
      bucket: 'cash' | 'savings' | 'passive' | 'reinvest',
      amount: number,
      paidOn = '2026-10-03',
    ) => makeDividend({ bucket, amount, paidOn });
    data.tables.dividend = [
      paid('cash', 11_20),
      paid('savings', 5_00),
      paid('passive', 7_00),
      paid('reinvest', 9_00),
      paid('cash', 99_00, '2026-10-12'), // after the as-of day
      paid('cash', 98_00, '2026-09-30'), // before the opening date
      makeDividend({ status: 'skipped', amount: 0, bucket: null, paidOn: '2026-10-03' }),
    ];
    expect(bucketBalances(data, '2026-10-10')).toEqual({
      cash: 1_000_00 - 200_00 + 11_20,
      savings: 5_000_00 - 300_00 + 5_00,
      passive: 7_00,
    });
    expect(bucketBalances(data, '2026-10-12').cash).toBe(1_000_00 - 250_00 + 11_20 + 99_00);
  });
});

describe('sales', () => {
  it('puts the proceeds into the bucket they went to, on the day of the sale', () => {
    const data = base();
    data.tables.sale = [
      makeSale({ proceeds: 300_00, to: 'cash', soldOn: '2026-10-03' }),
      makeSale({ proceeds: 450_00, to: 'savings', soldOn: '2026-10-04' }),
      makeSale({ proceeds: 99_00, to: 'cash', soldOn: '2026-10-12' }), // after the as-of day
      makeSale({ proceeds: 98_00, to: 'savings', soldOn: '2026-09-30' }), // before the opening date
    ];
    expect(bucketBalances(data, '2026-10-10')).toEqual({
      cash: 1_000_00 + 300_00,
      savings: 5_000_00 + 450_00,
      passive: 0,
    });
    expect(bucketBalances(data, '2026-10-03').savings).toBe(5_000_00);
    expect(bucketBalances(data, '2026-10-12').cash).toBe(1_000_00 + 300_00 + 99_00);
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
