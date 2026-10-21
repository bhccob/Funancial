import { describe, expect, it } from 'vitest';
import {
  makeAccount,
  makeExpense,
  makeLimit,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import { accountRows } from './balances';
import { addDays } from './dates';
import {
  availableBalance,
  cardPayment,
  cashInPocket,
  categoryBreakdown,
  limitLabel,
  limitStatus,
  reservedTotal,
  savedTotal,
  spendingSummary,
  upcomingBills,
} from './budget';
import type { Account, CreditTerms } from './entities';
import { emptySnapshot, type DataSnapshot } from './snapshot';

const TODAY = '2026-10-14';

/** A credit card's account: paid in full by default, due on the 21st. */
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

const savingsAccount = (openingBalance: number) =>
  makeAccount({
    id: 'acct-savings',
    name: 'Savings',
    kind: 'savings',
    skin: 'mint',
    inAvailable: false,
    openingBalance,
    openingDate: '2026-10-01',
    order: 1,
  });

describe('available to spend', () => {
  /**
   * Main account: 2,500.00 less 100.00 of groceries. A cash wallet with 50.00 and savings of
   * 3,000.00. A Visa owing 230.00, due on the 21st. Streamflix renews on Main on the 20th and the
   * gym in November. The 1,200.00 rent limit is reserved and nothing of it is spent.
   */
  function world(): DataSnapshot {
    const d = emptySnapshot();
    d.tables.account = [
      makeAccount({ openingBalance: 2_500_00, openingDate: '2026-10-01' }),
      savingsAccount(3_000_00),
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
    d.tables.expense = [makeExpense({ amount: 100_00, date: '2026-10-13', category: 'food' })];
    d.tables.subscription = [
      makeSubscription({ name: 'Streamflix', amount: 15_99, nextRenewal: '2026-10-20' }),
      makeSubscription({
        name: 'FitHub Gym',
        amount: 39_00,
        nextRenewal: '2026-11-02',
        category: 'health',
      }),
    ];
    d.tables.budgetLimit = [
      makeLimit({ category: 'rent', period: 'monthly', amount: 1_200_00, reserve: true }),
      makeLimit({ category: 'food', period: 'weekly', amount: 120_00 }),
    ];
    return d;
  }
  const available = (d: DataSnapshot) =>
    availableBalance(accountRows(d, TODAY), upcomingBills(d, TODAY), reservedTotal(d, TODAY, 1));

  it('lists this month’s bills, renewals to month end and the card’s, each with its account', () => {
    expect(
      upcomingBills(world(), TODAY).map((b) => [b.date, b.name, b.amount, b.kind, b.accountId]),
    ).toEqual([
      ['2026-10-20', 'Streamflix', 15_99, 'subscription', 'acct-main'],
      ['2026-10-21', 'Visa', 230_00, 'card', 'card-1'],
    ]);
  });

  it('is what Main account and the wallet hold, less bills and what is reserved', () => {
    expect(reservedTotal(world(), TODAY, 1)).toBe(1_200_00);
    expect(available(world())).toBe(2_400_00 + 50_00 - 15_99 - 230_00 - 1_200_00);
  });

  it('available leaves savings out', () => {
    const d = world();
    d.tables.account = d.tables.account.map((a) =>
      a.id === 'acct-savings' ? savingsAccount(9_999_00) : a,
    );
    expect(available(d)).toBe(available(world()));
    // Savings counts once it is marked to.
    d.tables.account = d.tables.account.map((a) =>
      a.id === 'acct-savings' ? { ...a, inAvailable: true } : a,
    );
    expect(available(d)).toBe(available(world()) + 9_999_00);
  });

  it('a subscription on a credit card is not taken off available', () => {
    const d = world();
    d.tables.subscription.push(
      makeSubscription({
        name: 'Cloud',
        amount: 9_99,
        nextRenewal: '2026-10-18',
        accountId: 'card-1',
      }),
    );
    expect(upcomingBills(d, TODAY).map((b) => [b.name, b.accountId])).toContainEqual([
      'Cloud',
      'card-1',
    ]);
    expect(available(d)).toBe(available(world()));
  });

  it('a subscription on savings is not taken off available either', () => {
    const d = world();
    d.tables.subscription.push(
      makeSubscription({
        name: 'Vault',
        amount: 5_00,
        nextRenewal: '2026-10-18',
        accountId: 'acct-savings',
      }),
    );
    expect(available(d)).toBe(available(world()));
  });

  it('a subscription on the wallet is taken off available', () => {
    const d = world();
    d.tables.subscription.push(
      makeSubscription({
        name: 'Paper',
        amount: 4_00,
        nextRenewal: '2026-10-18',
        accountId: 'acct-cash',
      }),
    );
    expect(available(d)).toBe(available(world()) - 4_00);
  });

  it('a card bill is taken off available', () => {
    const d = world();
    d.tables.account = d.tables.account.map((a) =>
      a.id === 'card-1' ? { ...a, openingBalance: 0 } : a,
    );
    expect(upcomingBills(d, TODAY).filter((b) => b.kind === 'card')).toEqual([]);
    expect(available(world())).toBe(available(d) - 230_00);
  });

  it('cash in pocket sums cash accounts only', () => {
    expect(cashInPocket(accountRows(world(), TODAY))).toBe(50_00);
    expect(cashInPocket([])).toBe(0);
  });

  it('saved sums savings accounts only', () => {
    expect(savedTotal(accountRows(world(), TODAY))).toBe(3_000_00);
    expect(savedTotal([])).toBe(0);
  });

  it('an archived card has no bill', () => {
    const archive = (archivedOn: string) => {
      const d = world();
      d.tables.account = d.tables.account.map((a) =>
        a.id === 'card-1' ? { ...a, archivedOn } : a,
      );
      return upcomingBills(d, TODAY).filter((b) => b.kind === 'card');
    };
    expect(archive(TODAY)).toEqual([]);
    // Not archived yet on the day: it still bills.
    expect(archive('2026-10-15').map((b) => b.accountId)).toEqual(['card-1']);
  });

  it('puts the food limit in the warning zone', () => {
    const d = world();
    const food = d.tables.budgetLimit.find((l) => l.category === 'food')!;
    expect(limitStatus(food, d, TODAY, 1)).toMatchObject({
      spent: 100_00,
      remaining: 20_00,
      pct: 83,
      level: 'warn',
      range: { start: '2026-10-12', end: '2026-10-18' },
    });
  });
});

describe('limit levels', () => {
  it.each([
    [79_00, 'ok'],
    [80_00, 'warn'],
    [99_99, 'warn'],
    [100_00, 'over'],
    [119_99, 'over'],
    [120_00, 'way-over'],
  ])('spent %d of 100.00 is %s', (spent, level) => {
    const data = emptySnapshot();
    const limit = makeLimit({ category: 'food', period: 'monthly', amount: 100_00 });
    data.tables.expense = [makeExpense({ amount: spent, date: TODAY, category: 'food' })];
    expect(limitStatus(limit, data, TODAY, 1).level).toBe(level);
  });

  it('counts subscription charges and card spending, and only the matching category', () => {
    const data = emptySnapshot();
    const fun = makeLimit({ category: 'entertainment', period: 'monthly', amount: 100_00 });
    const overall = makeLimit({
      scope: 'overall',
      category: null,
      period: 'monthly',
      amount: 1_000_00,
    });
    data.tables.expense = [
      makeExpense({
        amount: 15_99,
        date: '2026-10-03',
        category: 'entertainment',
        subscriptionId: 'sub-1',
      }),
      makeExpense({
        amount: 30_00,
        date: '2026-10-05',
        category: 'entertainment',
        accountId: 'c1',
      }),
      makeExpense({ amount: 50_00, date: '2026-10-06', category: 'food' }),
      makeExpense({ amount: 70_00, date: '2026-09-30', category: 'entertainment' }),
    ];
    expect(limitStatus(fun, data, TODAY, 1).spent).toBe(45_99);
    expect(limitStatus(overall, data, TODAY, 1).spent).toBe(95_99);
  });

  it('labels limits', () => {
    expect(limitLabel(makeLimit({ category: 'food' }))).toBe('Food');
    expect(limitLabel(makeLimit({ scope: 'overall', category: null }))).toBe('Overall');
  });
});

describe('upcomingBills', () => {
  const data = () => emptySnapshot();

  it('skips cancelled subscriptions and renewals after month end', () => {
    const d = data();
    d.tables.subscription = [
      makeSubscription({ name: 'Old', nextRenewal: '2026-10-20', status: 'cancelled' }),
      makeSubscription({ name: 'Next month', nextRenewal: '2026-11-01' }),
    ];
    expect(upcomingBills(d, TODAY)).toEqual([]);
  });

  it('looks as far as `until` says, while the default stops at month end', () => {
    const d = data();
    d.tables.subscription = [
      makeSubscription({ name: 'Early next month', amount: 15_99, nextRenewal: '2026-11-02' }),
      makeSubscription({ name: 'Later', amount: 9_99, nextRenewal: '2026-11-04' }),
    ];
    const names = (bills: ReturnType<typeof upcomingBills>) => bills.map((b) => [b.date, b.name]);

    expect(upcomingBills(d, '2026-10-28')).toEqual([]);
    expect(names(upcomingBills(d, '2026-10-28', '2026-11-03'))).toEqual([
      ['2026-11-02', 'Early next month'],
    ]);
    // `until` is a day that still counts.
    expect(names(upcomingBills(d, '2026-10-28', '2026-11-04'))).toEqual([
      ['2026-11-02', 'Early next month'],
      ['2026-11-04', 'Later'],
    ]);
    expect(upcomingBills(d, '2026-10-28', '2026-11-01')).toEqual([]);
  });

  it('lists each weekly renewal left this month', () => {
    const d = data();
    d.tables.subscription = [
      makeSubscription({ name: 'Box', amount: 10_00, cycle: 'weekly', nextRenewal: '2026-10-20' }),
    ];
    expect(upcomingBills(d, TODAY).map((b) => b.date)).toEqual(['2026-10-20', '2026-10-27']);
  });

  it('asks only the minimum payment for cards not paid in full, and nothing for a zero balance', () => {
    const d = data();
    d.tables.account = [
      creditCard(
        { id: 'c1', name: 'Store card', openingBalance: 900_00 },
        { payInFull: false, minimumPayment: 35_00, dueDay: 5 },
      ),
      creditCard({ id: 'c2', name: 'Empty', openingBalance: 0, order: 4 }),
    ];
    expect(upcomingBills(d, TODAY).map((b) => [b.date, b.name, b.amount])).toEqual([
      ['2026-11-05', 'Store card', 35_00],
    ]);
  });

  it('bills cards only, never what a bank, cash or savings account holds', () => {
    const d = data();
    d.tables.account = [makeAccount({ openingBalance: 500_00, openingDate: '2026-10-01' })];
    expect(upcomingBills(d, TODAY)).toEqual([]);
  });
});

describe('upcomingBills for a card with no minimum set', () => {
  it('bills the whole balance instead of nothing', () => {
    const d = emptySnapshot();
    d.tables.account = [
      creditCard(
        { name: 'Revolving', openingBalance: 500_00 },
        { payInFull: false, minimumPayment: 0, dueDay: 21 },
      ),
    ];
    expect(upcomingBills(d, '2026-10-14').map((b) => b.amount)).toEqual([500_00]);
  });
});

describe('cardPayment', () => {
  const pays = (terms: Partial<CreditTerms>, owed: number) =>
    cardPayment(emptySnapshot(), creditCard({}, terms), owed, TODAY);

  it('is the whole balance for a card paid in full, or one with no minimum on file', () => {
    expect(pays({ payInFull: true, minimumPayment: 25_00 }, 230_00)).toEqual({
      inFull: true,
      amount: 230_00,
    });
    expect(pays({ payInFull: false, minimumPayment: 0 }, 230_00)).toEqual({
      inFull: true,
      amount: 230_00,
    });
  });

  it('is the minimum otherwise, but never more than is owed', () => {
    expect(pays({ payInFull: false, minimumPayment: 25_00 }, 230_00)).toEqual({
      inFull: false,
      amount: 25_00,
    });
    expect(pays({ payInFull: false, minimumPayment: 25_00 }, 12_00).amount).toBe(12_00);
  });
});

describe('reservedTotal', () => {
  it('holds back what is left of reserved limits, never less than zero', () => {
    const d = emptySnapshot();
    d.tables.budgetLimit = [
      makeLimit({ category: 'rent', period: 'monthly', amount: 1_200_00, reserve: true }),
      makeLimit({ category: 'utilities', period: 'monthly', amount: 100_00, reserve: true }),
      makeLimit({ category: 'food', period: 'monthly', amount: 300_00, reserve: false }),
    ];
    d.tables.expense = [
      makeExpense({ amount: 200_00, date: '2026-10-02', category: 'rent' }),
      makeExpense({ amount: 150_00, date: '2026-10-02', category: 'utilities' }),
    ];
    expect(reservedTotal(d, TODAY, 1)).toBe(1_000_00);
  });
});

describe('spending', () => {
  const expenses = [
    makeExpense({ amount: 10_00, date: TODAY, category: 'food' }),
    makeExpense({ amount: 20_00, date: '2026-10-12', category: 'transport' }),
    makeExpense({ amount: 30_00, date: '2026-10-02', category: 'food' }),
    makeExpense({ amount: 40_00, date: '2026-01-02', category: 'shopping' }),
    makeExpense({ amount: 50_00, date: '2025-12-31', category: 'food' }),
  ];

  it('totals today, this week, this month and this year', () => {
    expect(spendingSummary(expenses, TODAY, 1)).toEqual({
      today: 10_00,
      week: 30_00,
      month: 60_00,
      year: 100_00,
    });
  });

  it('breaks a range down by category, biggest first', () => {
    expect(categoryBreakdown(expenses, { start: '2026-01-01', end: '2026-12-31' })).toEqual([
      { category: 'food', amount: 40_00 },
      { category: 'shopping', amount: 40_00 },
      { category: 'transport', amount: 20_00 },
    ]);
  });
});

describe('a card whose minimum is paid before its due date', () => {
  // Owes 800.00 with a 25.00 minimum due on the 21st; the cycle began after the 21st of September.
  const card = (over: Partial<CreditTerms> & { openingBalance?: number } = {}) => {
    const { openingBalance = 800_00, ...terms } = over;
    return creditCard(
      { openingDate: '2025-01-01', openingBalance },
      { payInFull: false, minimumPayment: 25_00, dueDay: 21, ...terms },
    );
  };
  const paid = (amount: number, date: string, toAccountId = 'visa') =>
    makeTransaction({
      type: 'card_payment',
      amount,
      date,
      fromAccountId: 'acct-main',
      toAccountId,
    });
  const due = (
    today: string,
    over: Parameters<typeof card>[0],
    ...payments: ReturnType<typeof paid>[]
  ) => {
    const d = emptySnapshot();
    d.tables.account = [card(over)];
    d.tables.transaction = payments;
    return upcomingBills(d, today).map((b) => [b.date, b.amount]);
  };

  it('has no bill once the whole minimum is paid', () => {
    expect(due(TODAY, {})).toEqual([['2026-10-21', 25_00]]);
    expect(due(TODAY, {}, paid(25_00, TODAY))).toEqual([]);
  });

  it('asks what is left after a part payment, and adds up several', () => {
    expect(due(TODAY, {}, paid(10_00, TODAY))).toEqual([['2026-10-21', 15_00]]);
    expect(due(TODAY, {}, paid(10_00, '2026-10-02'), paid(15_00, '2026-10-10'))).toEqual([]);
  });

  it('counts only payments after the previous due date, up to today', () => {
    // The 21st of September ended the last cycle, so a payment on it belongs to that one.
    expect(due(TODAY, {}, paid(25_00, '2026-09-21'))).toEqual([['2026-10-21', 25_00]]);
    expect(due(TODAY, {}, paid(25_00, '2026-09-22'))).toEqual([]);
    expect(due(TODAY, {}, paid(25_00, '2026-10-20'))).toEqual([['2026-10-21', 25_00]]);
    expect(due(TODAY, {}, paid(25_00, TODAY, 'another-card'))).toEqual([['2026-10-21', 25_00]]);
    // A new cycle starts on the day after the due date: the October payment no longer counts.
    expect(due('2026-10-22', {}, paid(25_00, TODAY))).toEqual([['2026-11-21', 25_00]]);
  });

  it('never asks more than is owed, nor loses what is still owed to a small balance', () => {
    expect(due(TODAY, { openingBalance: 25_00 }, paid(20_00, TODAY))).toEqual([
      ['2026-10-21', 5_00],
    ]);
    expect(due(TODAY, { openingBalance: 25_00 }, paid(5_00, TODAY))).toEqual([
      ['2026-10-21', 20_00],
    ]);
  });

  it('leaves a card paid in full to its balance, which already reflects payments', () => {
    expect(due(TODAY, { payInFull: true }, paid(100_00, TODAY))).toEqual([['2026-10-21', 700_00]]);
  });

  it('has no cycle to count payments in when there is no due day', () => {
    expect(due(TODAY, { dueDay: null }, paid(25_00, TODAY))).toEqual([[TODAY, 25_00]]);
  });

  // The previous due date is the same day a month before, clamped like nextDueDate clamps.
  it.each([
    ['a short month', '2026-03-01', 31, '2026-03-31', '2026-02-28'],
    ['a short month ahead', '2026-02-10', 31, '2026-02-28', '2026-01-31'],
    ['a leap February', '2028-02-10', 30, '2028-02-29', '2028-01-30'],
    ['the turn of the year', '2026-01-10', 15, '2026-01-15', '2025-12-15'],
    ['a long month after a short one', '2026-05-01', 30, '2026-05-30', '2026-04-30'],
  ])('uses the due date clamped in %s', (_name, today, dueDay, next, previous) => {
    expect(due(today, { dueDay }, paid(25_00, previous))).toEqual([[next, 25_00]]);
    expect(due(today, { dueDay }, paid(25_00, addDays(previous, 1)))).toEqual([]);
  });
});
