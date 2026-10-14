import { describe, expect, it } from 'vitest';
import { SnapshotSchema } from '@/domain/snapshot';
import { buildDemoSnapshot } from './demoSeed';

const TODAY = '2026-10-14';
const START = '2026-08-15'; // today − 60 days
const demo = buildDemoSnapshot(TODAY);
const t = demo.tables;
const daily = t.expense.filter(
  (e) => e.subscriptionId === null && e.category !== 'rent' && e.category !== 'utilities',
);

describe('demo seed', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    expect(buildDemoSnapshot(TODAY)).toEqual(demo);
    expect(buildDemoSnapshot(TODAY, 7)).not.toEqual(demo);
  });

  it('is valid data', () => {
    const result = SnapshotSchema.safeParse(demo);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('dates every expense inside the 60-day window, none in the future', () => {
    expect(t.expense.every((e) => e.date >= START && e.date <= TODAY)).toBe(true);
    expect(t.profile[0]?.openingDate).toBe(START);
  });

  it('logs 2 to 4 everyday expenses on each day of the window', () => {
    const perDay = new Map<string, number>();
    for (const e of daily) perDay.set(e.date, (perDay.get(e.date) ?? 0) + 1);
    expect(perDay.size).toBe(61);
    expect([...perDay.values()].every((n) => n >= 2 && n <= 4)).toBe(true);
  });

  it('charges rent and utilities once a month', () => {
    const rent = t.expense.filter((e) => e.category === 'rent').map((e) => e.date);
    expect(rent).toEqual(['2026-09-01', '2026-10-01']);
    expect(t.expense.filter((e) => e.category === 'utilities')).toHaveLength(2);
  });

  it('puts about 30% of everyday spending on the demo card, which exists', () => {
    const cards = new Set(t.debt.filter((d) => d.kind === 'credit_card').map((d) => d.id));
    const onCard = t.expense.filter((e) => e.paymentMethod === 'credit_card');
    expect(onCard.every((e) => e.cardId !== null && cards.has(e.cardId))).toBe(true);
    const share = daily.filter((e) => e.paymentMethod === 'credit_card').length / daily.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.4);
  });

  it('has the four subscriptions, each renewing after today', () => {
    expect(t.subscription.map((s) => [s.name, s.amount, s.category])).toEqual([
      ['Streamflix', 15_99, 'entertainment'],
      ['Tunely', 10_99, 'entertainment'],
      ['CloudBox', 2_99, 'other'],
      ['FitHub Gym', 39_00, 'health'],
    ]);
    expect(t.subscription.every((s) => s.nextRenewal > TODAY && s.cycle === 'monthly')).toBe(true);
    const charges = t.expense.filter((e) => e.subscriptionId !== null);
    expect(charges.length).toBeGreaterThanOrEqual(8);
  });

  it('has the documented limits, card and goals', () => {
    expect(t.budgetLimit.map((l) => [l.scope, l.category, l.period, l.amount])).toEqual([
      ['overall', null, 'monthly', 2_600_00],
      ['category', 'food', 'weekly', 120_00],
      ['category', 'entertainment', 'monthly', 100_00],
    ]);
    expect(t.debt).toMatchObject([
      {
        name: 'Demo Visa',
        kind: 'credit_card',
        payInFull: true,
        statementDay: 1,
        dueDay: 21,
        creditLimit: 3_000_00,
      },
    ]);
    expect(t.goal).toMatchObject([
      {
        name: 'Emergency fund',
        kind: 'emergency',
        target: 10_000_00,
        current: 3_000_00,
        deadline: null,
      },
      {
        name: 'New bike',
        kind: 'savings',
        target: 1_200_00,
        current: 450_00,
        deadline: '2027-02-11',
      },
    ]);
  });

  it('pays salary on each pay day, reduced by the past five-day freeze', () => {
    const [freeze] = t.salaryFreeze;
    expect(t.salaryFreeze).toHaveLength(1);
    expect(freeze).toMatchObject({ start: '2026-09-08', end: '2026-09-12', mode: 'computed' });
    expect(freeze?.lostAmount).toBe(Math.round((4_200_00 / 30) * 5));

    expect(t.income.map((i) => [i.date, i.period, i.amount, i.status])).toEqual([
      ['2026-08-25', '2026-08', 4_200_00, 'confirmed'],
      ['2026-09-25', '2026-09', 4_200_00 - freeze!.lostAmount, 'confirmed'],
    ]);
  });
});
