// Captured with v9 code at commit 3f636e2: every value in v9-expected.json, `available` included.
// v9-edge-cardsub.json is v9-edge with one more card subscription, renewing this month after asOf.
import { describe, expect, it } from 'vitest';
import { accountBalance, debtBalance } from '../balances';
import type { Cycle } from '../entities';
import { endOfMonth } from '../periods';
import { nextOccurrence } from '../recurrence';
import { migrateSnapshot } from '../snapshot';
import { computeFinanceView } from '../view';
import v9demo from './__fixtures__/v9-demo.json';
import v9edgeCardsub from './__fixtures__/v9-edge-cardsub.json';
import v9edge from './__fixtures__/v9-edge.json';
import v9expected from './__fixtures__/v9-expected.json';
import { MAIN_ACCOUNT_ID, PASSIVE_ACCOUNT_ID, SAVINGS_ACCOUNT_ID } from './v10Accounts';

type Expected = {
  asOf: string;
  cash: number;
  savings: number;
  passive: number;
  cards: Record<string, number>;
  loans: Record<string, number>;
  netWorth: number;
  available: number;
};

type V9Subscription = {
  status: string;
  paymentMethod: string;
  amount: number;
  cycle: Cycle;
  nextRenewal: string;
  anchorDay: number;
};

const FIXTURES = { demo: v9demo, edge: v9edge, 'edge-cardsub': v9edgeCardsub };
const EXPECTED = v9expected as Record<keyof typeof FIXTURES, Expected>;

/**
 * What v9 took off Available for the subscriptions on a credit card renewing from `asOf` to month
 * end, read off the v9 rows the way v9's bills read them. v10 leaves these out: such a renewal
 * lands on the card and comes back as the card's bill.
 */
function cardSubscriptionBills(raw: { tables: { subscription: unknown[] } }, asOf: string): number {
  const until = endOfMonth(asOf);
  let total = 0;
  for (const s of raw.tables.subscription as V9Subscription[]) {
    if (s.status !== 'active' || s.paymentMethod !== 'credit_card') continue;
    for (let d = s.nextRenewal; d <= until; d = nextOccurrence(d, s.cycle, s.anchorDay)) {
      if (d >= asOf) total += s.amount;
    }
  }
  return total;
}

describe.each(['demo', 'edge', 'edge-cardsub'] as const)('the v9 %s fixture, upgraded', (name) => {
  const want = EXPECTED[name];
  const data = migrateSnapshot(structuredClone(FIXTURES[name]));

  const balanceOf = (id: string): number => {
    const account = data.tables.account.find((a) => a.id === id);
    if (!account) throw new Error(`No account ${id}`);
    return accountBalance(account, data, want.asOf);
  };

  it('Main account holds what cash held', () => {
    expect(balanceOf(MAIN_ACCOUNT_ID)).toBe(want.cash);
  });

  it('Savings holds what savings held', () => {
    expect(balanceOf(SAVINGS_ACCOUNT_ID)).toBe(want.savings);
  });

  it('Passive income holds what passive held', () => {
    expect(balanceOf(PASSIVE_ACCOUNT_ID)).toBe(want.passive);
  });

  it('each card owes what it owed, an archived one included', () => {
    const cards = data.tables.account.filter((a) => a.kind === 'credit').map((a) => a.id);
    expect(cards.sort()).toEqual(Object.keys(want.cards).sort());
    for (const [id, owed] of Object.entries(want.cards)) expect(balanceOf(id), id).toBe(owed);
  });

  it('each loan owes what it owed', () => {
    expect(data.tables.debt.map((d) => d.id).sort()).toEqual(Object.keys(want.loans).sort());
    for (const debt of data.tables.debt) {
      expect(debtBalance(debt, data, want.asOf), debt.id).toBe(want.loans[debt.id]);
    }
  });

  it('net worth is what it was', () => {
    expect(computeFinanceView(data, want.asOf, 1).netWorth).toBe(want.netWorth);
  });

  it('Available is what it was, less Savings, and a card subscription is taken off once', () => {
    const cardSubscriptions = cardSubscriptionBills(FIXTURES[name], want.asOf);
    expect(computeFinanceView(data, want.asOf, 1).available).toBe(
      want.available - want.savings + cardSubscriptions,
    );
  });
});

it('the v9 edge-cardsub fixture has a card subscription renewing in the window', () => {
  expect(cardSubscriptionBills(v9edgeCardsub, v9expected.edge.asOf)).toBe(1299);
  expect(cardSubscriptionBills(v9edge, v9expected.edge.asOf)).toBe(0);
});

describe('the v9 edge fixture’s archived card, upgraded', () => {
  const data = migrateSnapshot(structuredClone(v9edge));
  const view = computeFinanceView(data, v9expected.edge.asOf, 1);

  it('is not listed and has no bill', () => {
    expect(view.accounts.map((r) => r.account.id)).toEqual([
      MAIN_ACCOUNT_ID,
      SAVINGS_ACCOUNT_ID,
      PASSIVE_ACCOUNT_ID,
      'card-a',
    ]);
    expect(view.bills.some((b) => b.accountId === 'card-b')).toBe(false);
  });

  it('is left out of what is owed, while the live card and the loan count', () => {
    expect(view.owed).toBe(v9expected.edge.cards['card-a'] + v9expected.edge.loans['loan-1']);
  });
});
