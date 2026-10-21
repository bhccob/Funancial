import { describe, expect, it } from 'vitest';
import { makeDebt, makeHolding, makeProfile, makeTransaction } from '@/test/fixtures';
import { EXAMPLES } from './examples';
import { emptySnapshot } from './snapshot';
import { computeFinanceView } from './view';

const avl = EXAMPLES.find((e) => e.id === 'AVL-1')!;
const sal = EXAMPLES.find((e) => e.id === 'SAL-1')!;

describe('computeFinanceView', () => {
  it('gathers the AVL-1 numbers', () => {
    const v = computeFinanceView(avl.data, '2026-10-14', 1);
    expect(v).toMatchObject({
      buckets: { cash: 1_100_00, savings: 3_000_00, passive: 0 },
      debtTotal: 230_00,
      investments: 0,
      netWorth: 3_870_00,
      billsTotal: 245_99,
      reserved: 1_200_00,
      available: 2_654_01,
      subscriptionsMonthly: 54_99,
      spending: { today: 0, week: 100_00, month: 100_00, year: 100_00 },
      pendingSalary: [],
      activeFreeze: null,
    });
    expect(v.limits.map((l) => [l.limit.category, l.pct])).toEqual([
      ['food', 83],
      ['rent', 0],
    ]);
    expect(v.debts.map((d) => [d.debt.id, d.balance])).toEqual([['card-1', 230_00]]);
  });

  it('leaves an archived card out: no row, no bill, and what it owes no longer counts', () => {
    const data = structuredClone(avl.data);
    data.tables.debt = data.tables.debt.map((d) => ({ ...d, archivedOn: '2026-10-14' }));
    const v = computeFinanceView(data, '2026-10-14', 1);
    expect(v.debts).toEqual([]);
    expect(v.debtTotal).toBe(0);
    expect(v.netWorth).toBe(3_870_00 + 230_00);
    expect(v.bills.filter((b) => b.kind === 'card')).toEqual([]);
  });

  it('does not take a card minimum off Available to spend twice once it is paid', () => {
    const data = emptySnapshot();
    data.tables.profile = [
      makeProfile({ openingDate: '2026-10-01', openingCash: 1_000_00, openingSavings: 0 }),
    ];
    // Owes 800.00, a 25.00 minimum due on the 21st.
    data.tables.debt = [
      makeDebt({
        id: 'visa',
        openingDate: '2026-10-01',
        openingBalance: 800_00,
        payInFull: false,
        minimumPayment: 25_00,
        dueDay: 21,
      }),
    ];
    const before = computeFinanceView(data, '2026-10-14', 1);
    expect([before.buckets.cash, before.billsTotal, before.available]).toEqual([
      1_000_00, 25_00, 975_00,
    ]);

    data.tables.transaction = [
      makeTransaction({
        type: 'card_payment',
        amount: 25_00,
        date: '2026-10-14',
        from: 'cash',
        to: null,
        debtId: 'visa',
      }),
    ];
    const after = computeFinanceView(data, '2026-10-14', 1);
    expect([after.buckets.cash, after.bills, after.available]).toEqual([975_00, [], 975_00]);
    expect(after.debts.map((d) => d.balance)).toEqual([775_00]);
  });

  it('counts the priced portfolio as investments in net worth', () => {
    const data = emptySnapshot();
    data.tables.profile = [
      makeProfile({ openingDate: '2026-10-01', openingCash: 1_000_00, openingSavings: 0 }),
    ];
    const quote = {
      price: 60,
      previousClose: null,
      fxRate: null,
      asOf: '2026-10-14T08:00:00.000Z',
    };
    data.tables.holding = [makeHolding({ shares: 10, quote }), makeHolding({ quote: null })];
    const v = computeFinanceView(data, '2026-10-14', 1);
    expect(v.investments).toBe(600_00);
    expect(v.netWorth).toBe(1_600_00);
  });

  it('finds the active freeze on its first and last day only', () => {
    expect(computeFinanceView(sal.data, '2026-09-28', 1).activeFreeze?.id).toBeDefined();
    expect(computeFinanceView(sal.data, '2026-10-03', 1).activeFreeze?.id).toBeDefined();
    expect(computeFinanceView(sal.data, '2026-10-04', 1).activeFreeze).toBeNull();
  });

  it('reports this month’s expected salary after freezes', () => {
    expect(computeFinanceView(sal.data, '2026-10-14', 1).expectedSalaryThisMonth).toBe(2_709_68);
  });
});
