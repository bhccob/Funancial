import { describe, expect, it } from 'vitest';
import { bucketBalances, debtBalance } from '@/domain/balances';
import { freshRealStore } from '@/test/realStore';
import {
  makeDebt,
  makeExpense,
  makeGoal,
  makeLimit,
  makeProfile,
  makeSubscription,
} from '@/test/fixtures';
import { createFinanceActions } from './financeActions';

async function setup() {
  const t = await freshRealStore();
  await t.store
    .getState()
    .put(
      'profile',
      makeProfile({
        openingDate: '2026-10-01',
        openingCash: 1_000_00,
        openingSavings: 5_000_00,
        salary: { monthlyAmount: 3_100_00, payDay: 25 },
      }),
    );
  return { ...t, actions: createFinanceActions(t.store) };
}

const lunch = {
  amount: 12_50,
  category: 'food' as const,
  date: '2026-10-14',
  note: 'Lunch',
  paymentMethod: 'cash' as const,
  cardId: null,
  repeat: null,
};

describe('expenses', () => {
  it('adds an expense and reports limit alerts', async () => {
    const { store, actions } = await setup();
    await store
      .getState()
      .put(
        'budgetLimit',
        makeLimit({ id: 'food', category: 'food', period: 'weekly', amount: 20_00 }),
      );
    const { expense, alerts } = await actions.addExpense({ ...lunch, amount: 17_00 });
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual([expense.id]);
    expect(alerts.map((a) => [a.limit.id, a.level])).toEqual([['food', 'warn']]);
  });

  it('a repeating expense becomes a subscription with the next renewal one cycle later', async () => {
    const { store, actions } = await setup();
    const { expense } = await actions.addExpense({
      ...lunch,
      amount: 1_200_00,
      category: 'rent',
      note: 'Rent',
      date: '2026-10-01',
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
    });
    expect(expense.subscriptionId).toBe(sub!.id);
  });

  it('refuses a future date', async () => {
    const { actions } = await setup();
    await expect(actions.addExpense({ ...lunch, date: '2026-10-15' })).rejects.toThrow(
      'Use today or an earlier date.',
    );
  });

  it('updates and deletes', async () => {
    const { store, actions } = await setup();
    const { expense } = await actions.addExpense(lunch);
    await actions.updateExpense(expense.id, { amount: 13_00, note: 'Lunch + tip' });
    expect(store.getState().data.tables.expense[0]).toMatchObject({
      amount: 13_00,
      note: 'Lunch + tip',
    });
    await actions.deleteExpense(expense.id);
    expect(store.getState().data.tables.expense).toEqual([]);
  });
});

describe('income', () => {
  it('a manual salary entry confirms the expected one instead of duplicating it', async () => {
    const { store, actions } = await setup();
    await store.getState().put('income', {
      id: 'salary-2026-10',
      createdAt: '2026-10-14T12:00:00.000Z',
      updatedAt: '2026-10-14T12:00:00.000Z',
      amount: 3_100_00,
      source: 'salary',
      label: 'Salary',
      date: '2026-10-25',
      status: 'expected',
      bucket: 'cash',
      recurrence: null,
      period: '2026-10',
      note: '',
    });
    await actions.addIncome({
      amount: 3_050_00,
      source: 'salary',
      label: 'Salary',
      date: '2026-10-14',
      bucket: 'cash',
      note: '',
    });
    expect(store.getState().data.tables.income.map((i) => [i.id, i.status, i.amount])).toEqual([
      ['salary-2026-10', 'confirmed', 3_050_00],
    ]);
  });

  it('confirms an expected income with the received amount', async () => {
    const { store, actions } = await setup();
    const income = await actions.addIncome({
      amount: 100_00,
      source: 'extra',
      label: 'Gift',
      date: '2026-10-14',
      bucket: 'savings',
      note: '',
    });
    expect(income).toMatchObject({ status: 'confirmed', period: null });
    await store.getState().put('income', { ...income, status: 'expected' });
    await actions.confirmIncome(income.id, 120_00);
    expect(store.getState().data.tables.income[0]).toMatchObject({
      status: 'confirmed',
      amount: 120_00,
    });
  });
});

