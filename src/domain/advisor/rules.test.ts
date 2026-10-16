import { describe, expect, it } from 'vitest';
import {
  makeAboutYou,
  makeBuyAsk,
  makeDebt,
  makeExpense,
  makeGoal,
  makeIncome,
  makeLimit,
  makeSubscription,
} from '@/test/fixtures';
import { history, TODAY, world } from '@/test/testWorld';
import { FactsSchema, type AboutYou, type BuyAsk } from '../entities';
import { analyse } from './rules';
import { buildSnapshot, type PastDecision } from './snapshot';

type Options = Parameters<typeof world>[0];

/** Builds the snapshot for `data` and analyses the ask against it. */
function run(
  o: Options = {},
  over: Partial<BuyAsk> = {},
  past: PastDecision[] = [],
  about?: AboutYou,
) {
  const ask = makeBuyAsk(over);
  return analyse(buildSnapshot(world(o), TODAY, ask, past), ask, TODAY, about);
}

const fun = (amount: number, period: 'weekly' | 'monthly' = 'monthly') =>
  makeLimit({ category: 'entertainment', period, amount });
const overall = (amount: number) =>
  makeLimit({ scope: 'overall', category: null, period: 'monthly', amount });
const funSpend = (amount: number, date = '2026-10-13') =>
  makeExpense({ amount, category: 'entertainment', date });

const pastDecision = (usage: number | null, over: Partial<BuyAsk> = {}): PastDecision => ({
  ask: makeBuyAsk({ item: 'Old headphones', ...over }),
  verdict: 'buy',
  status: 'bought',
  usage,
  createdAt: '2026-06-01T10:00:00.000Z',
});

