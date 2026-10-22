import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { accountBalance, debtBalance } from '@/domain/balances';
import { SubscriptionSchema, type Account, type CreditTerms } from '@/domain/entities';
import { holdingRate, holdingValue } from '@/domain/portfolio';
import type { DataSnapshot } from '@/domain/snapshot';
import { freshRealStore } from '@/test/realStore';
import {
  makeAccount,
  makeDebt,
  makeExpense,
  makeGoal,
  makeHolding,
  makeIncome,
  makeLimit,
  makeProfile,
  makeSubscription,
} from '@/test/fixtures';
import { createFinanceActions } from './financeActions';

const MAIN = 'acct-main';
const SAVINGS = 'acct-savings';
const TODAY = '2026-10-14';

const terms = (overrides: Partial<CreditTerms> = {}): CreditTerms => ({
  limit: null,
  statementDay: null,
  dueDay: 21,
  payInFull: true,
  minimumPayment: 0,
  interestRate: 0,
  ...overrides,
});

/** A credit card's account, opened with the others; its balance is what is owed. */
const makeCard = (overrides: Partial<Account> = {}) =>
  makeAccount({
    id: 'card-1',
    name: 'Visa',
    kind: 'credit',
    skin: 'violet',
    inAvailable: false,
    order: 2,
    openingDate: '2026-10-01',
    openingBalance: 0,
    credit: terms(),
    ...overrides,
  });

/** Main account (the default) with 1,000 and Savings with 5,000, both opened on Oct 1. */
async function setup() {
  const t = await freshRealStore();
  const settings = t.store.getState().data.tables.settings[0]!;
  await t.store.getState().putMany([
    {
      table: 'profile',
      record: makeProfile({
        openingDate: '2026-10-01',
        salary: { monthlyAmount: 3_100_00, payDay: 25 },
      }),
    },
    {
      table: 'account',
      record: makeAccount({ openingDate: '2026-10-01', openingBalance: 1_000_00 }),
    },
    {
      table: 'account',
      record: makeAccount({
        id: SAVINGS,
        name: 'Savings',
        kind: 'savings',
        skin: 'mint',
        inAvailable: false,
        order: 1,
        openingDate: '2026-10-01',
        openingBalance: 5_000_00,
      }),
    },
    { table: 'settings', record: { ...settings, defaultAccountId: MAIN } },
  ]);
  return { ...t, actions: createFinanceActions(t.store) };
}

type Store = Awaited<ReturnType<typeof setup>>['store'];

/** What an account holds on a day, or for a credit card what is owed on it. */
const balanceOf = (data: DataSnapshot, id: string, day = TODAY) =>
  accountBalance(
    data.tables.account.find((a) => a.id === id)!,
    data,
    day,
  );

const lunch = {
  amount: 12_50,
  category: 'food' as const,
  date: TODAY,
  note: 'Lunch',
  accountId: MAIN,
  repeat: null,
};

describe('expenses', () => {
  it('adds an expense on the account it was paid with, and reports limit alerts', async () => {
    const { store, actions } = await setup();
    await store
      .getState()
      .put(
        'budgetLimit',
        makeLimit({ id: 'food', category: 'food', period: 'weekly', amount: 20_00 }),
      );
    const { expense, alerts } = await actions.addExpense({ ...lunch, amount: 17_00 });
    const data = store.getState().data;
    expect(data.tables.expense).toEqual([
      expect.objectContaining({ id: expense.id, accountId: MAIN }),
    ]);
    expect(balanceOf(data, MAIN)).toBe(983_00);
    expect(alerts.map((a) => [a.limit.id, a.level])).toEqual([['food', 'warn']]);
  });

  it('a repeating expense becomes a subscription on the same account, renewing one cycle later', async () => {
    const { store, actions } = await setup();
    await store.getState().put('account', makeCard());
    const { expense } = await actions.addExpense({
      ...lunch,
      amount: 1_200_00,
      category: 'rent',
      note: 'Rent',
      date: '2026-10-01',
      accountId: 'card-1',
      repeat: 'monthly',
    });
    const [sub] = store.getState().data.tables.subscription;
    expect(sub).toMatchObject({
      name: 'Rent',
      amount: 1_200_00,
      cycle: 'monthly',
      anchorDay: 1,
      nextRenewal: '2026-11-01',
      category: 'rent',
      accountId: 'card-1',
    });
    expect(expense).toMatchObject({ subscriptionId: sub!.id, accountId: 'card-1' });
  });

  it('refuses a future date', async () => {
    const { actions } = await setup();
    await expect(actions.addExpense({ ...lunch, date: '2026-10-15' })).rejects.toThrow(
      'Use today or an earlier date.',
    );
  });

  it('updates, also to another account, and deletes', async () => {
    const { store, actions } = await setup();
    const { expense } = await actions.addExpense(lunch);
    await actions.updateExpense(expense.id, {
      amount: 13_00,
      note: 'Lunch + tip',
      accountId: SAVINGS,
    });
    expect(store.getState().data.tables.expense[0]).toMatchObject({
      amount: 13_00,
      note: 'Lunch + tip',
      accountId: SAVINGS,
    });
    await actions.deleteExpense(expense.id);
    expect(store.getState().data.tables.expense).toEqual([]);
  });
});

describe('income', () => {
  it('a manual salary entry confirms the expected one instead of duplicating it', async () => {
    const { store, actions } = await setup();
    await store.getState().put(
      'income',
      makeIncome({
        id: 'salary-2026-10',
        amount: 3_100_00,
        date: '2026-10-25',
        status: 'expected',
        accountId: MAIN,
        period: '2026-10',
      }),
    );
    await actions.addIncome({
      amount: 3_050_00,
      source: 'salary',
      label: 'Salary',
      date: TODAY,
      accountId: SAVINGS,
      note: '',
    });
    expect(
      store.getState().data.tables.income.map((i) => [i.id, i.status, i.amount, i.accountId]),
    ).toEqual([['salary-2026-10', 'confirmed', 3_050_00, SAVINGS]]);
  });

  it('confirms an expected income with the received amount, on its account', async () => {
    const { store, actions } = await setup();
    const income = await actions.addIncome({
      amount: 100_00,
      source: 'extra',
      label: 'Gift',
      date: TODAY,
      accountId: SAVINGS,
      note: '',
    });
    expect(income).toMatchObject({ status: 'confirmed', period: null, accountId: SAVINGS });
    await store.getState().put('income', { ...income, status: 'expected' });
    await actions.confirmIncome(income.id, 120_00);
    const data = store.getState().data;
    expect(data.tables.income[0]).toMatchObject({
      status: 'confirmed',
      amount: 120_00,
      accountId: SAVINGS,
    });
    expect(balanceOf(data, SAVINGS)).toBe(5_120_00);
  });
});

