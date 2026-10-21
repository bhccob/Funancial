import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { bucketBalances, debtBalance } from '@/domain/balances';
import { SubscriptionSchema } from '@/domain/entities';
import { holdingRate, holdingValue } from '@/domain/portfolio';
import type { DataSnapshot } from '@/domain/snapshot';
import { freshRealStore } from '@/test/realStore';
import {
  makeDebt,
  makeExpense,
  makeGoal,
  makeHolding,
  makeLimit,
  makeProfile,
  makeSubscription,
} from '@/test/fixtures';
import { createFinanceActions } from './financeActions';

async function setup() {
  const t = await freshRealStore();
  await t.store.getState().put(
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

  it('archives a card with history instead of deleting it, and deletes one without', async () => {
    const { store, actions } = await setup();
    await store.getState().put('debt', makeDebt({ id: 'used', openingDate: '2026-10-01' }));
    await store.getState().put('debt', makeDebt({ id: 'unused', openingDate: '2026-10-01' }));
    await store
      .getState()
      .put(
        'expense',
        makeExpense({ paymentMethod: 'credit_card', cardId: 'used', date: '2026-10-02' }),
      );
    const cashBefore = bucketBalances(store.getState().data, '2026-10-14').cash;
    await actions.deleteDebt('used');
    await actions.deleteDebt('unused');
    const data = store.getState().data;
    expect(data.tables.debt.map((d) => [d.id, d.archivedOn])).toEqual([['used', '2026-10-14']]);
    // The past expense still names it, and nothing it paid for changes.
    expect(data.tables.expense[0]).toMatchObject({ paymentMethod: 'credit_card', cardId: 'used' });
    expect(bucketBalances(data, '2026-10-14').cash).toBe(cashBefore);
  });

  it('archives a loan with payments too', async () => {
    const { store, actions } = await setup();
    await store.getState().put('debt', makeDebt({ id: 'loan', kind: 'loan' }));
    await actions.payDebt('loan', 50_00, 'cash', '2026-10-14');
    await actions.deleteDebt('loan');
    expect(store.getState().data.tables.debt.map((d) => d.archivedOn)).toEqual(['2026-10-14']);
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

describe('Salary freeze is gone', () => {
  it('has no action to add or delete a freeze', async () => {
    const { actions } = await setup();
    expect(actions).not.toHaveProperty('addFreeze');
    expect(actions).not.toHaveProperty('deleteFreeze');
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
    await store.getState().put('subscription', makeSubscription({ id: 'sub-tv' }));
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

  it('a new subscription starts un-audited, and editing one keeps its audit stamp', async () => {
    const { store, actions } = await setup();
    const input = {
      name: 'Gym',
      amount: 30_00,
      cycle: 'monthly' as const,
      nextRenewal: '2026-11-05',
      category: 'health' as const,
      paymentMethod: 'debit' as const,
      cardId: null,
    };
    const created = await actions.saveSubscription(input);
    expect(created.auditedAt).toBeNull();

    await actions.setSubscriptionAudit(created.id, 'cancel');
    const audited = store.getState().data.tables.subscription.find((s) => s.id === created.id)!;
    expect(audited.auditedAt).not.toBeNull();

    const edited = await actions.saveSubscription({ ...input, id: created.id, amount: 35_00 });
    expect(edited).toMatchObject({
      amount: 35_00,
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
  const holding = (store: Awaited<ReturnType<typeof setup>>['store'], id: string) =>
    store.getState().data.tables.holding.find((h) => h.id === id)!;

  it('relabels without converting: every amount keeps its number', async () => {
    const { store, actions } = await withHoldings();
    await actions.changeCurrency('EUR');
    expect(store.getState().data.tables.profile[0]).toMatchObject({
      currency: 'EUR',
      openingCash: 1_000_00,
      openingSavings: 5_000_00,
    });
    expect(store.getState().data.tables.expense.map((e) => e.amount)).toEqual([1_200]);
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
    const settingsOf = (store: Awaited<ReturnType<typeof setup>>['store']) =>
      store.getState().data.tables.settings[0]!;

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
    expect(store.getState().data.tables.profile[0]?.salary).toMatchObject({ since: '2026-10-14' });
  });

  it('marking it as not arrived keeps it out of balances and the banner, for good', async () => {
    const { store, actions } = await setup();
    // An October pay day already passed before today, from the original salary.
    await store.getState().put('profile', {
      ...makeProfile({ openingDate: '2026-10-01' }),
      salary: { monthlyAmount: 3_100_00, payDay: 5 },
    });
    await store.getState().sync();
    expect(store.getState().data.tables.income.map((i) => [i.id, i.status])).toEqual([
      ['salary-2026-10', 'expected'],
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
      date: '2026-10-14',
      bucket: 'cash',
      note: '',
    });
    // It came after all: the skipped month is confirmed rather than doubled.
    expect(late.id).toBe('salary-2026-10');
    expect(store.getState().data.tables.income).toHaveLength(1);
  });
});

describe('deleting a card a subscription pays with', () => {
  async function withSubscriptions() {
    const t = await setup();
    const put = t.store.getState().put;
    await put('debt', makeDebt({ id: 'card-x', name: 'Visa', openingBalance: 0 }));
    await put(
      'subscription',
      makeSubscription({ id: 'sub-gym', paymentMethod: 'credit_card', cardId: 'card-x' }),
    );
    await put(
      'subscription',
      makeSubscription({
        id: 'sub-old',
        paymentMethod: 'credit_card',
        cardId: 'card-x',
        status: 'cancelled',
      }),
    );
    await put('subscription', makeSubscription({ id: 'sub-cash', paymentMethod: 'cash' }));
    return t;
  }

  const paidWith = (data: DataSnapshot) =>
    data.tables.subscription.map((s) => [s.id, s.paymentMethod, s.cardId]);

  it('moves them to debit and deletes the card, in one write', async () => {
    const { store, actions } = await withSubscriptions();
    const putMany = vi.spyOn(store.getState(), 'putMany');
    await actions.deleteDebt('card-x');
    const data = store.getState().data;
    expect(data.tables.debt).toEqual([]);
    expect(paidWith(data)).toEqual([
      ['sub-gym', 'debit', null],
      ['sub-old', 'debit', null],
      ['sub-cash', 'cash', null],
    ]);
    // Every moved one still holds together: a card exactly when paying by credit card.
    for (const s of data.tables.subscription)
      expect(SubscriptionSchema.safeParse(s).success).toBe(true);
    expect(putMany).toHaveBeenCalledTimes(1);
    expect(putMany.mock.calls[0]![1]).toEqual([{ table: 'debt', id: 'card-x' }]);
  });

  it('moves them to debit when the card is archived too, so no renewal lands on it', async () => {
    const { store, actions } = await withSubscriptions();
    await store
      .getState()
      .put('expense', makeExpense({ paymentMethod: 'credit_card', cardId: 'card-x' }));
    await actions.deleteDebt('card-x');
    const data = store.getState().data;
    expect(data.tables.debt.map((d) => d.archivedOn)).toEqual(['2026-10-14']);
    expect(paidWith(data)).toEqual([
      ['sub-gym', 'debit', null],
      ['sub-old', 'debit', null],
      ['sub-cash', 'cash', null],
    ]);
  });
});