describe('facts', () => {
  it('computes limits after, overage and the reset date for a Fun purchase', () => {
    const r = run(
      {
        expenses: [
          funSpend(80_00),
          makeExpense({ amount: 50_00, category: 'food', date: '2026-10-06' }),
        ],
        limits: [fun(100_00), overall(500_00)],
      },
      { price: 40_00 },
    );
    expect(r.facts).toMatchObject({
      total: 40_00,
      categoryAfter: { limit: 100_00, spentAfter: 120_00, pct: 120 },
      overallAfter: { limit: 500_00, spentAfter: 170_00, pct: 34 },
      overBy: 20_00,
      resetsOn: '2026-11-01',
    });
  });

  it('resets a weekly limit on the next week start', () => {
    const o = { expenses: [funSpend(80_00)], limits: [fun(100_00, 'weekly')] };
    expect(run(o, { price: 40_00 }).facts.resetsOn).toBe('2026-10-19');
    expect(run({ ...o, weekStartsOn: 0 }, { price: 40_00 }).facts.resetsOn).toBe('2026-10-18');
  });

  it('measures the tightest limit of a kind, and resets the one that is over by most', () => {
    const r = run(
      {
        expenses: [funSpend(80_00)],
        limits: [fun(100_00, 'weekly'), fun(50_00, 'monthly')],
      },
      { price: 40_00 },
    );
    expect(r.facts.categoryAfter).toEqual({ limit: 50_00, spentAfter: 120_00, pct: 240 });
    expect(r.facts.overBy).toBe(70_00);
    expect(r.facts.resetsOn).toBe('2026-11-01');
  });

  it('has no overage and no reset date while every limit holds', () => {
    const r = run(
      { expenses: [funSpend(20_00)], limits: [fun(100_00), overall(500_00)] },
      { price: 50_00 },
    );
    expect(r.facts).toMatchObject({ overBy: 0, resetsOn: null });
    expect(r.facts.categoryAfter).toEqual({ limit: 100_00, spentAfter: 70_00, pct: 70 });
  });

  it('falls back to the overall limit, or leaves the line out, when the category has none', () => {
    const food = makeLimit({ category: 'food', period: 'monthly', amount: 10_00 });
    const some = run({ limits: [food, overall(500_00)] }, { price: 100_00 });
    expect(some.facts.categoryAfter).toBeNull();
    expect(some.facts.overallAfter).toEqual({ limit: 500_00, spentAfter: 100_00, pct: 20 });

    const none = run({ limits: [food] }, { price: 100_00 });
    expect(none.facts).toMatchObject({
      categoryAfter: null,
      overallAfter: null,
      overBy: 0,
      resetsOn: null,
    });
    expect(none.meter).toBe(50);
    expect(Number.isNaN(none.meter)).toBe(false);
  });

  it('multiplies price by quantity', () => {
    const r = run(
      { expenses: [funSpend(10_00)], limits: [fun(100_00)], cash: 1_000_00 },
      { price: 30_00, quantity: 3 },
    );
    expect(r.facts.total).toBe(90_00);
    expect(r.facts.categoryAfter).toEqual({ limit: 100_00, spentAfter: 100_00, pct: 100 });
    expect(r.facts.availableAfter).toBe(1_000_00 - 90_00);
  });

  it("needs debt when cash + savings − bills can't cover it, or the card carries a balance", () => {
    const bills = {
      cash: 100_00,
      savings: 50_00,
      subscriptions: [makeSubscription({ amount: 30_00, nextRenewal: '2026-10-20' })],
    };
    expect(run(bills, { price: 130_00 }).facts.requiresDebt).toBe(true);
    expect(run(bills, { price: 120_00 }).facts.requiresDebt).toBe(false);
    expect(run(bills, { price: 119_99 }).facts.requiresDebt).toBe(false);

    const visa = makeDebt({ openingBalance: 50_00, openingDate: '2026-06-01' });
    const onCard = { payWith: 'credit_card' as const, cardId: visa.id, price: 10_00 };
    expect(run({ debts: [visa] }, onCard).facts.requiresDebt).toBe(true);
    expect(
      run({ debts: [visa] }, { ...onCard, payWith: 'debit', cardId: null }).facts.requiresDebt,
    ).toBe(false);
    const clear = makeDebt({ openingBalance: 0, openingDate: '2026-06-01' });
    expect(run({ debts: [clear] }, { ...onCard, cardId: clear.id }).facts.requiresDebt).toBe(false);
  });

  it('takes the purchase out of the emergency fund, and has no months without spending history', () => {
    const none = run({ savings: 3_000_00 });
    expect(none.facts).toMatchObject({ emergencyBefore: null, emergencyAfter: null });

    const r = run({ savings: 900_00, expenses: history(300_00) }, { price: 150_00 });
    expect(r.facts.emergencyBefore).toBe(3);
    expect(r.facts.emergencyAfter).toBe(2.5);
    const spent = run({ savings: 100_00, expenses: history(300_00) }, { price: 500_00 });
    expect(spent.facts.emergencyAfter).toBe(0);
  });

  it('delays the goal with the nearest unfinished deadline by what the purchase would have paid', () => {
    const bike = makeGoal({
      name: 'Bike',
      kind: 'savings',
      target: 1_200_00,
      current: 0,
      deadline: '2027-10-14',
    });
    // 12 months to go: 100.00 a month, 3.33 a day.
    expect(run({ goals: [bike] }, { price: 50_00 }).facts.goalDelay).toEqual({
      name: 'Bike',
      days: 15,
    });
    expect(run({ goals: [bike] }, { price: 40_00 }).facts.goalDelay).toEqual({
      name: 'Bike',
      days: 12,
    });

    const done = makeGoal({
      name: 'Done',
      kind: 'savings',
      target: 100_00,
      current: 100_00,
      deadline: '2026-11-01',
    });
    const later = makeGoal({
      name: 'Later',
      kind: 'savings',
      target: 1_200_00,
      current: 0,
      deadline: '2028-10-14',
    });
    const open = makeGoal({
      name: 'Open',
      kind: 'custom',
      target: 1_200_00,
      current: 0,
      deadline: null,
    });
    expect(run({ goals: [done, later, bike, open] }, { price: 50_00 }).facts.goalDelay?.name).toBe(
      'Bike',
    );
    expect(run({ goals: [done, open] }).facts.goalDelay).toBeNull();
    expect(run().facts.goalDelay).toBeNull();
  });

  it('gives facts the entities schema accepts', () => {
    const r = run({
      expenses: [funSpend(80_00), ...history(300_00)],
      limits: [fun(100_00), overall(500_00)],
      goals: [makeGoal({ kind: 'savings', target: 1_200_00, current: 0, deadline: '2027-10-14' })],
      savings: 900_00,
    });
    expect(FactsSchema.parse(r.facts)).toEqual(r.facts);
  });
});