describe('accounts', () => {
  const wallet = {
    name: 'Wallet',
    kind: 'cash' as const,
    last4: null,
    openingBalance: 40_00,
    credit: null,
  };

  it("a new account opens today, after the others, with its kind's look", async () => {
    const { store, actions } = await setup();
    const saved = await actions.saveAccount(wallet);
    expect(saved).toMatchObject({
      name: 'Wallet',
      kind: 'cash',
      skin: 'amber',
      inAvailable: true,
      openingBalance: 40_00,
      openingDate: TODAY,
      order: 2,
      frozen: false,
      last4: null,
      credit: null,
    });
    expect(saved.archivedOn).toBeUndefined();
    expect(store.getState().data.tables.account.map((a) => a.id)).toEqual([
      MAIN,
      SAVINGS,
      saved.id,
    ]);
  });

  it('places a new one after the last, archived ones included', async () => {
    const { store, actions } = await setup();
    await store.getState().put('account', makeCard({ order: 7, archivedOn: '2026-10-02' }));
    expect((await actions.saveAccount(wallet)).order).toBe(8);
  });

  it('keeps the look and Available choice the input gives', async () => {
    const { actions } = await setup();
    const saved = await actions.saveAccount({
      ...wallet,
      kind: 'debit',
      skin: 'ocean',
      inAvailable: false,
      last4: '4242',
    });
    expect(saved).toMatchObject({ skin: 'ocean', inAvailable: false, last4: '4242' });
  });

  it('a credit card never counts toward Available, whatever the input says', async () => {
    const { store, actions } = await setup();
    const card = await actions.saveAccount({
      name: 'Visa',
      kind: 'credit',
      last4: null,
      openingBalance: 230_00,
      inAvailable: true,
      credit: terms({ limit: 2_000_00 }),
    });
    expect(card).toMatchObject({ kind: 'credit', skin: 'violet', inAvailable: false });
    const edited = await actions.saveAccount({
      id: card.id,
      name: 'Visa Gold',
      kind: 'credit',
      last4: null,
      openingBalance: 230_00,
      inAvailable: true,
      credit: card.credit,
    });
    expect(edited).toMatchObject({ name: 'Visa Gold', inAvailable: false });
    expect(store.getState().data.tables.account.find((a) => a.id === card.id)?.inAvailable).toBe(
      false,
    );
  });

  it('editing keeps its id, opening date, place and look', async () => {
    const { store, actions } = await setup();
    const before = store.getState().data.tables.account.find((a) => a.id === SAVINGS)!;
    const edited = await actions.saveAccount({
      id: SAVINGS,
      name: 'Rainy day',
      kind: 'savings',
      last4: '1234',
      openingBalance: 5_500_00,
      credit: null,
    });
    expect(edited).toEqual({
      ...before,
      name: 'Rainy day',
      last4: '1234',
      openingBalance: 5_500_00,
      updatedAt: expect.any(String),
    });
    expect(store.getState().data.tables.account.map((a) => a.id)).toEqual([MAIN, SAVINGS]);
  });
});

describe('deleteAccount', () => {
  /** Visa pays two subscriptions (one cancelled); Main account pays a third. */
  async function withSubscriptions() {
    const t = await setup();
    await t.store.getState().putMany([
      { table: 'account', record: makeCard({ id: 'card-x' }) },
      {
        table: 'subscription',
        record: makeSubscription({ id: 'sub-gym', accountId: 'card-x', nextRenewal: '2026-11-05' }),
      },
      {
        table: 'subscription',
        record: makeSubscription({
          id: 'sub-old',
          accountId: 'card-x',
          nextRenewal: '2026-11-05',
          status: 'cancelled',
        }),
      },
      {
        table: 'subscription',
        record: makeSubscription({ id: 'sub-main', accountId: MAIN, nextRenewal: '2026-11-05' }),
      },
    ]);
    return t;
  }
  const paidWith = (data: DataSnapshot) => data.tables.subscription.map((s) => [s.id, s.accountId]);

  it('moves its subscriptions and deletes one without history, in one write', async () => {
    const { store, actions } = await withSubscriptions();
    const putMany = vi.spyOn(store.getState(), 'putMany');
    expect(await actions.deleteAccount('card-x', { moveSubscriptionsTo: SAVINGS })).toBe('deleted');
    const data = store.getState().data;
    expect(data.tables.account.map((a) => a.id)).toEqual([MAIN, SAVINGS]);
    expect(paidWith(data)).toEqual([
      ['sub-gym', SAVINGS],
      ['sub-old', SAVINGS],
      ['sub-main', MAIN],
    ]);
    for (const s of data.tables.subscription)
      expect(SubscriptionSchema.safeParse(s).success).toBe(true);
    expect(putMany).toHaveBeenCalledTimes(1);
    expect(putMany.mock.calls[0]![1]).toEqual([{ table: 'account', id: 'card-x' }]);
  });

  it('archives one with history: past expenses keep its name and nothing they paid changes', async () => {
    const { store, actions } = await withSubscriptions();
    await store
      .getState()
      .put('expense', makeExpense({ id: 'e1', accountId: 'card-x', date: '2026-10-02' }));
    const mainBefore = balanceOf(store.getState().data, MAIN);
    const putMany = vi.spyOn(store.getState(), 'putMany');
    expect(await actions.deleteAccount('card-x', { moveSubscriptionsTo: MAIN })).toBe('archived');
    const data = store.getState().data;
    expect(data.tables.account.map((a) => [a.id, a.archivedOn])).toEqual([
      [MAIN, undefined],
      [SAVINGS, undefined],
      ['card-x', TODAY],
    ]);
    expect(data.tables.expense.map((e) => [e.id, e.accountId])).toEqual([['e1', 'card-x']]);
    expect(paidWith(data)).toEqual([
      ['sub-gym', MAIN],
      ['sub-old', MAIN],
      ['sub-main', MAIN],
    ]);
    expect(balanceOf(data, MAIN)).toBe(mainBefore);
    expect(putMany).toHaveBeenCalledTimes(1);
    expect(putMany.mock.calls[0]![1] ?? []).toEqual([]);
  });

  it('refuses with no target when it pays subscriptions, and writes nothing', async () => {
    const { store, actions } = await withSubscriptions();
    await store
      .getState()
      .put('account', makeAccount({ id: 'acct-old', order: 5, archivedOn: '2026-10-02' }));
    const before = store.getState().data;
    await expect(actions.deleteAccount('card-x', { moveSubscriptionsTo: null })).rejects.toThrow(
      'Pick where its subscriptions go.',
    );
    // The account being deleted, one already archived, or one that is gone is no target either.
    for (const to of ['card-x', 'acct-old', 'acct-gone']) {
      await expect(
        actions.deleteAccount('card-x', { moveSubscriptionsTo: to }),
        to,
      ).rejects.toThrow('Pick where its subscriptions go.');
    }
    expect(store.getState().data).toBe(before);
  });

  it('needs no target when it pays no subscription', async () => {
    const { store, actions } = await setup();
    await store.getState().put('account', makeCard({ id: 'card-x' }));
    expect(await actions.deleteAccount('card-x', { moveSubscriptionsTo: null })).toBe('deleted');
    expect(store.getState().data.tables.account.map((a) => a.id)).toEqual([MAIN, SAVINGS]);
  });

  describe('deleting the default account moves the default', () => {
    const defaultOf = (store: Store) => store.getState().data.tables.settings[0]?.defaultAccountId;
    const wallet = makeAccount({ id: 'acct-cash', name: 'Wallet', kind: 'cash', order: 3 });

    it('to the first debit or cash account left, when it is archived, in the same write', async () => {
      const { store, actions } = await setup();
      await store.getState().put('account', wallet);
      await store.getState().put('expense', makeExpense({ accountId: MAIN, date: '2026-10-02' }));
      const putMany = vi.spyOn(store.getState(), 'putMany');
      expect(await actions.deleteAccount(MAIN, { moveSubscriptionsTo: null })).toBe('archived');
      // Savings comes first, but a new expense and a salary land on a debit or cash account.
      expect(defaultOf(store)).toBe('acct-cash');
      expect(putMany).toHaveBeenCalledTimes(1);
      expect(putMany.mock.calls[0]![0].map((i) => i.table).sort()).toEqual(['account', 'settings']);
    });

    it('when it is deleted too', async () => {
      const { store, actions } = await setup();
      await store.getState().put('account', wallet);
      expect(await actions.deleteAccount(MAIN, { moveSubscriptionsTo: null })).toBe('deleted');
      expect(defaultOf(store)).toBe('acct-cash');
    });

    it('to none when no debit or cash account is left', async () => {
      const { store, actions } = await setup();
      await actions.deleteAccount(MAIN, { moveSubscriptionsTo: null });
      expect(defaultOf(store)).toBeNull();
    });

    it('and leaves it alone when another account goes', async () => {
      const { store, actions } = await setup();
      await store.getState().put('account', wallet);
      const putMany = vi.spyOn(store.getState(), 'putMany');
      await actions.deleteAccount('acct-cash', { moveSubscriptionsTo: null });
      expect(defaultOf(store)).toBe(MAIN);
      expect(putMany.mock.calls[0]![0]).toEqual([]);
    });
  });
});

