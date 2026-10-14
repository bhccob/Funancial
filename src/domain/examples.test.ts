import { describe, expect, it } from 'vitest';
import { bucketBalances, debtBalance, netWorth } from './balances';
import {
  availableBalance,
  limitStatus,
  reservedTotal,
  upcomingBills,
  type LimitLevel,
} from './budget';
import { EXAMPLES, type WorkedExample } from './examples';
import { expectedSalary, freezeAllocation, freezeLoss } from './salary';
import { SnapshotSchema } from './snapshot';

/** How each worked example's numbers are produced from the real domain functions. */
const RANK: Record<LimitLevel, number> = { ok: 0, warn: 1, over: 2, 'way-over': 3 };

const COMPUTE: Record<string, (ex: WorkedExample) => Record<string, number>> = {
  'AVL-1': (ex) => {
    const bills = upcomingBills(ex.data, ex.today);
    const reserved = reservedTotal(ex.data, ex.today, 1);
    const food = limitStatus(
      ex.data.tables.budgetLimit.find((l) => l.category === 'food')!,
      ex.data,
      ex.today,
      1,
    );
    return {
      billsTotal: bills.reduce((s, b) => s + b.amount, 0),
      reserved,
      available: availableBalance(bucketBalances(ex.data, ex.today), bills, reserved),
      foodSpent: food.spent,
      foodPct: food.pct,
    };
  },
  'SAL-1': (ex) => {
    const profile = ex.data.tables.profile[0]!;
    const freeze = ex.data.tables.salaryFreeze[0]!;
    const monthly = profile.salary!.monthlyAmount;
    const alloc = freezeAllocation(freeze, monthly);
    return {
      lossSep: alloc['2026-09']!,
      lossOct: alloc['2026-10']!,
      total: freezeLoss(freeze.start, freeze.end, monthly),
      expectedSep: expectedSalary(profile, ex.data.tables.salaryFreeze, '2026-09'),
      expectedOct: expectedSalary(profile, ex.data.tables.salaryFreeze, '2026-10'),
    };
  },
  'LIM-1': (ex) => {
    const limit = ex.data.tables.budgetLimit[0]!;
    const before = limitStatus(limit, ex.data, ex.today, 1);
    const lunch = { ...ex.data.tables.expense[0]!, id: 'lunch', amount: 20_00, date: ex.today };
    const after = limitStatus(
      limit,
      { ...ex.data, tables: { ...ex.data.tables, expense: [...ex.data.tables.expense, lunch] } },
      ex.today,
      1,
    );
    return {
      spent: before.spent,
      pct: before.pct,
      levelRank: RANK[before.level],
      pctAfterLunch: after.pct,
      levelRankAfterLunch: RANK[after.level],
    };
  },
  'BAL-1': (ex) => {
    const b = bucketBalances(ex.data, ex.today);
    const card = debtBalance(ex.data.tables.debt[0]!, ex.data, ex.today);
    return {
      cash: b.cash,
      savings: b.savings,
      passive: b.passive,
      card,
      netWorth: netWorth(b, card),
    };
  },
  'EXP-1': (ex) => {
    const b = bucketBalances(ex.data, ex.today);
    const card = debtBalance(ex.data.tables.debt[0]!, ex.data, ex.today);
    return { cash: b.cash, card, netWorth: netWorth(b, card) };
  },
};

describe('worked examples', () => {
  it('every example has a calculator and readable steps', () => {
    for (const ex of EXAMPLES) {
      expect(COMPUTE[ex.id], ex.id).toBeTypeOf('function');
      expect(ex.steps.length, ex.id).toBeGreaterThan(0);
    }
  });

  it.each(EXAMPLES.map((ex) => [ex.id, ex] as const))('%s uses valid data', (_id, ex) => {
    expect(SnapshotSchema.safeParse(ex.data).error?.issues ?? []).toEqual([]);
  });

  it.each(EXAMPLES.map((ex) => [ex.id, ex] as const))('%s matches the domain math', (_id, ex) => {
    expect(COMPUTE[ex.id]!(ex)).toEqual(ex.result);
  });

  it('BAL-1 has the documented numbers', () => {
    expect(EXAMPLES.find((e) => e.id === 'BAL-1')?.result).toEqual({
      cash: 3_330_00,
      savings: 5_500_00,
      passive: 0,
      card: 50_00,
      netWorth: 8_780_00,
    });
  });

  it('EXP-1 has the documented numbers', () => {
    expect(EXAMPLES.find((e) => e.id === 'EXP-1')?.result).toEqual({
      cash: 487_50,
      card: 60_00,
      netWorth: 427_50,
    });
  });
});