describe('guards', () => {
  it('caps the meter at 66 when a guard fires, with the reason', () => {
    // A need, in no hurry, far inside its limit: 50 + 20 + 5 + 10 − 10 = 75 before the guards.
    const r = run(
      { cash: 100_00, limits: [overall(1_000_00)] },
      { urgency: 'need', howSoon: 'norush', price: 150_00 },
    );
    expect(r.guards).toEqual({
      capAtWait: true,
      reasons: ["Needs money you don't have", 'Leaves your available balance below zero'],
    });
    expect(r.meter).toBe(66);
    expect(r.verdict).toBe('wait');
  });

  it('caps a want, but not a need, that drops the emergency fund under a month', () => {
    const o = { savings: 100_00, expenses: history(300_00) };
    const want = run(o, { price: 20_00 });
    expect(want.guards).toEqual({
      capAtWait: true,
      reasons: ['Drops your emergency fund under a month'],
    });
    expect(run(o, { price: 20_00, urgency: 'treat' }).guards.capAtWait).toBe(true);
    expect(run(o, { price: 20_00, urgency: 'need' }).guards).toEqual({
      capAtWait: false,
      reasons: [],
    });
  });

  it('lets a purchase through when nothing is wrong', () => {
    expect(run().guards).toEqual({ capAtWait: false, reasons: [] });
  });
});

describe('meter', () => {
  const neutral = { cash: 5_000_00 };

  it('starts at 50 for a want in a month with nothing to weigh', () => {
    expect(run(neutral).meter).toBe(50);
  });

  it.each<[string, Options, Partial<BuyAsk>, number]>([
    ['a need', neutral, { urgency: 'need' }, 70],
    ['a treat', neutral, { urgency: 'treat' }, 40],
    ['a want needed today', neutral, { howSoon: 'today' }, 40],
    ['a treat wanted today', neutral, { urgency: 'treat', howSoon: 'today' }, 30],
    ['a need today', neutral, { urgency: 'need', howSoon: 'today' }, 70],
    ['no rush', neutral, { howSoon: 'norush' }, 55],
    ['an overall limit 10% used after', { ...neutral, limits: [overall(1_000_00)] }, {}, 60],
    ['a category limit 83% used after', { ...neutral, limits: [fun(120_00)] }, {}, 50],
    ['a category limit exactly 80% used after', { ...neutral, limits: [fun(125_00)] }, {}, 60],
    ['a category limit over after', { ...neutral, limits: [fun(50_00)] }, {}, 35],
    ['the overall limit over after', { ...neutral, limits: [overall(50_00)] }, {}, 30],
    ['both limits over after', { ...neutral, limits: [fun(50_00), overall(50_00)] }, {}, 15],
    [
      'one limit over and one far from it',
      { ...neutral, limits: [fun(50_00), overall(1_000_00)] },
      {},
      35,
    ],
    [
      'less than 10% of income left',
      { cash: 150_00, incomes: [makeIncome({ amount: 1_000_00, date: '2026-10-01' })] },
      {},
      40,
    ],
    [
      'exactly 10% of income left',
      { cash: 200_00, incomes: [makeIncome({ amount: 1_000_00, date: '2026-10-01' })] },
      {},
      50,
    ],
    [
      '3 months of cushion left',
      { cash: 5_000_00, savings: 1_000_00, expenses: history(300_00) },
      { price: 50_00 },
      60,
    ],
    [
      '2 months of cushion left',
      { cash: 5_000_00, savings: 600_00, expenses: history(300_00) },
      { price: 100_00 },
      50,
    ],
    [
      'under a month of cushion left',
      { cash: 5_000_00, savings: 200_00, expenses: history(300_00) },
      { price: 100_00 },
      35,
    ],
    [
      'more than 14 days of a goal',
      {
        ...neutral,
        goals: [
          makeGoal({ kind: 'savings', target: 1_200_00, current: 0, deadline: '2027-10-14' }),
        ],
      },
      { price: 50_00 },
      40,
    ],
    [
      '14 days of a goal',
      {
        ...neutral,
        goals: [
          makeGoal({ kind: 'savings', target: 1_200_00, current: 0, deadline: '2027-10-14' }),
        ],
      },
      { price: 46_66 },
      50,
    ],
  ])('scores %s', (_name, o, over, expected) => {
    expect(run(o, over).meter).toBe(expected);
  });

  it('scores history: a similar purchase rated 2 or less, or 4 or more', () => {
    expect(run(neutral, {}, [pastDecision(2)]).meter).toBe(40);
    expect(run(neutral, {}, [pastDecision(1)]).meter).toBe(40);
    expect(run(neutral, {}, [pastDecision(3)]).meter).toBe(50);
    expect(run(neutral, {}, [pastDecision(4)]).meter).toBe(55);
    expect(run(neutral, {}, [pastDecision(null)]).meter).toBe(50);
    expect(run(neutral, {}, [pastDecision(2), pastDecision(5)]).meter).toBe(45);
    expect(run(neutral, {}, [pastDecision(2), pastDecision(1)]).meter).toBe(40);
  });

  it('adds it all up: a need that is cheap, in no rush and well proven reaches 100', () => {
    const r = run(
      {
        cash: 5_000_00,
        savings: 1_000_00,
        expenses: history(300_00),
        limits: [overall(10_000_00)],
      },
      { urgency: 'need', howSoon: 'norush', price: 50_00 },
      [pastDecision(5)],
    );
    expect(r).toMatchObject({ meter: 100, verdict: 'buy', confidence: 'high' });
  });

  it('never goes below 0', () => {
    const r = run(
      {
        cash: 50_00,
        savings: 200_00,
        expenses: history(300_00),
        limits: [fun(10_00), overall(10_00)],
        goals: [
          makeGoal({ kind: 'savings', target: 1_200_00, current: 0, deadline: '2027-10-14' }),
        ],
        incomes: [makeIncome({ amount: 1_000_00, date: '2026-10-01' })],
      },
      { urgency: 'treat', howSoon: 'today', price: 100_00 },
      [pastDecision(1)],
    );
    expect(r.meter).toBe(0);
    expect(r.verdict).toBe('skip');
  });
});