describe('moving money', () => {
  it('a transfer moves money between two accounts', async () => {
    const { store, actions } = await setup();
    const tx = await actions.transfer(MAIN, SAVINGS, 200_00, TODAY, 'Rainy day');
    const data = store.getState().data;
    expect(tx).toMatchObject({
      type: 'transfer',
      amount: 200_00,
      date: TODAY,
      fromAccountId: MAIN,
      toAccountId: SAVINGS,
      debtId: null,
      note: 'Rainy day',
    });
    expect(data.tables.transaction).toEqual([tx]);
    expect(balanceOf(data, MAIN)).toBe(800_00);
    expect(balanceOf(data, SAVINGS)).toBe(5_200_00);
  });

  it('transfer refuses a credit account and the same account twice', async () => {
    const { store, actions } = await setup();
    await store.getState().put('account', makeCard());
    await expect(actions.transfer(MAIN, MAIN, 10_00, TODAY, '')).rejects.toThrow(
      'Use two different accounts.',
    );
    await expect(actions.transfer('card-1', MAIN, 10_00, TODAY, '')).rejects.toThrow(
      'Only a bank account, cash or savings can pay.',
    );
    await expect(actions.transfer(MAIN, 'card-1', 10_00, TODAY, '')).rejects.toThrow(
      'Only a bank account, cash or savings can pay.',
    );
    await expect(actions.transfer(MAIN, SAVINGS, 10_00, '2026-10-15', '')).rejects.toThrow(
      'Use today or an earlier date.',
    );
    expect(store.getState().data.tables.transaction).toEqual([]);
  });

  it('contributing to a goal moves money between the accounts picked and raises the goal together', async () => {
    const { store, actions } = await setup();
    await store.getState().put('goal', makeGoal({ id: 'g1', name: 'Bike', current: 100_00 }));
    const putMany = vi.spyOn(store.getState(), 'putMany');
    await actions.contributeToGoal('g1', 50_00, TODAY, MAIN, SAVINGS);
    const data = store.getState().data;
    expect(data.tables.goal[0]?.current).toBe(150_00);
    expect(balanceOf(data, MAIN)).toBe(950_00);
    expect(balanceOf(data, SAVINGS)).toBe(5_050_00);
    expect(data.tables.transaction[0]).toMatchObject({
      type: 'transfer',
      fromAccountId: MAIN,
      toAccountId: SAVINGS,
      debtId: null,
      note: 'Goal: Bike',
    });
    expect(putMany).toHaveBeenCalledTimes(1);
  });

  it('a goal contribution refuses what a transfer refuses, and raises nothing', async () => {
    const { store, actions } = await setup();
    await store.getState().putMany([
      { table: 'goal', record: makeGoal({ id: 'g1', current: 100_00 }) },
      { table: 'account', record: makeCard() },
    ]);
    await expect(actions.contributeToGoal('g1', 50_00, TODAY, MAIN, MAIN)).rejects.toThrow(
      'Use two different accounts.',
    );
    await expect(actions.contributeToGoal('g1', 50_00, TODAY, 'card-1', SAVINGS)).rejects.toThrow(
      'Only a bank account, cash or savings can pay.',
    );
    const data = store.getState().data;
    expect(data.tables.goal[0]?.current).toBe(100_00);
    expect(data.tables.transaction).toEqual([]);
  });
});

describe('cards and loans', () => {
  it('payCard lowers what the card owes and what the source holds', async () => {
    const { store, actions } = await setup();
    await store.getState().put('account', makeCard({ openingBalance: 230_00 }));
    const payment = await actions.payCard('card-1', SAVINGS, 230_00, TODAY);
    const data = store.getState().data;
    expect(balanceOf(data, 'card-1')).toBe(0);
    expect(balanceOf(data, SAVINGS)).toBe(4_770_00);
    expect(balanceOf(data, MAIN)).toBe(1_000_00);
    expect(payment).toMatchObject({
      type: 'card_payment',
      amount: 230_00,
      fromAccountId: SAVINGS,
      toAccountId: 'card-1',
      debtId: null,
      note: 'Paid Visa',
    });
    expect(data.tables.transaction).toEqual([payment]);
  });

  it('payCard refuses to pay from a credit card, or to pay what is not one', async () => {
    const { store, actions } = await setup();
    await store.getState().putMany([
      { table: 'account', record: makeCard({ openingBalance: 230_00 }) },
      { table: 'account', record: makeCard({ id: 'card-2', name: 'Amex', order: 3 }) },
    ]);
    await expect(actions.payCard('card-1', 'card-2', 50_00, TODAY)).rejects.toThrow(
      'Only a bank account, cash or savings can pay.',
    );
    await expect(actions.payCard(SAVINGS, MAIN, 50_00, TODAY)).rejects.toThrow(
      'Pick a credit card to pay.',
    );
    await expect(actions.payCard('card-1', MAIN, 50_00, '2026-10-15')).rejects.toThrow(
      'Use today or an earlier date.',
    );
    expect(store.getState().data.tables.transaction).toEqual([]);
  });

  it('payDebt pays a loan from an account', async () => {
    const { store, actions } = await setup();
    await store.getState().put(
      'debt',
      makeDebt({
        id: 'loan',
        name: 'Car loan',
        openingBalance: 1_000_00,
        openingDate: '2026-10-01',
      }),
    );
    const payment = await actions.payDebt('loan', MAIN, 50_00, TODAY);
    const data = store.getState().data;
    expect(payment).toMatchObject({
      type: 'debt_payment',
      amount: 50_00,
      fromAccountId: MAIN,
      toAccountId: null,
      debtId: 'loan',
      note: 'Paid Car loan',
    });
    expect(debtBalance(data.tables.debt[0]!, data, TODAY)).toBe(950_00);
    expect(balanceOf(data, MAIN)).toBe(950_00);
  });

  it('payDebt refuses to pay a loan from a credit card', async () => {
    const { store, actions } = await setup();
    await store.getState().putMany([
      { table: 'debt', record: makeDebt({ id: 'loan' }) },
      { table: 'account', record: makeCard() },
    ]);
    await expect(actions.payDebt('loan', 'card-1', 50_00, TODAY)).rejects.toThrow(
      'Only a bank account, cash or savings can pay.',
    );
  });

  it('saveDebt saves a loan', async () => {
    const { store, actions } = await setup();
    const loan = await actions.saveDebt({
      name: 'Car loan',
      openingBalance: 8_000_00,
      interestRate: 6.5,
      minimumPayment: 200_00,
      creditLimit: null,
      statementDay: null,
      dueDay: 5,
      payInFull: false,
    });
    expect(loan).toMatchObject({ kind: 'loan', openingDate: TODAY, dueDay: 5 });
    expect(store.getState().data.tables.debt).toEqual([loan]);
  });

  it('deleteDebt archives a loan with payments and deletes one without', async () => {
    const { store, actions } = await setup();
    await store.getState().putMany([
      { table: 'debt', record: makeDebt({ id: 'paid' }) },
      { table: 'debt', record: makeDebt({ id: 'unpaid' }) },
    ]);
    await actions.payDebt('paid', MAIN, 50_00, TODAY);
    await actions.deleteDebt('paid');
    await actions.deleteDebt('unpaid');
    expect(store.getState().data.tables.debt.map((d) => [d.id, d.archivedOn])).toEqual([
      ['paid', TODAY],
    ]);
  });
});

