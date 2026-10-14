import { describe, expect, it } from 'vitest';
import { bucketBalances, debtBalance, netWorth } from './balances';
import { EXAMPLES, type WorkedExample } from './examples';
import { SnapshotSchema } from './snapshot';

/** How each worked example's numbers are produced from the real domain functions. */
const COMPUTE: Record<string, (ex: WorkedExample) => Record<string, number>> = {
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