describe('verdict', () => {
  it('maps the zones to buy, wait and skip', () => {
    // 85: a need, no rush, 10% of the limit.
    const buy = run({ limits: [overall(1_000_00)] }, { urgency: 'need', howSoon: 'norush' });
    expect(buy).toMatchObject({ meter: 85, verdict: 'buy' });
    expect(run().verdict).toBe('wait');
    const skip = run({}, { urgency: 'treat', howSoon: 'today' });
    expect(skip).toMatchObject({ meter: 30, verdict: 'skip' });
  });

  it('says look for a cheaper one when waiting and 60% of the price would fit every limit', () => {
    const o = { limits: [overall(100_00)] };
    // 50 + 5 − 20 = 35 → wait zone; over by 50.00; 60% of 150.00 is 90.00, which fits.
    const cheaper = run(o, { howSoon: 'norush', price: 150_00 });
    expect(cheaper).toMatchObject({ meter: 35, verdict: 'cheaper' });
    expect(cheaper.facts.overBy).toBe(50_00);
    // 60% of 200.00 is 120.00, which does not.
    expect(run(o, { howSoon: 'norush', price: 200_00 })).toMatchObject({
      meter: 35,
      verdict: 'wait',
    });
    // 60% of 100.00 fits the overall limit but not Fun's.
    const two = { limits: [overall(100_00), fun(50_00)] };
    expect(run(two, { howSoon: 'norush', price: 100_00 }).verdict).toBe('wait');
  });

  it('says wait, not cheaper, when the wait zone has nothing over a limit', () => {
    expect(
      run({ limits: [overall(1_000_00)] }, { urgency: 'treat', howSoon: 'month' }),
    ).toMatchObject({
      verdict: 'wait',
    });
  });

  it('says skip in the skip zone even when a cheaper one would fit', () => {
    const r = run(
      { limits: [overall(100_00)] },
      { urgency: 'treat', howSoon: 'norush', price: 150_00 },
    );
    expect(r).toMatchObject({ meter: 25, verdict: 'skip' });
  });
});