describe('corrections', () => {
  it('set actual balance records only the difference, on the account', async () => {
    const { store, actions } = await setup();
    const adj = await actions.setActualBalance(MAIN, 1_012_34, TODAY);
    expect(adj).toMatchObject({
      type: 'adjustment',
      amount: 12_34,
      fromAccountId: null,
      toAccountId: MAIN,
      debtId: null,
    });
    expect(await actions.setActualBalance(MAIN, 1_012_34, TODAY)).toBeNull();
    const data = store.getState().data;
    expect(balanceOf(data, MAIN)).toBe(1_012_34);
    expect(balanceOf(data, SAVINGS)).toBe(5_000_00);
  });

  it('setActualBalance on a credit account changes what it owes by the delta', async () => {
    const { store, actions } = await setup();
    await store.getState().put('account', makeCard({ openingBalance: 230_00 }));
    const up = await actions.setActualBalance('card-1', 250_00, TODAY);
    expect(up).toMatchObject({ type: 'adjustment', amount: 20_00, toAccountId: 'card-1' });
    expect(balanceOf(store.getState().data, 'card-1')).toBe(250_00);
    const down = await actions.setActualBalance('card-1', 200_00, TODAY);
    expect(down).toMatchObject({ amount: -50_00, toAccountId: 'card-1' });
    const data = store.getState().data;
    expect(balanceOf(data, 'card-1')).toBe(200_00);
    expect(balanceOf(data, MAIN)).toBe(1_000_00);
  });

  it('deleting a subscription keeps its past charges', async () => {
    const { store, actions } = await setup();
    await store
      .getState()
      .put('subscription', makeSubscription({ id: 's1', nextRenewal: '2026-11-03' }));
    await store
      .getState()
      .put(
        'expense',
        makeExpense({ id: 'charge', subscriptionId: 's1', date: '2026-10-03', amount: 15_99 }),
      );
    const mainBefore = balanceOf(store.getState().data, MAIN);
    await actions.deleteSubscription('s1');
    const data = store.getState().data;
    expect(data.tables.subscription).toEqual([]);
    expect(data.tables.expense.map((e) => [e.id, e.subscriptionId])).toEqual([['charge', 's1']]);
    expect(balanceOf(data, MAIN)).toBe(mainBefore);
  });
});

describe('Salary freeze is gone', () => {
  it('has no action to add or delete a freeze', async () => {
    const { actions } = await setup();
    expect(actions).not.toHaveProperty('addFreeze');
    expect(actions).not.toHaveProperty('deleteFreeze');
  });
});

describe('onboarding', () => {
  it('completeOnboarding creates the accounts and the default', async () => {
    const t = await freshRealStore();
    const actions = createFinanceActions(t.store);
    const putMany = vi.spyOn(t.store.getState(), 'putMany');
    await actions.completeOnboarding({
      name: ' Alex ',
      currency: 'EUR',
      openingCash: 1_000_00,
      openingSavings: 5_000_00,
      salary: { monthlyAmount: 4_200_00, payDay: 25 },
      cards: [
        { name: ' Visa ', balance: 230_00, creditLimit: 2_000_00, dueDay: 21, payInFull: true },
        { name: 'Amex', balance: 0, creditLimit: null, dueDay: null, payInFull: false },
      ],
    });
    expect(putMany).toHaveBeenCalledTimes(1);
    const data = t.store.getState().data;
    expect(data.tables.profile[0]).toMatchObject({
      name: 'Alex',
      currency: 'EUR',
      openingDate: TODAY,
      salary: { monthlyAmount: 4_200_00, payDay: 25 },
    });
    expect(data.tables.profile[0]).not.toHaveProperty('openingCash');
    expect(data.tables.profile[0]?.onboardedAt).not.toBeNull();
    const [main, savings, visa, amex] = data.tables.account;
    expect(main).toMatchObject({
      id: MAIN,
      name: 'Main account',
      kind: 'debit',
      skin: 'midnight',
      openingBalance: 1_000_00,
      openingDate: TODAY,
      inAvailable: true,
      frozen: false,
      order: 0,
      credit: null,
    });
    expect(savings).toMatchObject({
      id: SAVINGS,
      name: 'Savings',
      kind: 'savings',
      skin: 'mint',
      openingBalance: 5_000_00,
      openingDate: TODAY,
      inAvailable: false,
      order: 1,
      credit: null,
    });
    expect(visa).toMatchObject({
      name: 'Visa',
      kind: 'credit',
      skin: 'violet',
      openingBalance: 230_00,
      openingDate: TODAY,
      inAvailable: false,
      order: 2,
      credit: {
        limit: 2_000_00,
        statementDay: null,
        dueDay: 21,
        payInFull: true,
        minimumPayment: 0,
        interestRate: 0,
      },
    });
    expect(amex).toMatchObject({
      name: 'Amex',
      order: 3,
      credit: { limit: null, dueDay: null, payInFull: false },
    });
    expect(new Set([MAIN, SAVINGS, visa!.id, amex!.id]).size).toBe(4);
    expect(data.tables.debt).toEqual([]);
    expect(data.tables.settings[0]?.defaultAccountId).toBe(MAIN);
  });
});

describe('subscriptions', () => {
  it('resuming a long-cancelled subscription skips the renewals missed while it was off', async () => {
    const { store, actions } = await setup();
    const sub = makeSubscription({
      id: 'sub-gym',
      name: 'Gym',
      nextRenewal: '2026-07-05',
      anchorDay: 5,
      status: 'cancelled',
    });
    await store.getState().put('subscription', sub);
    await actions.setSubscriptionStatus('sub-gym', 'active');
    await store.getState().sync();
    const data = store.getState().data;
    expect(data.tables.subscription.find((s) => s.id === 'sub-gym')?.nextRenewal).toBe(
      '2026-11-05',
    );
    expect(data.tables.expense.filter((e) => e.subscriptionId === 'sub-gym')).toEqual([]);
  });

  it('cancelling keeps the renewal date as it was', async () => {
    const { store, actions } = await setup();
    await store
      .getState()
      .put('subscription', makeSubscription({ id: 'sub-tv', nextRenewal: '2026-10-20' }));
    await actions.setSubscriptionStatus('sub-tv', 'cancelled');
    const sub = store.getState().data.tables.subscription.find((s) => s.id === 'sub-tv');
    expect(sub).toMatchObject({ status: 'cancelled', nextRenewal: '2026-10-20' });
  });

  it('stamps auditedAt when a subscription is audited and clears it when the mark is removed', async () => {
    const { store, actions } = await setup();
    await store
      .getState()
      .put('subscription', makeSubscription({ id: 'sub-tv', nextRenewal: '2026-10-20' }));
    const read = () => store.getState().data.tables.subscription.find((s) => s.id === 'sub-tv')!;
    expect(read().auditedAt).toBeNull();

    await actions.setSubscriptionAudit('sub-tv', 'keep');
    expect(read().audit).toBe('keep');
    const stamped = read().auditedAt;
    expect(stamped).toEqual(expect.any(String));
    expect(new Date(stamped!).toISOString()).toBe(stamped);

    await actions.setSubscriptionAudit('sub-tv', 'review');
    expect(read()).toMatchObject({ audit: 'review', auditedAt: expect.any(String) });

    await actions.setSubscriptionAudit('sub-tv', null);
    expect(read()).toMatchObject({ audit: null, auditedAt: null });
  });

  it('a new subscription starts un-audited on its account, and editing one keeps its audit stamp', async () => {
    const { store, actions } = await setup();
    const input = {
      name: 'Gym',
      amount: 30_00,
      cycle: 'monthly' as const,
      nextRenewal: '2026-11-05',
      category: 'health' as const,
      accountId: MAIN,
    };
    const created = await actions.saveSubscription(input);
    expect(created).toMatchObject({ auditedAt: null, accountId: MAIN });

    await actions.setSubscriptionAudit(created.id, 'cancel');
    const audited = store.getState().data.tables.subscription.find((s) => s.id === created.id)!;
    expect(audited.auditedAt).not.toBeNull();

    const edited = await actions.saveSubscription({
      ...input,
      id: created.id,
      amount: 35_00,
      accountId: SAVINGS,
    });
    expect(edited).toMatchObject({
      amount: 35_00,
      accountId: SAVINGS,
      audit: 'cancel',
      auditedAt: audited.auditedAt,
    });
  });
});

