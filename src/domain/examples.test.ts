import { describe, expect, it } from 'vitest';
import { accountBalance } from './balances';
import { limitStatus, type LimitLevel } from './budget';
import { EXAMPLES, type WorkedExample } from './examples';
import { SnapshotSchema } from './snapshot';
import { applyRecords, dueGenerated } from './sync';
import { MAIN_ACCOUNT_ID, PASSIVE_ACCOUNT_ID, SAVINGS_ACCOUNT_ID } from './upgrades/v10Accounts';
import { computeFinanceView } from './view';

/** How each worked example's numbers are produced from the real domain functions. */
const RANK: Record<LimitLevel, number> = { ok: 0, warn: 1, over: 2, 'way-over': 3 };

/** What an account of the example holds on a day; 0 when the example has no such account. */
const held = (ex: WorkedExample, id: string, day = ex.today) => {
  const account = ex.data.tables.account.find((a) => a.id === id);
  return account ? accountBalance(account, ex.data, day) : 0;
};

/**
 * In the examples "cash" is Main account, the one bank account the money moves through: the
 * place the v9 cash bucket became.
 */
const cash = (ex: WorkedExample, day = ex.today) => held(ex, MAIN_ACCOUNT_ID, day);

const COMPUTE: Record<string, (ex: WorkedExample) => Record<string, number>> = {
  'AVL-1': (ex) => {
    const view = computeFinanceView(ex.data, ex.today, 1);
    const food = view.limits.find((l) => l.limit.category === 'food')!;
    return {
      billsTotal: view.billsTotal,
      reserved: view.reserved,
      available: view.available,
      foodSpent: food.spent,
      foodPct: food.pct,
    };
  },
  'SUB-1': (ex) => {
    const before = computeFinanceView(ex.data, ex.today, 1);
    const after = applyRecords(ex.data, dueGenerated(ex.data, '2026-10-20'));
    const next = after.tables.subscription[0]!.nextRenewal;
    return {
      billsBefore: before.billsTotal,
      availableBefore: before.available,
      cashBefore: cash(ex),
      cashAfter: held({ ...ex, data: after }, MAIN_ACCOUNT_ID, '2026-10-20'),
      billsAfter: computeFinanceView(after, '2026-10-20', 1).billsTotal,
      nextRenewalMonth: Number(next.slice(5, 7)),
      nextRenewalDay: Number(next.slice(8, 10)),
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
    const view = computeFinanceView(ex.data, ex.today, 1);
    return {
      cash: cash(ex),
      savings: held(ex, SAVINGS_ACCOUNT_ID),
      passive: held(ex, PASSIVE_ACCOUNT_ID),
      card: view.owed,
      netWorth: view.netWorth,
    };
  },
  'EXP-1': (ex) => {
    const view = computeFinanceView(ex.data, ex.today, 1);
    return { cash: cash(ex), card: view.owed, netWorth: view.netWorth };
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

  it.each(EXAMPLES.map((ex) => [ex.id, ex] as const))(
    '%s pays every row from an account of its own',
    (_id, ex) => {
      const { account, expense, income, subscription, transaction } = ex.data.tables;
      const ids = new Set(account.map((a) => a.id));
      const named = [
        ...expense.map((e) => e.accountId),
        ...income.map((i) => i.accountId),
        ...subscription.map((s) => s.accountId),
        ...transaction.flatMap((t) => [t.fromAccountId, t.toAccountId]),
      ].filter((id): id is string => id !== null);
      expect(named.filter((id) => !ids.has(id))).toEqual([]);
    },
  );

  it('has no salary freeze example', () => {
    expect(EXAMPLES.map((e) => e.id)).not.toContain('SAL-1');
    expect(EXAMPLES.map((e) => e.rule)).not.toContain('Salary freeze');
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

  it('AVL-1 has the documented numbers', () => {
    expect(EXAMPLES.find((e) => e.id === 'AVL-1')?.result).toEqual({
      billsTotal: 245_99,
      reserved: 1_200_00,
      available: 2_654_01,
      foodSpent: 100_00,
      foodPct: 83,
    });
  });

  it('SUB-1 has the documented numbers', () => {
    expect(EXAMPLES.find((e) => e.id === 'SUB-1')?.result).toEqual({
      billsBefore: 15_99,
      availableBefore: 984_01,
      cashBefore: 1_000_00,
      cashAfter: 984_01,
      billsAfter: 0,
      nextRenewalMonth: 11,
      nextRenewalDay: 20,
    });
  });

  it('counts a savings account in Available only where the example says so', () => {
    // Savings do not count by default (spec 2.4): AVL-1 turns it on, as its steps say.
    const counted = (id: string) =>
      EXAMPLES.find((e) => e.id === id)!.data.tables.account.filter(
        (a) => a.kind === 'savings' && a.inAvailable,
      );
    expect(counted('AVL-1').map((a) => a.id)).toEqual([SAVINGS_ACCOUNT_ID]);
    expect(counted('BAL-1')).toEqual([]);
  });
});