describe('About you', () => {
  const neutral = { cash: 5_000_00 };
  // 12 months to go: 100.00 a month, so a purchase slips it ceil(price × 30 / 100.00) days.
  const bike = makeGoal({
    id: 'bike',
    name: 'Bike',
    kind: 'savings',
    target: 1_200_00,
    current: 0,
    deadline: '2027-10-14',
  });
  // The nearer deadline, and the same 100.00 a month.
  const trip = makeGoal({
    id: 'trip',
    name: 'Trip',
    kind: 'savings',
    target: 600_00,
    current: 0,
    deadline: '2027-04-14',
  });
  const protectBike = makeAboutYou({ protectGoalId: 'bike' });
  const both = { ...neutral, goals: [trip, bike] };

  describe('overspend', () => {
    it('takes 10 off for a category you tend to overspend on, and says so', () => {
      const r = run(neutral, {}, [], makeAboutYou({ overspend: ['entertainment'] }));
      expect(r.meter).toBe(40);
      expect(r.notes).toEqual(['You said you tend to overspend on Fun.']);
    });

    it("names the category by the label the app shows, and only the one that's asked about", () => {
      const about = makeAboutYou({ overspend: ['shopping', 'food'] });
      const r = run(neutral, { category: 'shopping' }, [], about);
      expect(r.notes).toEqual(['You said you tend to overspend on Shopping.']);
      expect(r.meter).toBe(40);
    });

    it('changes nothing for another category, an empty list, or no About you at all', () => {
      const plain = run(neutral);
      expect(plain).toMatchObject({ meter: 50, notes: [] });
      const others = [undefined, makeAboutYou(), makeAboutYou({ overspend: ['food', 'shopping'] })];
      for (const about of others) expect(run(neutral, {}, [], about)).toEqual(plain);
    });

    it('counts a category listed twice once', () => {
      const twice = makeAboutYou({ overspend: ['entertainment', 'entertainment'] });
      const r = run(neutral, {}, [], twice);
      expect(r.meter).toBe(40);
      expect(r.notes).toEqual(['You said you tend to overspend on Fun.']);
    });
  });

  describe('the goal to protect', () => {
    it('measures that goal, not the nearest deadline, and takes 10 off above 7 days', () => {
      expect(run(both, { price: 40_00 }).facts.goalDelay).toEqual({ name: 'Trip', days: 12 });
      const r = run(both, { price: 40_00 }, [], protectBike);
      expect(r.facts.goalDelay).toEqual({ name: 'Bike', days: 12 });
      // 12 days is under the generic 14, so only the stricter rule bites.
      expect(r.meter).toBe(40);
    });

    it('is strict above 7 days and not at 7', () => {
      const at7 = run(both, { price: 23_33 }, [], protectBike);
      expect(at7).toMatchObject({ facts: { goalDelay: { days: 7 } }, meter: 50 });
      const at8 = run(both, { price: 23_34 }, [], protectBike);
      expect(at8).toMatchObject({ facts: { goalDelay: { days: 8 } }, meter: 40 });
    });

    it('takes 10 off once, in place of the generic rule, when both would apply', () => {
      const o = { ...neutral, goals: [bike] };
      // 15 days: over 14 and over 7.
      expect(run(o, { price: 50_00 }).meter).toBe(40);
      expect(run(o, { price: 50_00 }, [], protectBike).meter).toBe(40);
    });

    it.each<[string, string | null, Parameters<typeof makeGoal>[0]]>([
      ['no goal is chosen', null, {}],
      ['it was deleted', 'gone', {}],
      [
        'it is complete',
        'done',
        {
          id: 'done',
          name: 'Done',
          kind: 'savings',
          target: 100_00,
          current: 100_00,
          deadline: '2026-11-01',
        },
      ],
      [
        'it has no deadline',
        'open',
        { id: 'open', name: 'Open', kind: 'custom', target: 1_200_00, current: 0, deadline: null },
      ],
    ])('falls back to the nearest deadline and the generic rule when %s', (_n, id, extra) => {
      const goals = [makeGoal({ kind: 'savings', ...extra }), bike, trip];
      const about = makeAboutYou({ protectGoalId: id });
      const r = run({ ...neutral, goals }, { price: 40_00 }, [], about);
      expect(r.facts.goalDelay).toEqual({ name: 'Trip', days: 12 });
      expect(r.meter).toBe(50);
    });

    it('still applies the generic rule to the goal it falls back to', () => {
      const r = run(both, { price: 50_00 }, [], makeAboutYou({ protectGoalId: 'gone' }));
      expect(r.facts.goalDelay).toEqual({ name: 'Trip', days: 15 });
      expect(r.meter).toBe(40);
    });
  });

  describe('your own words', () => {
    it('shows back what matters, your situation and why you want it, and moves nothing', () => {
      const about = makeAboutYou({
        matters: 'Saving for a house deposit',
        situation: 'Rent a flat in Amsterdam',
      });
      const r = run(neutral, { why: 'for the commute' }, [], about);
      expect(r.notes).toEqual([
        'You said: Saving for a house deposit',
        'Rent a flat in Amsterdam',
        'You said: for the commute',
      ]);
      expect(r.meter).toBe(50);
    });

    it('leaves out words that are empty, or only spaces', () => {
      expect(run(neutral, { why: null }, [], makeAboutYou()).notes).toEqual([]);
      const blank = makeAboutYou({ matters: '  ', situation: ' \n' });
      expect(run(neutral, { why: '   ' }, [], blank).notes).toEqual([]);
      expect(run(neutral, { why: 'for the commute' }).notes).toEqual(['You said: for the commute']);
    });

    it('lists the overspend reason first, then the words', () => {
      const about = makeAboutYou({
        overspend: ['entertainment'],
        matters: 'A house',
        situation: 'A flat',
      });
      expect(run(neutral, { why: 'a sale' }, [], about).notes).toEqual([
        'You said you tend to overspend on Fun.',
        'You said: A house',
        'A flat',
        'You said: a sale',
      ]);
    });
  });

  it('still stops at 0 when every adjustment piles on', () => {
    const r = run(
      {
        cash: 50_00,
        savings: 200_00,
        expenses: history(300_00),
        limits: [fun(10_00), overall(10_00)],
        goals: [bike],
        incomes: [makeIncome({ amount: 1_000_00, date: '2026-10-01' })],
      },
      { urgency: 'treat', howSoon: 'today', price: 100_00 },
      [pastDecision(1)],
      makeAboutYou({ overspend: ['entertainment'], protectGoalId: 'bike' }),
    );
    expect(r.meter).toBe(0);
    expect(r.verdict).toBe('skip');
  });
});

