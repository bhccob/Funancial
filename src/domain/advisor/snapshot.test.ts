import { describe, expect, it } from 'vitest';
import {
  makeBuyAsk,
  makeDebt,
  makeExpense,
  makeGoal,
  makeHolding,
  makeIncome,
  makeLimit,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import { history, TODAY, world } from '@/test/testWorld';
import { projectedAnnual } from '../dividends';
import type { Holding } from '../entities';
import { buildSnapshot, type PastDecision } from './snapshot';

const ask = makeBuyAsk();
const snap = (data = world(), a = ask, past: PastDecision[] = []) =>
  buildSnapshot(data, TODAY, a, past);

const quote = (price: number): NonNullable<Holding['quote']> => ({
  price,
  previousClose: null,
  fxRate: null,
  asOf: '2026-10-14T08:00:00.000Z',
});

describe('buildSnapshot', () => {
  it('sends totals only: no note text, ids or individual amounts', () => {
    const data = world({
      savings: 500_01, // a transfer lands in a balance, so pick one that does not spell it out
      expenses: [
        makeExpense({
          amount: 13_37,
          category: 'food',
          date: '2026-10-03',
          note: 'SECRET-NOTE-123',
        }),
        makeExpense({ amount: 24_68, category: 'food', date: '2026-10-04', note: 'other-note' }),
      ],
      incomes: [makeIncome({ amount: 3_000_00, date: '2026-10-01', note: 'INCOME-NOTE-456' })],
      goals: [makeGoal({ name: 'Bike' })],
      debts: [makeDebt({ openingBalance: 99_00, openingDate: '2026-06-01' })],
      subscriptions: [makeSubscription({ name: 'Streamflix', note: 'SUB-NOTE' })],
      holdings: [makeHolding({ quote: quote(60) })],
    });
    data.tables.transaction = [
      makeTransaction({ amount: 17_17, date: '2026-10-02', note: 'TX-NOTE-789' }),
    ];
    const json = JSON.stringify(snap(data));

    for (const note of ['SECRET-NOTE-123', 'other-note', 'INCOME-NOTE-456', 'TX-NOTE-789']) {
      expect(json).not.toContain(note);
    }
    expect(json).not.toContain('SUB-NOTE');
    expect(json).not.toContain('Streamflix');
    expect(json).not.toContain('KO');
    expect(json).not.toContain('Coca-Cola');
    for (const row of Object.values(data.tables).flat()) {
      if (row.id.length > 8) expect(json).not.toContain(row.id);
    }
    for (const amount of ['1337', '2468', '1717']) expect(json).not.toContain(amount);
    for (const date of ['2026-10-02', '2026-10-03', '2026-10-04']) {
      expect(json).not.toContain(date);
    }
    // The month's food is there only as one total.
    expect(snap(data).spentByCategory.food).toBe(38_05);
  });

  it('adds up the totals the advisor is told', () => {
    const card = makeDebt({
      openingBalance: 230_00,
      openingDate: '2026-06-01',
      dueDay: 21,
      payInFull: true,
    });
    const data = world({
      cash: 5_000_00,
      savings: 3_000_00,
      expenses: [
        ...history(300_00),
        makeExpense({ amount: 100_00, category: 'food', date: '2026-10-03' }),
        makeExpense({ amount: 60_00, category: 'entertainment', date: '2026-10-05' }),
      ],
      incomes: [
        makeIncome({ amount: 3_000_00, date: '2026-10-01' }),
        makeIncome({ amount: 500_00, date: '2026-10-25', status: 'expected' }),
        makeIncome({ amount: 999_00, date: '2026-10-10', status: 'skipped' }),
        makeIncome({ amount: 1_000_00, date: '2026-09-30' }),
      ],
      limits: [
        makeLimit({ category: 'food', period: 'weekly', amount: 150_00 }),
        makeLimit({ category: 'entertainment', period: 'monthly', amount: 200_00 }),
      ],
      goals: [
        makeGoal({ name: 'Emergency fund', kind: 'emergency', target: 1_000_00, current: 900_00 }),
        makeGoal({
          name: 'Bike',
          kind: 'savings',
          target: 1_200_00,
          current: 450_00,
          deadline: '2027-02-14',
        }),
      ],
      debts: [card],
      subscriptions: [makeSubscription({ amount: 15_99, nextRenewal: '2026-10-20' })],
      holdings: [
        makeHolding({
          type: 'stock',
          shares: 10,
          quote: quote(60),
          dividendInfo: {
            history: [],
            nextExDate: null,
            nextPayDate: '2026-11-20',
            nextAmount: 1,
            fetchedAt: '2026-10-14T08:00:00.000Z',
          },
        }),
        makeHolding({ symbol: 'VTI', type: 'etf', shares: 5, quote: quote(100) }),
        makeHolding({ symbol: 'GLD', type: 'other', shares: 2, manualPrice: 25 }),
        makeHolding({ symbol: 'NOQ', type: 'stock', quote: null }),
      ],
    });
    data.tables.salaryFreeze = [
      {
        id: 'freeze-1',
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-01T09:00:00.000Z',
        start: '2026-10-10',
        end: '2026-10-20',
        lostAmount: 0,
        mode: 'manual',
        note: '',
      },
    ];

    const s = snap(data);

    expect(s).toMatchObject({
      currency: 'USD',
      monthIncome: 3_500_00,
      monthSpent: 160_00,
      spentByCategory: {
        food: 100_00,
        entertainment: 60_00,
        transport: 0,
        rent: 0,
        utilities: 0,
        health: 0,
        shopping: 0,
        other: 0,
      },
      cash: 5_000_00,
      savings: 3_000_00,
      available: 7_754_01,
      billsTotal: 245_99,
      freeze: { active: true, until: '2026-10-20' },
      debts: { total: 230_00, cardsDue: 230_00 },
      investments: {
        value: 1_150_00,
        byType: { stock: 600_00, etf: 500_00, other: 50_00 },
      },
      emergencyFund: 900_00,
      avgMonthlySpend: 300_00,
      emergencyMonths: 3,
      cardBalance: null,
      similar: [],
    });
    expect(s.limits).toEqual([
      {
        scope: 'entertainment',
        period: 'month',
        limit: 200_00,
        spent: 60_00,
        resetsOn: '2026-11-01',
      },
      { scope: 'food', period: 'week', limit: 150_00, spent: 0, resetsOn: '2026-10-19' },
    ]);
    expect(s.goals).toEqual([
      { name: 'Emergency fund', target: 1_000_00, saved: 900_00, deadline: null },
      { name: 'Bike', target: 1_200_00, saved: 450_00, deadline: '2027-02-14' },
    ]);
    expect(s.dividendsYear).toBe(projectedAnnual(data, 'USD', TODAY));
    expect(s.dividendsYear).toBeGreaterThan(0);
  });

  it('has no freeze, no goals and no holdings to report when there are none', () => {
    expect(snap()).toMatchObject({
      freeze: { active: false, until: null },
      goals: [],
      limits: [],
      debts: { total: 0, cardsDue: 0 },
      investments: { value: 0, byType: { stock: 0, etf: 0, other: 0 } },
      dividendsYear: 0,
    });
  });

  it('starts a weekly limit over on the day the week begins', () => {
    const limits = [makeLimit({ category: 'food', period: 'weekly', amount: 150_00 })];
    expect(snap(world({ limits })).limits[0]!.resetsOn).toBe('2026-10-19');
    expect(snap(world({ limits, weekStartsOn: 0 })).limits[0]!.resetsOn).toBe('2026-10-18');
  });

  it('tells overall limits apart from category ones', () => {
    const limits = [makeLimit({ scope: 'overall', category: null, period: 'monthly' })];
    expect(snap(world({ limits })).limits[0]).toMatchObject({ scope: 'overall', period: 'month' });
  });

  it('shows emergency months as null with no spending history', () => {
    const s = snap(world({ savings: 3_000_00 }));
    expect(s.emergencyMonths).toBeNull();
    expect(s.avgMonthlySpend).toBe(0);
    expect(s.emergencyFund).toBe(3_000_00);
  });

  it('counts the savings bucket as the emergency fund unless an emergency goal says otherwise', () => {
    const base = { savings: 900_00, expenses: history(300_00) };
    expect(snap(world(base)).emergencyMonths).toBe(3);
    const goal = makeGoal({ kind: 'emergency', current: 600_00 });
    const later = makeGoal({ kind: 'emergency', current: 100_00 });
    const custom = makeGoal({ kind: 'custom', current: 100_00 });
    const s = snap(world({ ...base, goals: [custom, goal, later] }));
    expect(s.emergencyFund).toBe(600_00);
    expect(s.emergencyMonths).toBe(2);
    expect(
      snap(world({ ...base, goals: [makeGoal({ kind: 'emergency', current: 0 })] }))
        .emergencyMonths,
    ).toBe(0);
  });

  it('averages the last 3 full months of spending, and no others', () => {
    const at = (date: string, amount: number) =>
      makeExpense({ date, amount, paymentMethod: 'other' });
    const s = snap(
      world({
        savings: 100_00,
        expenses: [
          at('2026-06-30', 9_999_00), // four months back
          at('2026-07-01', 100_00),
          at('2026-09-30', 200_00),
          at('2026-10-01', 9_999_00), // this month, not a full one
        ],
      }),
    );
    expect(s.avgMonthlySpend).toBe(100_00);
    expect(s.emergencyMonths).toBe(1);
  });

  it('reads the balance of the card the ask pays with, and no other', () => {
    const visa = makeDebt({ openingBalance: 50_00, openingDate: '2026-06-01' });
    const amex = makeDebt({ openingBalance: 75_00, openingDate: '2026-06-01' });
    const data = world({ debts: [visa, amex] });
    expect(snap(data, makeBuyAsk({ payWith: 'credit_card', cardId: amex.id })).cardBalance).toBe(
      75_00,
    );
    expect(snap(data, makeBuyAsk({ payWith: 'debit', cardId: null })).cardBalance).toBeNull();
    expect(
      snap(data, makeBuyAsk({ payWith: 'credit_card', cardId: 'gone' })).cardBalance,
    ).toBeNull();
  });

  it('finds similar past decisions by shared word or category, newest 10', () => {
    const past = (
      item: string,
      createdAt: string,
      over: Partial<PastDecision['ask']> = {},
      rest: Partial<PastDecision> = {},
    ): PastDecision => ({
      ask: makeBuyAsk({ item, category: 'shopping', ...over }),
      verdict: 'wait',
      status: 'skipped',
      usage: null,
      createdAt,
      ...rest,
    });
    const mine = makeBuyAsk({ item: 'Wireless Headphones', category: 'entertainment' });
    const decisions: PastDecision[] = [
      past('Headphones case', '2026-05-01T10:00:00.000Z', { price: 20_00 }),
      past(
        'Noise cancelling HEADPHONES',
        '2026-06-01T10:00:00.000Z',
        { price: 250_00 },
        { usage: 4, status: 'bought', verdict: 'buy' },
      ),
      past('Garden hose', '2026-07-01T10:00:00.000Z'), // nothing shared
      past('TV mount', '2026-07-02T10:00:00.000Z', {}), // "tv" is under 3 letters
      past('Cinema night', '2026-07-03T10:00:00.000Z', { category: 'entertainment' }), // same category
      past('Wirelessly charged lamp', '2026-07-04T10:00:00.000Z'), // "wirelessly" is not "wireless"
    ];
    const s = snap(world(), mine, decisions);
    expect(s.similar).toEqual([
      { item: 'Cinema night', price: 100_00, verdict: 'wait', status: 'skipped', usage: null },
      {
        item: 'Noise cancelling HEADPHONES',
        price: 250_00,
        verdict: 'buy',
        status: 'bought',
        usage: 4,
      },
      { item: 'Headphones case', price: 20_00, verdict: 'wait', status: 'skipped', usage: null },
    ]);

    const many = Array.from({ length: 12 }, (_, i) =>
      past(`Headphones ${i}`, `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`),
    );
    const newest = snap(world(), mine, many).similar.map((x) => x.item);
    expect(newest).toHaveLength(10);
    expect(newest[0]).toBe('Headphones 11');
    expect(newest[9]).toBe('Headphones 2');
  });

  it('weighs a past decision at its whole price, quantity included', () => {
    const decisions: PastDecision[] = [
      {
        ask: makeBuyAsk({ item: 'Headphones', price: 30_00, quantity: 3 }),
        verdict: 'buy',
        status: 'bought',
        usage: 5,
        createdAt: '2026-06-01T10:00:00.000Z',
      },
    ];
    expect(snap(world(), ask, decisions).similar[0]!.price).toBe(90_00);
  });
});