describe('changing the currency', () => {
  const quote = (price: number, fxRate: number | null) => ({
    price,
    previousClose: price - 1,
    fxRate,
    asOf: '2026-10-14T09:00:00.000Z',
  });

  async function withHoldings() {
    const t = await setup();
    await t.actions.addExpense({ ...lunch, amount: 1_200 });
    const ko = makeHolding({ id: 'ko', currency: 'USD', quote: quote(60, 1) });
    const vwrl = makeHolding({
      id: 'vwrl',
      symbol: 'VWRL',
      currency: 'EUR',
      quote: quote(100, 0.9),
    });
    // Priced by hand, in the profile's own currency: no quote, so nothing says what it trades in.
    const manual = makeHolding({ id: 'manual', manualPrice: 5, quote: null });
    // Priced by hand in another currency.
    const abroad = makeHolding({ id: 'abroad', currency: 'GBP', manualPrice: 3, quote: null });
    await t.store
      .getState()
      .putMany([ko, vwrl, manual, abroad].map((record) => ({ table: 'holding' as const, record })));
    return t;
  }
  const holding = (store: Store, id: string) =>
    store.getState().data.tables.holding.find((h) => h.id === id)!;

  it('relabels without converting: every amount keeps its number', async () => {
    const { store, actions } = await withHoldings();
    await actions.changeCurrency('EUR');
    const data = store.getState().data;
    expect(data.tables.profile[0]).toMatchObject({ currency: 'EUR' });
    expect(data.tables.account.map((a) => a.openingBalance)).toEqual([1_000_00, 5_000_00]);
    expect(data.tables.expense.map((e) => e.amount)).toEqual([1_200]);
    expect(holding(store, 'ko').costBasis).toBe(500_00);
  });

  it('clears the exchange rates, keeps prices, and writes the profile and holdings together', async () => {
    const { store, actions } = await withHoldings();
    const real = store.getState().putMany;
    const putMany = vi.fn(real);
    store.setState({ putMany });

    await actions.changeCurrency('EUR');

    expect(putMany).toHaveBeenCalledTimes(1);
    // The profile, then the three holdings that change; the one priced by hand abroad is not written.
    expect(putMany.mock.calls[0]![0].map((i) => i.table)).toEqual([
      'profile',
      'holding',
      'holding',
      'holding',
    ]);
    // Listed holdings keep the currency they trade in and lose only the rate.
    expect(holding(store, 'ko')).toMatchObject({ currency: 'USD', quote: quote(60, null) });
    expect(holding(store, 'vwrl').quote).toEqual(quote(100, null));
    const profile = store.getState().data.tables.profile[0]!;
    // A holding in the new currency needs no stored rate; one in another waits for the next refresh.
    expect(holdingRate(holding(store, 'vwrl'), profile.currency)).toBe(1);
    expect(holdingRate(holding(store, 'ko'), profile.currency)).toBeNull();
  });

  it('relabels a holding priced by hand in the old currency, so it stays in the totals', async () => {
    const { store, actions } = await withHoldings();
    expect(holdingValue(holding(store, 'manual'), 'USD')).toBe(50_00);
    const abroad = holding(store, 'abroad');

    await actions.changeCurrency('EUR');

    // Its price keeps its number, like every other amount.
    expect(holding(store, 'manual')).toMatchObject({
      currency: 'EUR',
      manualPrice: 5,
      quote: null,
    });
    expect(holdingValue(holding(store, 'manual'), 'EUR')).toBe(50_00);
    // A price in another currency is not the profile's to relabel.
    expect(holding(store, 'abroad')).toEqual(abroad);
  });

  it('writes nothing when the currency is the one already in use', async () => {
    const { store, actions } = await withHoldings();
    const real = store.getState().putMany;
    const putMany = vi.fn(real);
    store.setState({ putMany });
    await actions.changeCurrency('USD');
    expect(putMany).not.toHaveBeenCalled();
    expect(holding(store, 'ko').quote?.fxRate).toBe(1);
  });

  describe('with a currency chosen for Invest', () => {
    const rateTo = (currency: string) => ({
      currency,
      rate: 0.9,
      asOf: '2026-10-14T09:00:00.000Z',
    });
    const settingsOf = (store: Store) => store.getState().data.tables.settings[0]!;

    it('drops the rate, which was for the old profile currency, and keeps the choice', async () => {
      const { store, actions } = await withHoldings();
      await store
        .getState()
        .put('settings', { ...settingsOf(store), investCurrency: 'GBP', investFx: rateTo('GBP') });
      await actions.changeCurrency('EUR');
      expect(settingsOf(store)).toMatchObject({ investCurrency: 'GBP', investFx: null });
    });

    it('goes back to the profile currency when the new one is what Invest was shown in', async () => {
      const { store, actions } = await withHoldings();
      await store
        .getState()
        .put('settings', { ...settingsOf(store), investCurrency: 'EUR', investFx: rateTo('EUR') });
      await actions.changeCurrency('EUR');
      expect(settingsOf(store)).toMatchObject({ investCurrency: null, investFx: null });
    });
  });

  it('is the only way to change it: updateProfile takes no currency', () => {
    expectTypeOf<
      Parameters<ReturnType<typeof createFinanceActions>['updateProfile']>[0]
    >().not.toHaveProperty('currency');
  });

  it('refuses a currency with other decimals, and writes nothing', async () => {
    const { store, actions } = await withHoldings();
    await expect(actions.changeCurrency('JPY')).rejects.toThrow(/decimals/);
    expect(store.getState().data.tables.profile[0]?.currency).toBe('USD');
    expect(holding(store, 'ko').quote?.fxRate).toBe(1);
  });
});

describe('expected salary that never arrives', () => {
  async function paidOnThe5th() {
    const t = await setup();
    await t.actions.updateProfile({ salary: { monthlyAmount: 3_100_00, payDay: 5 } });
    return t;
  }

  it('a salary set today only expects pay days after today', async () => {
    const { store } = await paidOnThe5th();
    await store.getState().sync();
    expect(store.getState().data.tables.income).toEqual([]);
    expect(store.getState().data.tables.profile[0]?.salary).toMatchObject({ since: TODAY });
  });

  it('marking it as not arrived keeps it out of balances and the banner, for good', async () => {
    const { store, actions } = await setup();
    // An October pay day already passed before today, from the original salary.
    await store.getState().put('profile', {
      ...makeProfile({ openingDate: '2026-10-01' }),
      salary: { monthlyAmount: 3_100_00, payDay: 5 },
    });
    await store.getState().sync();
    // It is expected on the default account.
    expect(store.getState().data.tables.income.map((i) => [i.id, i.status, i.accountId])).toEqual([
      ['salary-2026-10', 'expected', MAIN],
    ]);
    await actions.deleteIncome('salary-2026-10');
    await store.getState().sync();
    expect(store.getState().data.tables.income.map((i) => [i.id, i.status])).toEqual([
      ['salary-2026-10', 'skipped'],
    ]);
    await actions.skipIncome('salary-2026-10');
    const late = await actions.addIncome({
      amount: 3_000_00,
      source: 'salary',
      label: 'Salary',
      date: TODAY,
      accountId: MAIN,
      note: '',
    });
    // It came after all: the skipped month is confirmed rather than doubled.
    expect(late.id).toBe('salary-2026-10');
    expect(store.getState().data.tables.income).toHaveLength(1);
  });
});