describe('guards hold under every adjustment', () => {
  // 120.00 over 12 months is 10.00 a month: any purchase slips it by more than 7 days.
  const steep = makeGoal({
    id: 'steep',
    kind: 'savings',
    target: 120_00,
    current: 0,
    deadline: '2027-10-14',
  });
  const visa = makeDebt({ openingBalance: 50_00, openingDate: '2026-06-01' });
  const calm = { cash: 5_000_00, limits: [overall(10_000_00)], goals: [steep] };
  const all = ['need', 'want', 'treat'] as const;
  // A need is let through the emergency guard, so only wants and treats are tried there.
  const wants = ['want', 'treat'] as const;

  const scenarios: Array<[string, Options, Partial<BuyAsk>, ReadonlyArray<BuyAsk['urgency']>]> = [
    [
      'it needs debt',
      { ...calm, debts: [visa] },
      { payWith: 'credit_card', cardId: visa.id, price: 10_00 },
      all,
    ],
    ['it overdraws the available balance', { ...calm, cash: 100_00 }, { price: 150_00 }, all],
    [
      'it drops the emergency fund under a month',
      { ...calm, savings: 100_00, expenses: history(300_00) },
      { price: 20_00 },
      wants,
    ],
  ];

  it.each(scenarios)('never reaches buy when %s', (_name, o, over, urgencies) => {
    let tried = 0;
    for (const urgency of urgencies) {
      for (const howSoon of ['today', 'month', 'norush'] as const) {
        for (const past of [[], [pastDecision(5)], [pastDecision(1)]]) {
          for (const protectGoalId of [null, 'steep', 'gone']) {
            for (const overspend of [[], ['entertainment' as const], ['food' as const]]) {
              const about = makeAboutYou({ overspend, protectGoalId });
              const label = JSON.stringify({ urgency, howSoon, past: past.length, about });
              const r = run(o, { ...over, urgency, howSoon }, past, about);
              expect(r.guards.capAtWait, label).toBe(true);
              expect(r.meter, label).toBeLessThanOrEqual(66);
              expect(r.verdict, label).not.toBe('buy');
              tried++;
            }
          }
        }
      }
    }
    expect(tried).toBe(urgencies.length * 3 * 3 * 3 * 3);
  });

  it('reaches buy in the same world once nothing is guarded, so the table has teeth', () => {
    const best = { urgency: 'need', howSoon: 'norush', price: 10_00 } as const;
    const about = makeAboutYou({ overspend: ['entertainment'], protectGoalId: 'steep' });
    // 50 + 20 + 5 + 10 (far inside its limit) + 5 (rated 5) − 10 (overspend) − 10 (protected goal).
    const r = run(calm, best, [pastDecision(5)], about);
    expect(r).toMatchObject({ meter: 70, verdict: 'buy' });
    expect(r.guards.capAtWait).toBe(false);
  });
});
