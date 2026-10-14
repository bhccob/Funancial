import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { computeFinanceView } from './view';

const avl = EXAMPLES.find((e) => e.id === 'AVL-1')!;
const sal = EXAMPLES.find((e) => e.id === 'SAL-1')!;

describe('computeFinanceView', () => {
  it('gathers the AVL-1 numbers', () => {
    const v = computeFinanceView(avl.data, '2026-10-14', 1);
    expect(v).toMatchObject({
      buckets: { cash: 1_100_00, savings: 3_000_00, passive: 0 },
      debtTotal: 230_00,
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

  it('finds the active freeze on its first and last day only', () => {
    expect(computeFinanceView(sal.data, '2026-09-28', 1).activeFreeze?.id).toBeDefined();
    expect(computeFinanceView(sal.data, '2026-10-03', 1).activeFreeze?.id).toBeDefined();
    expect(computeFinanceView(sal.data, '2026-10-04', 1).activeFreeze).toBeNull();
  });

  it('reports this month’s expected salary after freezes', () => {
    expect(computeFinanceView(sal.data, '2026-10-14', 1).expectedSalaryThisMonth).toBe(2_709_68);
  });
});