describe('switching kind', () => {
  const asDebit = {
    id: 'card-1',
    name: 'Visa',
    kind: 'debit' as const,
    last4: null,
    openingBalance: 0,
    credit: null,
  };

  it("a card with history can't switch between credit and debit, and nothing is written", async () => {
    const { store, actions } = await setup();
    await store.getState().putMany([
      { table: 'account', record: makeCard() },
      { table: 'expense', record: makeExpense({ accountId: 'card-1', date: '2026-10-02' }) },
      { table: 'expense', record: makeExpense({ accountId: MAIN, date: '2026-10-02' }) },
    ]);
    const before = store.getState().data;
    await expect(actions.saveAccount(asDebit)).rejects.toThrow(
      "A card with history can't switch between credit and debit.",
    );
    await expect(
      actions.saveAccount({
        id: MAIN,
        name: 'Main account',
        kind: 'credit',
        last4: null,
        openingBalance: 1_000_00,
        credit: terms(),
      }),
    ).rejects.toThrow("A card with history can't switch between credit and debit.");
    expect(store.getState().data).toBe(before);
  });

  it("without history, a card can become a bank account and back, taking the new kind's look", async () => {
    const { store, actions } = await setup();
    await store.getState().put('account', makeCard());
    expect(await actions.saveAccount(asDebit)).toMatchObject({
      id: 'card-1',
      kind: 'debit',
      skin: 'midnight',
      inAvailable: true,
      credit: null,
    });
    expect(
      await actions.saveAccount({ ...asDebit, kind: 'credit', credit: terms() }),
    ).toMatchObject({ id: 'card-1', kind: 'credit', skin: 'violet', inAvailable: false });
  });

  it("with history, a bank account can become savings or cash, taking the new kind's look where the input leaves it out", async () => {
    const { store, actions } = await setup();
    await store.getState().put('expense', makeExpense({ accountId: MAIN, date: '2026-10-02' }));
    const main = {
      id: MAIN,
      name: 'Main account',
      last4: null,
      openingBalance: 1_000_00,
      credit: null,
    };
    expect(await actions.saveAccount({ ...main, kind: 'savings' })).toMatchObject({
      kind: 'savings',
      skin: 'mint',
      inAvailable: false,
    });
    // What the input gives is kept.
    expect(
      await actions.saveAccount({ ...main, kind: 'cash', skin: 'ocean', inAvailable: false }),
    ).toMatchObject({ kind: 'cash', skin: 'ocean', inAvailable: false });
    expect(await actions.saveAccount({ ...main, kind: 'debit' })).toMatchObject({
      kind: 'debit',
      skin: 'midnight',
      inAvailable: true,
    });
  });
});

describe('deleteAccount: expected incomes and archived accounts', () => {
  const wallet = makeAccount({ id: 'acct-cash', name: 'Wallet', kind: 'cash', order: 3 });
  const expectedSalary = makeIncome({
    id: 'salary-2026-10',
    amount: 3_100_00,
    date: '2026-10-05',
    status: 'expected',
    accountId: MAIN,
    period: '2026-10',
  });
  const incomeOn = (store: Store) =>
    store.getState().data.tables.income.map((i) => [i.id, i.status, i.accountId]);

  it('moves the incomes still expected on it to the new default, in the same write', async () => {
    const { store, actions } = await setup();
    await store.getState().putMany([
      { table: 'account', record: wallet },
      { table: 'income', record: expectedSalary },
    ]);
    const putMany = vi.spyOn(store.getState(), 'putMany');
    // An expected income has not counted yet: it is no history that keeps the account.
    expect(await actions.deleteAccount(MAIN, { moveSubscriptionsTo: null })).toBe('deleted');
    expect(incomeOn(store)).toEqual([['salary-2026-10', 'expected', 'acct-cash']]);
    expect(store.getState().data.tables.settings[0]?.defaultAccountId).toBe('acct-cash');
    expect(putMany).toHaveBeenCalledTimes(1);
    expect(putMany.mock.calls[0]![0].map((i) => i.table).sort()).toEqual(['income', 'settings']);
    expect(putMany.mock.calls[0]![1]).toEqual([{ table: 'account', id: MAIN }]);
  });

  it('leaves the confirmed ones, which keep it archived', async () => {
    const { store, actions } = await setup();
    const paid = makeIncome({ id: 'bonus', source: 'extra', period: null, date: '2026-10-03' });
    await store.getState().putMany([
      { table: 'account', record: wallet },
      { table: 'income', record: expectedSalary },
      { table: 'income', record: paid },
    ]);
    expect(await actions.deleteAccount(MAIN, { moveSubscriptionsTo: null })).toBe('archived');
    expect(incomeOn(store)).toEqual([
      ['salary-2026-10', 'expected', 'acct-cash'],
      ['bonus', 'confirmed', MAIN],
    ]);
  });

  it('moves them to the default when another account goes', async () => {
    const { store, actions } = await setup();
    const gift = makeIncome({
      id: 'gift',
      source: 'extra',
      period: null,
      date: '2026-10-10',
      status: 'expected',
      accountId: SAVINGS,
    });
    await store.getState().put('income', gift);
    expect(await actions.deleteAccount(SAVINGS, { moveSubscriptionsTo: null })).toBe('deleted');
    expect(incomeOn(store)).toEqual([['gift', 'expected', MAIN]]);
    expect(store.getState().data.tables.settings[0]?.defaultAccountId).toBe(MAIN);
  });

  it('leaves them where they are when no default is left, so the account is archived', async () => {
    const { store, actions } = await setup();
    await store.getState().put('income', expectedSalary);
    expect(await actions.deleteAccount(MAIN, { moveSubscriptionsTo: null })).toBe('archived');
    expect(incomeOn(store)).toEqual([['salary-2026-10', 'expected', MAIN]]);
    expect(store.getState().data.tables.settings[0]?.defaultAccountId).toBeNull();
  });

  it('keeps the day an account was archived on when it is deleted again', async () => {
    const { store, actions } = await setup();
    await store.getState().putMany([
      {
        table: 'account',
        record: makeAccount({ id: 'acct-old', order: 5, archivedOn: '2026-10-02' }),
      },
      { table: 'expense', record: makeExpense({ accountId: 'acct-old', date: '2026-10-01' }) },
    ]);
    expect(await actions.deleteAccount('acct-old', { moveSubscriptionsTo: null })).toBe('archived');
    expect(store.getState().data.tables.account.find((a) => a.id === 'acct-old')?.archivedOn).toBe(
      '2026-10-02',
    );
  });
});

