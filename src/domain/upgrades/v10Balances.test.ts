// The expected values in v9-expected.json were captured with v9 code at commit 3f636e2.
import { describe, expect, it } from 'vitest';
import { accountBalance, debtBalance } from '../balances';
import { migrateSnapshot } from '../snapshot';
import { computeFinanceView } from '../view';
import v9demo from './__fixtures__/v9-demo.json';
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
};

const FIXTURES = { demo: v9demo, edge: v9edge };
const EXPECTED = v9expected as Record<keyof typeof FIXTURES, Expected>;

describe.each(['demo', 'edge'] as const)('the v9 %s fixture, upgraded', (name) => {
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