describe('goals, debts and corrections', () => {
  it('contributing to a goal moves cash to savings and raises the goal together', async () => {
    const { store, actions } = await setup();
    await store.getState().put('goal', makeGoal({ id: 'g1', name: 'Bike', current: 100_00 }));
    await actions.contributeToGoal('g1', 50_00, '2026-10-14');
    const data = store.getState().data;
    expect(data.tables.goal[0]?.current).toBe(150_00);
    expect(bucketBalances(data, '2026-10-14')).toMatchObject({ cash: 950_00, savings: 5_050_00 });
    expect(data.tables.transaction[0]).toMatchObject({
      type: 'transfer',
      from: 'cash',
      to: 'savings',
      note: 'Goal: Bike',
    });
  });

  it('paying a card lowers the card and cash', async () => {
    const { store, actions } = await setup();
    await store
      .getState()
      .put('debt', makeDebt({ id: 'card-1', openingBalance: 230_00, openingDate: '2026-10-01' }));
    await actions.payDebt('card-1', 230_00, 'cash', '2026-10-14');
    const data = store.getState().data;
    expect(debtBalance(data.tables.debt[0]!, data, '2026-10-14')).toBe(0);
    expect(bucketBalances(data, '2026-10-14').cash).toBe(770_00);
    expect(data.tables.transaction[0]?.type).toBe('card_payment');
  });

  it('refuses to delete a card with history, but deletes one without', async () => {
    const { store, actions } = await setup();
    await store.getState().put('debt', makeDebt({ id: 'used', openingDate: '2026-10-01' }));
    await store.getState().put('debt', makeDebt({ id: 'unused', openingDate: '2026-10-01' }));
    await store
      .getState()
      .put(
        'expense',
        makeExpense({ paymentMethod: 'credit_card', cardId: 'used', date: '2026-10-02' }),
      );
    await expect(actions.deleteDebt('used')).rejects.toThrow(
      'This card or loan has history. Delete its expenses and payments first, or keep it.',
    );
    await actions.deleteDebt('unused');
    expect(store.getState().data.tables.debt.map((d) => d.id)).toEqual(['used']);
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
    const cashBefore = bucketBalances(store.getState().data, '2026-10-14').cash;
    await actions.deleteSubscription('s1');
    const data = store.getState().data;
    expect(data.tables.subscription).toEqual([]);
    expect(data.tables.expense.map((e) => [e.id, e.subscriptionId])).toEqual([['charge', 's1']]);
    expect(bucketBalances(data, '2026-10-14').cash).toBe(cashBefore);
  });

  it('set actual balance records only the difference', async () => {
    const { store, actions } = await setup();
    const adj = await actions.setActualBalance('cash', 1_012_34, '2026-10-14');
    expect(adj).toMatchObject({ type: 'adjustment', amount: 12_34, to: 'cash' });
    expect(await actions.setActualBalance('cash', 1_012_34, '2026-10-14')).toBeNull();
    expect(bucketBalances(store.getState().data, '2026-10-14').cash).toBe(1_012_34);
  });
});

describe('freezes', () => {
  it('adding a freeze re-prices a pending expected salary', async () => {
    const { store, actions } = await setup();
    await store.getState().put('income', {
      id: 'salary-2026-10',
      createdAt: '2026-10-14T12:00:00.000Z',
      updatedAt: '2026-10-14T12:00:00.000Z',
      amount: 3_100_00,
      source: 'salary',
      label: 'Salary',
      date: '2026-10-25',
      status: 'expected',
      bucket: 'cash',
      recurrence: null,
      period: '2026-10',
      note: '',
    });
    await actions.addFreeze({ start: '2026-10-05', end: '2026-10-07', mode: 'computed', note: '' });
    const data = store.getState().data;
    expect(data.tables.salaryFreeze[0]?.lostAmount).toBe(300_00);
    expect(data.tables.income[0]?.amount).toBe(2_800_00);
    await actions.deleteFreeze(data.tables.salaryFreeze[0]!.id);
    expect(store.getState().data.tables.income[0]?.amount).toBe(3_100_00);
  });
});

describe('onboarding', () => {
  it('writes the profile and cards in one go', async () => {
    const t = await freshRealStore();
    const actions = createFinanceActions(t.store);
    await actions.completeOnboarding({
      name: 'Alex',
      currency: 'EUR',
      openingCash: 1_000_00,
      openingSavings: 5_000_00,
      salary: { monthlyAmount: 4_200_00, payDay: 25 },
      cards: [{ name: 'Visa', balance: 230_00, creditLimit: null, dueDay: 21, payInFull: true }],
    });
    const data = t.store.getState().data;
    expect(data.tables.profile[0]).toMatchObject({
      name: 'Alex',
      currency: 'EUR',
      openingDate: '2026-10-14',
      openingCash: 1_000_00,
    });
    expect(data.tables.profile[0]?.onboardedAt).not.toBeNull();
    expect(data.tables.debt[0]).toMatchObject({
      name: 'Visa',
      kind: 'credit_card',
      openingBalance: 230_00,
      openingDate: '2026-10-14',
      dueDay: 21,
    });
  });
});
