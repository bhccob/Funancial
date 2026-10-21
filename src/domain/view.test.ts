import { describe, expect, it } from 'vitest';
import {
  makeAccount,
  makeDebt,
  makeExpense,
  makeHolding,
  makeLimit,
  makeProfile,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import type { Account, CreditTerms } from './entities';
import { emptySnapshot, type DataSnapshot } from './snapshot';
import { computeFinanceView } from './view';

const TODAY = '2026-10-14';

/** A credit card's account, opened on 1 Oct: paid in full, due on the 21st. */
function creditCard(overrides: Partial<Account> = {}, terms: Partial<CreditTerms> = {}): Account {
  return makeAccount({
    id: 'visa',
    name: 'Visa',
    kind: 'credit',
    skin: 'violet',
    inAvailable: false,
    openingBalance: 0,
    openingDate: '2026-10-01',
    order: 3,
    credit: {
      limit: 3_000_00,
      statementDay: 1,
      dueDay: 21,
      payInFull: true,
      minimumPayment: 25_00,
      interestRate: 22.9,
      ...terms,
    },
    ...overrides,
  });
}

/**
 * Main account: 2,500.00, less 100.00 of groceries and a 100.00 loan payment. Savings of 3,000.00
 * and a wallet with 50.00. A Visa owing 230.00 due on the 21st, and a 500.00 loan. Streamflix on
 * Main renews on the 20th and the gym in November; the 1,200.00 rent limit is reserved.
 */
function world(): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ openingDate: '2026-10-01' })];
  data.tables.account = [
    makeAccount({ openingBalance: 2_500_00, openingDate: '2026-10-01' }),
    makeAccount({
      id: 'acct-savings',
      name: 'Savings',
      kind: 'savings',
      skin: 'mint',
      inAvailable: false,
      openingBalance: 3_000_00,
      openingDate: '2026-10-01',
      order: 1,
    }),
    makeAccount({
      id: 'acct-cash',
      name: 'Wallet',
      kind: 'cash',
      skin: 'amber',
      openingBalance: 50_00,
      openingDate: '2026-10-01',
      order: 2,
    }),
    creditCard({ id: 'card-1', openingBalance: 230_00 }),
  ];
  data.tables.debt = [
    makeDebt({ id: 'loan-1', openingBalance: 500_00, openingDate: '2026-10-01' }),
  ];
  data.tables.transaction = [
    makeTransaction({
      type: 'debt_payment',
      amount: 100_00,
      date: '2026-10-05',
      fromAccountId: 'acct-main',
      toAccountId: null,
      debtId: 'loan-1',
    }),
  ];
  data.tables.expense = [makeExpense({ amount: 100_00, date: '2026-10-13', category: 'food' })];
  data.tables.subscription = [
    makeSubscription({ name: 'Streamflix', amount: 15_99, nextRenewal: '2026-10-20' }),
    makeSubscription({
      name: 'FitHub Gym',
      amount: 39_00,
      nextRenewal: '2026-11-02',
      category: 'health',
    }),
  ];
  data.tables.budgetLimit = [
    makeLimit({ category: 'rent', period: 'monthly', amount: 1_200_00, reserve: true }),
    makeLimit({ category: 'food', period: 'weekly', amount: 120_00 }),
  ];
  return data;
}