describe('money only lands on accounts in use', () => {
  const ARCHIVED = 'That account is no longer in use.';
  const UNKNOWN = "That account doesn't exist.";
  const NOT_CREDIT = 'Income goes into a bank account, cash or savings.';
  const OLD = 'acct-old';
  const GONE = 'acct-gone';

  /** Adds an account and a card both archived on Oct 2, a card in use, a goal and a loan. */
  async function withArchived() {
    const t = await setup();
    await t.store.getState().putMany([
      {
        table: 'account',
        record: makeAccount({
          id: OLD,
          name: 'Old bank',
          order: 5,
          openingDate: '2026-10-01',
          archivedOn: '2026-10-02',
        }),
      },
      { table: 'account', record: makeCard({ openingBalance: 230_00 }) },
      {
        table: 'account',
        record: makeCard({ id: 'card-old', name: 'Old Visa', order: 6, archivedOn: '2026-10-02' }),
      },
      { table: 'goal', record: makeGoal({ id: 'g1', current: 100_00 }) },
      {
        table: 'debt',
        record: makeDebt({ id: 'loan', openingBalance: 1_000_00, openingDate: '2026-10-01' }),
      },
    ]);
    return t;
  }

  /** Each call is refused with its message, and nothing is written. */
  async function refuses(store: Store, calls: Array<[string, () => Promise<unknown>]>) {
    const before = store.getState().data;
    for (const [message, call] of calls) await expect(call(), message).rejects.toThrow(message);
    expect(store.getState().data).toBe(before);
  }

  it('addExpense', async () => {
    const { store, actions } = await withArchived();
    await refuses(store, [
      [ARCHIVED, () => actions.addExpense({ ...lunch, accountId: OLD })],
      [ARCHIVED, () => actions.addExpense({ ...lunch, accountId: 'card-old', repeat: 'monthly' })],
      [UNKNOWN, () => actions.addExpense({ ...lunch, accountId: GONE })],
    ]);
  });

  it('updateExpense, when it moves the expense to another account', async () => {
    const { store, actions } = await withArchived();
    const { expense } = await actions.addExpense(lunch);
    await refuses(store, [
      [ARCHIVED, () => actions.updateExpense(expense.id, { accountId: OLD })],
      [UNKNOWN, () => actions.updateExpense(expense.id, { note: 'x', accountId: GONE })],
    ]);
    // An expense kept on an archived account, as its history, can still be edited.
    const old = makeExpense({ id: 'old', accountId: OLD, date: '2026-10-01' });
    await store.getState().put('expense', old);
    await actions.updateExpense('old', { note: 'Groceries', accountId: OLD });
    expect(store.getState().data.tables.expense.find((e) => e.id === 'old')).toMatchObject({
      note: 'Groceries',
      accountId: OLD,
    });
  });

  it('saveSubscription', async () => {
    const { store, actions } = await withArchived();
    const gym = {
      name: 'Gym',
      amount: 30_00,
      cycle: 'monthly' as const,
      nextRenewal: '2026-11-05',
      category: 'health' as const,
      accountId: MAIN,
    };
    const saved = await actions.saveSubscription(gym);
    await refuses(store, [
      [ARCHIVED, () => actions.saveSubscription({ ...gym, accountId: OLD })],
      [UNKNOWN, () => actions.saveSubscription({ ...gym, id: saved.id, accountId: GONE })],
    ]);
  });

  it('saveSubscription checks the account only when an edit changes it', async () => {
    const { store, actions } = await withArchived();
    const gym = {
      name: 'Gym',
      amount: 30_00,
      cycle: 'monthly' as const,
      nextRenewal: '2026-11-05',
      category: 'health' as const,
      accountId: OLD,
    };
    // Kept on an archived account as it was (an account whose subscriptions did not move), it
    // can still be edited.
    await store
      .getState()
      .put('subscription', makeSubscription({ id: 'sub-old', ...gym, anchorDay: 5 }));
    await actions.saveSubscription({ ...gym, id: 'sub-old', amount: 35_00, name: 'Gym plus' });
    expect(store.getState().data.tables.subscription.find((s) => s.id === 'sub-old')).toMatchObject(
      { name: 'Gym plus', amount: 35_00, accountId: OLD },
    );

    // Moving it is checked, to an archived account or an unknown one, and a new one always is.
    await refuses(store, [
      [ARCHIVED, () => actions.saveSubscription({ ...gym, id: 'sub-old', accountId: 'card-old' })],
      [UNKNOWN, () => actions.saveSubscription({ ...gym, id: 'sub-old', accountId: GONE })],
      [ARCHIVED, () => actions.saveSubscription(gym)],
    ]);
    // Moving it to an account in use is fine.
    await actions.saveSubscription({ ...gym, id: 'sub-old', accountId: SAVINGS });
    expect(
      store.getState().data.tables.subscription.find((s) => s.id === 'sub-old')?.accountId,
    ).toBe(SAVINGS);
  });

  it('transfer and contributeToGoal, on both sides', async () => {
    const { store, actions } = await withArchived();
    await refuses(store, [
      [ARCHIVED, () => actions.transfer(OLD, SAVINGS, 10_00, TODAY, '')],
      [ARCHIVED, () => actions.transfer(MAIN, OLD, 10_00, TODAY, '')],
      [UNKNOWN, () => actions.transfer(GONE, SAVINGS, 10_00, TODAY, '')],
      [UNKNOWN, () => actions.transfer(MAIN, GONE, 10_00, TODAY, '')],
      [ARCHIVED, () => actions.contributeToGoal('g1', 10_00, TODAY, OLD, SAVINGS)],
      [UNKNOWN, () => actions.contributeToGoal('g1', 10_00, TODAY, MAIN, GONE)],
    ]);
  });

  it('payCard, for the card and what pays it', async () => {
    const { store, actions } = await withArchived();
    await refuses(store, [
      [ARCHIVED, () => actions.payCard('card-old', MAIN, 10_00, TODAY)],
      [ARCHIVED, () => actions.payCard('card-1', OLD, 10_00, TODAY)],
      [UNKNOWN, () => actions.payCard('card-gone', MAIN, 10_00, TODAY)],
      [UNKNOWN, () => actions.payCard('card-1', GONE, 10_00, TODAY)],
    ]);
  });

  it('payDebt, for what pays it', async () => {
    const { store, actions } = await withArchived();
    await refuses(store, [
      [ARCHIVED, () => actions.payDebt('loan', OLD, 10_00, TODAY)],
      [UNKNOWN, () => actions.payDebt('loan', GONE, 10_00, TODAY)],
    ]);
  });

  it('setActualBalance', async () => {
    const { store, actions } = await withArchived();
    await refuses(store, [
      [ARCHIVED, () => actions.setActualBalance(OLD, 10_00, TODAY)],
      [ARCHIVED, () => actions.setActualBalance('card-old', 10_00, TODAY)],
      [UNKNOWN, () => actions.setActualBalance(GONE, 10_00, TODAY)],
    ]);
  });

  it('addIncome refuses a credit card too', async () => {
    const { store, actions } = await withArchived();
    const gift = {
      amount: 100_00,
      source: 'extra' as const,
      label: 'Gift',
      date: TODAY,
      note: '',
    };
    await refuses(store, [
      [NOT_CREDIT, () => actions.addIncome({ ...gift, accountId: 'card-1' })],
      [ARCHIVED, () => actions.addIncome({ ...gift, accountId: OLD })],
      [UNKNOWN, () => actions.addIncome({ ...gift, accountId: GONE })],
    ]);
  });

  it('confirmIncome refuses the credit card an expected income names', async () => {
    const { store, actions } = await withArchived();
    await store.getState().put(
      'income',
      makeIncome({
        id: 'on-card',
        source: 'extra',
        period: null,
        date: '2026-10-10',
        status: 'expected',
        accountId: 'card-1',
      }),
    );
    await refuses(store, [[NOT_CREDIT, () => actions.confirmIncome('on-card', 120_00)]]);
    expect(store.getState().data.tables.income[0]).toMatchObject({
      status: 'expected',
      amount: 420_000,
    });
  });

  it('confirmIncome lands an income left on an archived account on the account picked', async () => {
    const { store, actions } = await withArchived();
    await store.getState().put(
      'income',
      makeIncome({
        id: 'on-old',
        period: '2026-10',
        date: '2026-10-10',
        status: 'expected',
        accountId: OLD,
      }),
    );
    await refuses(store, [
      [ARCHIVED, () => actions.confirmIncome('on-old', 4_200_00)],
      [NOT_CREDIT, () => actions.confirmIncome('on-old', 4_200_00, 'card-1')],
      [UNKNOWN, () => actions.confirmIncome('on-old', 4_200_00, GONE)],
    ]);
    const before = balanceOf(store.getState().data, SAVINGS);
    await actions.confirmIncome('on-old', 4_100_00, SAVINGS);
    const data = store.getState().data;
    expect(data.tables.income.find((i) => i.id === 'on-old')).toMatchObject({
      status: 'confirmed',
      amount: 4_100_00,
      accountId: SAVINGS,
    });
    expect(balanceOf(data, SAVINGS)).toBe(before + 4_100_00);
  });
});

