import { describe, expect, it } from 'vitest';
import { crossesOver, limitAlerts, limitMessage } from './alerts';
import { limitStatus } from './budget';
import { ex } from './examples';
import { applyRecords } from './sync';

const TODAY = '2026-10-14';
const food = ex.limit({ id: 'food', category: 'food', period: 'weekly', amount: 120_00 });
const base = ex.snapshot({
  budgetLimit: [food],
  expense: [ex.expense({ amount: 90_00, date: '2026-10-13' })],
});
const withExpense = (data: typeof base, amount: number, date = TODAY) =>
  applyRecords(data, [{ table: 'expense', record: ex.expense({ amount, date }) }]);

describe('limitAlerts', () => {
  it('alerts when a limit enters a new level', () => {
    const after = withExpense(base, 10_00);
    expect(limitAlerts(base, after, TODAY, 1).map((s) => [s.limit.id, s.level, s.pct])).toEqual([
      ['food', 'warn', 83],
    ]);
  });

  it('stays quiet within the same level', () => {
    const warned = withExpense(base, 10_00);
    expect(limitAlerts(warned, withExpense(warned, 5_00), TODAY, 1)).toEqual([]);
  });

  it('ignores expenses from an earlier period', () => {
    expect(limitAlerts(base, withExpense(base, 500_00, '2026-09-30'), TODAY, 1)).toEqual([]);
  });
});

describe('crossesOver', () => {
  it('finds limits a new expense would push past 100%', () => {
    const lunch = ex.expense({ amount: 30_00, date: TODAY });
    expect(crossesOver(base, lunch, TODAY, 1).map((s) => s.limit.id)).toEqual(['food']);
    expect(crossesOver(base, { ...lunch, amount: 20_00 }, TODAY, 1)).toEqual([]);
  });
});

describe('limitMessage', () => {
  const status = (spent: number, period: 'weekly' | 'monthly' = 'weekly') => {
    const limit = { ...food, period };
    return limitStatus(
      limit,
      ex.snapshot({ budgetLimit: [limit], expense: [ex.expense({ amount: spent, date: TODAY })] }),
      TODAY,
      1,
    );
  };

  it('has exact copy for every tone and level', () => {
    const warn = status(102_00);
    const over = status(126_00);
    const way = status(150_00);
    expect([over.level, way.level]).toEqual(['over', 'way-over']);
    expect(limitMessage('gentle', warn)).toBe('Heads up: Food is at 85% of its limit.');
    expect(limitMessage('gentle', over)).toBe('Food has reached its limit for this week.');
    expect(limitMessage('gentle', way)).toBe('Food is well past its limit (125%).');
    expect(limitMessage('motivational', warn)).toBe(
      "Food is at 85%. A few careful days and you've got this!",
    );
    expect(limitMessage('motivational', over)).toBe(
      "Food hit its limit. Let's hold the line for the rest of the week.",
    );
    expect(limitMessage('motivational', way)).toBe(
      "Food is at 125%. Let's regroup and get back on track.",
    );
    expect(limitMessage('strict', warn)).toBe('Food: 85% used.');
    expect(limitMessage('strict', over)).toBe('Food limit reached.');
    expect(limitMessage('strict', way)).toBe('Food limit exceeded: 125%.');
    expect(limitMessage('gentle', status(126_00, 'monthly'))).toBe(
      'Food has reached its limit for this month.',
    );
  });
});