describe('computeFinanceView', () => {
  it('gathers the numbers per account', () => {
    const v = computeFinanceView(world(), TODAY, 1);
    expect(v.accounts.map((r) => [r.account.id, r.balance])).toEqual([
      ['acct-main', 2_300_00],
      ['acct-savings', 3_000_00],
      ['acct-cash', 50_00],
      ['card-1', 230_00],
    ]);
    expect(v.loans.map((l) => [l.debt.id, l.balance])).toEqual([['loan-1', 400_00]]);
    expect(v).toMatchObject({
      owed: 230_00 + 400_00,
      cash: 50_00,
      saved: 3_000_00,
      investments: 0,
      netWorth: 2_300_00 + 3_000_00 + 50_00 - 230_00 - 400_00,
      billsTotal: 15_99 + 230_00,
      reserved: 1_200_00,
      available: 2_300_00 + 50_00 - 15_99 - 230_00 - 1_200_00,
      subscriptionsMonthly: 54_99,
      spending: { today: 0, week: 100_00, month: 100_00, year: 100_00 },
      pendingSalary: [],
    });
    expect(v).not.toHaveProperty('buckets');
    expect(v).not.toHaveProperty('debts');
    expect(v).not.toHaveProperty('debtTotal');
    expect(v.limits.map((l) => [l.limit.category, l.pct])).toEqual([
      ['food', 83],
      ['rent', 0],
    ]);
  });

  it('leaves an archived card out: no row, no bill, and what it owes no longer counts', () => {
    const data = world();
    data.tables.account = data.tables.account.map((a) =>
      a.id === 'card-1' ? { ...a, archivedOn: TODAY } : a,
    );
    const v = computeFinanceView(data, TODAY, 1);
    const before = computeFinanceView(world(), TODAY, 1);
    expect(v.accounts.map((r) => r.account.id)).not.toContain('card-1');
    expect(v.owed).toBe(400_00);
    expect(v.netWorth).toBe(before.netWorth + 230_00);
    expect(v.bills.filter((b) => b.kind === 'card')).toEqual([]);
  });

  it('leaves an archived loan out of the list, what is owed and net worth', () => {
    const data = world();
    data.tables.debt = data.tables.debt.map((d) => ({ ...d, archivedOn: TODAY }));
    const v = computeFinanceView(data, TODAY, 1);
    const before = computeFinanceView(world(), TODAY, 1);
    expect(v.loans).toEqual([]);
    expect(v.owed).toBe(230_00);
    expect(v.netWorth).toBe(before.netWorth + 400_00);
  });

  it('does not take a card minimum off Available to spend twice once it is paid', () => {
    const data = emptySnapshot();
    data.tables.profile = [makeProfile({ openingDate: '2026-10-01' })];
    // Owes 800.00, a 25.00 minimum due on the 21st.
    data.tables.account = [
      makeAccount({ openingBalance: 1_000_00, openingDate: '2026-10-01' }),
      creditCard(
        { openingBalance: 800_00 },
        { payInFull: false, minimumPayment: 25_00, dueDay: 21 },
      ),
    ];
    const before = computeFinanceView(data, TODAY, 1);
    expect([before.accounts[0]!.balance, before.billsTotal, before.available]).toEqual([
      1_000_00, 25_00, 975_00,
    ]);

    data.tables.transaction = [
      makeTransaction({
        type: 'card_payment',
        amount: 25_00,
        date: TODAY,
        fromAccountId: 'acct-main',
        toAccountId: 'visa',
      }),
    ];
    const after = computeFinanceView(data, TODAY, 1);
    expect([after.accounts[0]!.balance, after.bills, after.available]).toEqual([
      975_00,
      [],
      975_00,
    ]);
    expect(after.accounts.map((r) => r.balance)).toEqual([975_00, 775_00]);
  });

  it('counts the priced portfolio as investments in net worth', () => {
    const data = emptySnapshot();
    data.tables.profile = [makeProfile({ openingDate: '2026-10-01' })];
    data.tables.account = [makeAccount({ openingBalance: 1_000_00, openingDate: '2026-10-01' })];
    const quote = {
      price: 60,
      previousClose: null,
      fxRate: null,
      asOf: '2026-10-14T08:00:00.000Z',
    };
    data.tables.holding = [makeHolding({ shares: 10, quote }), makeHolding({ quote: null })];
    const v = computeFinanceView(data, TODAY, 1);
    expect(v.investments).toBe(600_00);
    expect(v.netWorth).toBe(1_600_00);
  });

  it('has no active freeze', () => {
    const data = emptySnapshot();
    data.tables.profile = [
      makeProfile({
        openingDate: '2026-09-01',
        salary: { monthlyAmount: 3_000_00, payDay: 25 },
      }),
    ];
    const v = computeFinanceView(data, TODAY, 1);
    expect(v).not.toHaveProperty('activeFreeze');
    expect(v.expectedSalaryThisMonth).toBe(3_000_00);
  });

  it('reports this month’s expected salary: the monthly amount, or 0 without a salary', () => {
    const data = emptySnapshot();
    data.tables.profile = [
      makeProfile({
        openingDate: '2026-09-01',
        salary: { monthlyAmount: 3_000_00, payDay: 25 },
      }),
    ];
    expect(computeFinanceView(data, TODAY, 1).expectedSalaryThisMonth).toBe(3_000_00);
    data.tables.profile = [makeProfile({ openingDate: '2026-09-01', salary: null })];
    expect(computeFinanceView(data, TODAY, 1).expectedSalaryThisMonth).toBe(0);
  });
});