describe('freezing an account', () => {
  const FROZEN = 'That card is frozen. Unfreeze it to use it.';
  const GONE = "That account doesn't exist.";
  const ARCHIVED = 'That account is no longer in use.';
  const gym = {
    name: 'Gym',
    amount: 30_00,
    cycle: 'monthly' as const,
    nextRenewal: '2026-11-05',
    category: 'health' as const,
    accountId: 'card-1',
  };

  /** Main account and Savings as `setup` makes them, and a Visa owing 230.00, frozen. */
  async function withFrozenCard() {
    const t = await setup();
    await t.store.getState().put('account', makeCard({ openingBalance: 230_00, frozen: true }));
    return t;
  }

  /** Each call is refused with its message, and nothing is written. */
  async function refuses(store: Store, calls: Array<[string, () => Promise<unknown>]>) {
    const before = store.getState().data;
    for (const [message, call] of calls) await expect(call(), message).rejects.toThrow(message);
    expect(store.getState().data).toBe(before);
  }

  it('setAccountFrozen freezes an account and unfreezes it, changing nothing else about it', async () => {
    const { store, actions } = await setup();
    await store.getState().put('account', makeCard({ openingBalance: 230_00 }));
    const before = store.getState().data.tables.account.find((a) => a.id === 'card-1')!;
    const frozen = await actions.setAccountFrozen('card-1', true);
    expect(frozen).toEqual({ ...before, frozen: true, updatedAt: frozen.updatedAt });
    expect(store.getState().data.tables.account.find((a) => a.id === 'card-1')).toEqual(frozen);
    const thawed = await actions.setAccountFrozen('card-1', false);
    expect(thawed).toEqual({ ...before, frozen: false, updatedAt: thawed.updatedAt });
    expect(store.getState().data.tables.account.find((a) => a.id === 'card-1')?.frozen).toBe(false);
  });

  it('setAccountFrozen writes nothing when the account already is as asked', async () => {
    const { store, actions } = await withFrozenCard();
    const before = store.getState().data;
    await actions.setAccountFrozen('card-1', true);
    await actions.setAccountFrozen(MAIN, false);
    expect(store.getState().data).toBe(before);
  });

  it('setAccountFrozen refuses an account that is gone or archived', async () => {
    const { store, actions } = await setup();
    await store.getState().put('account', makeCard({ archivedOn: '2026-10-02' }));
    await refuses(store, [
      [GONE, () => actions.setAccountFrozen('acct-gone', true)],
      [ARCHIVED, () => actions.setAccountFrozen('card-1', true)],
    ]);
  });

  it('a frozen account takes no expense, a repeating one included, and nothing is written', async () => {
    const { store, actions } = await withFrozenCard();
    await refuses(store, [
      [FROZEN, () => actions.addExpense({ ...lunch, accountId: 'card-1' })],
      [FROZEN, () => actions.addExpense({ ...lunch, accountId: 'card-1', repeat: 'monthly' })],
    ]);
    expect(store.getState().data.tables.expense).toEqual([]);
    expect(store.getState().data.tables.subscription).toEqual([]);
  });

  it('takes expenses again once it is unfrozen, and what it owes goes up', async () => {
    const { store, actions } = await withFrozenCard();
    await actions.setAccountFrozen('card-1', false);
    await actions.addExpense({ ...lunch, accountId: 'card-1' });
    expect(balanceOf(store.getState().data, 'card-1')).toBe(230_00 + 12_50);
  });

  it('freezing a bank account stops expenses from it too, and not the money coming in or going out', async () => {
    const { store, actions } = await setup();
    await actions.setAccountFrozen(MAIN, true);
    await refuses(store, [[FROZEN, () => actions.addExpense(lunch)]]);
    await actions.addIncome({
      amount: 50_00,
      source: 'extra',
      label: 'Gift',
      date: TODAY,
      accountId: MAIN,
      note: '',
    });
    await actions.transfer(MAIN, SAVINGS, 10_00, TODAY, '');
    expect(balanceOf(store.getState().data, MAIN)).toBe(1_000_00 + 50_00 - 10_00);
  });

  it('updateExpense will not move an expense onto a frozen account, but edits one already there', async () => {
    const { store, actions } = await withFrozenCard();
    const { expense } = await actions.addExpense(lunch);
    await refuses(store, [
      [FROZEN, () => actions.updateExpense(expense.id, { accountId: 'card-1' })],
    ]);
    // An expense on an account frozen since can still be edited, and moved off it.
    const old = makeExpense({ id: 'old', accountId: 'card-1', date: '2026-10-01' });
    await store.getState().put('expense', old);
    await actions.updateExpense('old', { note: 'Groceries', amount: 20_00, accountId: 'card-1' });
    expect(store.getState().data.tables.expense.find((e) => e.id === 'old')).toMatchObject({
      note: 'Groceries',
      amount: 20_00,
      accountId: 'card-1',
    });
    await actions.updateExpense('old', { accountId: SAVINGS });
    expect(store.getState().data.tables.expense.find((e) => e.id === 'old')?.accountId).toBe(
      SAVINGS,
    );
  });

  it('saveSubscription will not put a new or moved subscription on a frozen account, but edits one already there', async () => {
    const { store, actions } = await withFrozenCard();
    const saved = await actions.saveSubscription({ ...gym, accountId: MAIN });
    await refuses(store, [
      [FROZEN, () => actions.saveSubscription(gym)],
      [FROZEN, () => actions.saveSubscription({ ...gym, id: saved.id })],
    ]);
    await store
      .getState()
      .put('subscription', makeSubscription({ id: 'sub-old', ...gym, anchorDay: 5 }));
    await actions.saveSubscription({ ...gym, id: 'sub-old', amount: 35_00 });
    expect(store.getState().data.tables.subscription.find((s) => s.id === 'sub-old')).toMatchObject(
      { amount: 35_00, accountId: 'card-1' },
    );
  });

  it('a subscription on a frozen account still renews on it', async () => {
    const { store } = await withFrozenCard();
    await store
      .getState()
      .put(
        'subscription',
        makeSubscription({ id: 'sub-gym', accountId: 'card-1', amount: 30_00, nextRenewal: TODAY }),
      );
    await store.getState().sync();
    const data = store.getState().data;
    expect(data.tables.expense.map((e) => [e.subscriptionId, e.accountId, e.amount])).toEqual([
      ['sub-gym', 'card-1', 30_00],
    ]);
    expect(balanceOf(data, 'card-1')).toBe(230_00 + 30_00);
  });
});
