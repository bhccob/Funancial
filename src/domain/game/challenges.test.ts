import { describe, expect, it } from 'vitest';
import {
  localIso,
  makeChallenge,
  makeExpense,
  makeGoal,
  makeLedgerEntry,
  makeLimit,
  makeSubscription,
} from '@/test/fixtures';
import type { Challenge } from '../entities';
import { emptySnapshot, type DataSnapshot } from '../snapshot';
import {
  CHALLENGES,
  challengeAwards,
  challengeViews,
  newChallenge,
  startRequirement,
  type ChallengeView,
} from './challenges';
import type { GameContext } from './types';

// 2026-10-15 is a Thursday, so the weekend is 10-17 (Saturday) and 10-18 (Sunday).
const ctxOn = (today: string): GameContext => ({
  today,
  now: localIso(today, 9),
  weekStartsOn: 1,
  canBackUp: true,
});
const ctx = ctxOn('2026-10-15');

function snap(tables: Partial<DataSnapshot['tables']>): DataSnapshot {
  const base = emptySnapshot();
  return { ...base, tables: { ...base.tables, ...tables } };
}

/** The one view of `challenge` on `today`. */
function viewOn(challenge: Challenge, tables: Partial<DataSnapshot['tables']>, today: string) {
  const [view] = challengeViews(snap({ challenge: [challenge], ...tables }), ctxOn(today));
  if (!view) throw new Error('no view');
  return view;
}

const outcomeOf = (v: ChallengeView) => [v.outcome, v.current, v.target];

/** A logged food expense dated `day`. */
const spent = (day: string, amount = 12_50) =>
  makeExpense({ date: day, amount, category: 'food', createdAt: localIso(day) });

const weekend = (overrides: Partial<Challenge> = {}) =>
  makeChallenge({
    kind: 'no-spend-weekend',
    start: '2026-10-17',
    end: '2026-10-18',
    createdAt: localIso('2026-10-15', 9),
    ...overrides,
  });

const audit = (overrides: Partial<Challenge> = {}) =>
  makeChallenge({
    kind: 'subscription-audit',
    start: '2026-10-15',
    end: '2026-10-21',
    createdAt: localIso('2026-10-15', 9),
    ...overrides,
  });

const budget30 = (overrides: Partial<Challenge> = {}) =>
  makeChallenge({
    kind: 'budget-30',
    start: '2026-10-15',
    end: '2026-11-13',
    createdAt: localIso('2026-10-15', 9),
    ...overrides,
  });

const sprint = (overrides: Partial<Challenge> = {}) =>
  makeChallenge({
    kind: 'emergency-sprint',
    start: '2026-10-15',
    end: '2026-11-13',
    baseline: 500_00,
    goal: 150_00,
    createdAt: localIso('2026-10-15', 9),
    ...overrides,
  });

/** A monthly limit of 1000.00 on everything, in force since October began. */
const monthlyLimit = () =>
  makeLimit({
    scope: 'overall',
    category: null,
    period: 'monthly',
    amount: 1000_00,
    createdAt: localIso('2026-10-01'),
  });

describe('CHALLENGES', () => {
  it('lists the four challenges', () => {
    expect(CHALLENGES).toEqual([
      {
        kind: 'no-spend-weekend',
        title: 'No-Spend Weekend',
        description: 'Log no spending this coming Saturday and Sunday.',
      },
      {
        kind: 'subscription-audit',
        title: 'Subscription Audit',
        description: 'Review every subscription within 7 days.',
      },
      {
        kind: 'budget-30',
        title: '30-Day Budget Streak',
        description: 'Stay within every limit for 30 days.',
      },
      {
        kind: 'emergency-sprint',
        title: 'Emergency Fund Sprint',
        description: 'Add 10% of your emergency fund target within 30 days.',
      },
    ]);
  });
});

describe('startRequirement', () => {
  it('says why a challenge cannot start', () => {
    const empty = snap({});
    expect(startRequirement('no-spend-weekend', empty, ctx)).toBeNull();
    expect(startRequirement('subscription-audit', empty, ctx)).toBe('Add a subscription first.');
    expect(startRequirement('budget-30', empty, ctx)).toBe('Set a limit first.');
    expect(startRequirement('emergency-sprint', empty, ctx)).toBe(
      'Add an emergency fund goal first.',
    );

    // A cancelled subscription and a savings goal do not count.
    expect(
      startRequirement(
        'subscription-audit',
        snap({ subscription: [makeSubscription({ status: 'cancelled' })] }),
        ctx,
      ),
    ).toBe('Add a subscription first.');
    expect(
      startRequirement('emergency-sprint', snap({ goal: [makeGoal({ kind: 'savings' })] }), ctx),
    ).toBe('Add an emergency fund goal first.');

    expect(
      startRequirement('subscription-audit', snap({ subscription: [makeSubscription()] }), ctx),
    ).toBeNull();
    expect(startRequirement('budget-30', snap({ budgetLimit: [makeLimit()] }), ctx)).toBeNull();
    expect(startRequirement('emergency-sprint', snap({ goal: [makeGoal()] }), ctx)).toBeNull();
  });

  it('refuses a second challenge of a kind while one is running', () => {
    const running = snap({ challenge: [weekend()], budgetLimit: [makeLimit()] });
    expect(startRequirement('no-spend-weekend', running, ctx)).toBe(
      'This challenge is already running.',
    );
    // Another kind is unaffected.
    expect(startRequirement('budget-30', running, ctx)).toBeNull();

    const running30 = snap({ challenge: [budget30()], budgetLimit: [monthlyLimit()] });
    expect(startRequirement('budget-30', running30, ctx)).toBe(
      'This challenge is already running.',
    );
  });

  it('lets a finished or abandoned challenge be started again', () => {
    // The weekend of 10-03 has passed with nothing logged: won, not running.
    const past = weekend({ start: '2026-10-03', end: '2026-10-04' });
    expect(startRequirement('no-spend-weekend', snap({ challenge: [past] }), ctx)).toBeNull();
    const abandoned = weekend({ status: 'abandoned' });
    expect(startRequirement('no-spend-weekend', snap({ challenge: [abandoned] }), ctx)).toBeNull();
  });
});

describe('newChallenge', () => {
  it('sets the weekend window from any day', () => {
    const windowOn = (today: string) => {
      const c = newChallenge('no-spend-weekend', snap({}), ctxOn(today), 'c1');
      return [c.start, c.end];
    };
    expect(windowOn('2026-10-12')).toEqual(['2026-10-17', '2026-10-18']); // Monday
    expect(windowOn('2026-10-15')).toEqual(['2026-10-17', '2026-10-18']); // Thursday
    expect(windowOn('2026-10-16')).toEqual(['2026-10-17', '2026-10-18']); // Friday
    expect(windowOn('2026-10-17')).toEqual(['2026-10-17', '2026-10-18']); // Saturday
    expect(windowOn('2026-10-18')).toEqual(['2026-10-17', '2026-10-18']); // Sunday
    expect(windowOn('2026-10-19')).toEqual(['2026-10-24', '2026-10-25']); // next Monday
  });

  it('stamps the challenge with the caller id and the context time', () => {
    expect(newChallenge('no-spend-weekend', snap({}), ctx, 'c1')).toEqual({
      id: 'c1',
      createdAt: ctx.now,
      updatedAt: ctx.now,
      kind: 'no-spend-weekend',
      start: '2026-10-17',
      end: '2026-10-18',
      baseline: null,
      goal: null,
      status: 'active',
    });
  });

  it('sets 7- and 30-day windows', () => {
    const windowOf = (kind: Challenge['kind']) => {
      const c = newChallenge(kind, snap({}), ctx, 'c1');
      return [c.start, c.end];
    };
    expect(windowOf('subscription-audit')).toEqual(['2026-10-15', '2026-10-21']);
    expect(windowOf('budget-30')).toEqual(['2026-10-15', '2026-11-13']);
    expect(windowOf('emergency-sprint')).toEqual(['2026-10-15', '2026-11-13']);
    const audit7 = newChallenge('subscription-audit', snap({}), ctx, 'c1');
    expect([audit7.baseline, audit7.goal]).toEqual([null, null]);
  });

  it('sets the sprint baseline and goal', () => {
    const data = snap({
      goal: [
        makeGoal({ current: 300_00, target: 1_000_00 }),
        makeGoal({ current: 200_00, target: 500_00 }),
        makeGoal({ kind: 'savings', current: 999_00, target: 9_999_00 }),
      ],
    });
    const c = newChallenge('emergency-sprint', data, ctx, 'c1');
    expect(c.baseline).toBe(500_00);
    expect(c.goal).toBe(150_00);
  });

  it('never sets a sprint goal below one minor unit', () => {
    const data = snap({ goal: [makeGoal({ current: 0, target: 4 })] });
    expect(newChallenge('emergency-sprint', data, ctx, 'c1').goal).toBe(1);
  });
});

describe('no-spend weekend', () => {
  it('waits for the weekend, then counts clean days', () => {
    expect(outcomeOf(viewOn(weekend(), {}, '2026-10-15'))).toEqual(['active', 0, 2]);
    expect(outcomeOf(viewOn(weekend(), {}, '2026-10-17'))).toEqual(['active', 1, 2]);
    expect(outcomeOf(viewOn(weekend(), {}, '2026-10-18'))).toEqual(['active', 2, 2]);
  });

  it('loses a no-spend weekend at the first logged expense and wins after a clean one', () => {
    const lostOnSaturday = viewOn(weekend(), { expense: [spent('2026-10-17')] }, '2026-10-17');
    expect(outcomeOf(lostOnSaturday)).toEqual(['lost', 0, 2]);
    // The loss stays after the weekend is over.
    expect(viewOn(weekend(), { expense: [spent('2026-10-18')] }, '2026-10-20').outcome).toBe(
      'lost',
    );

    expect(outcomeOf(viewOn(weekend(), {}, '2026-10-19'))).toEqual(['won', 2, 2]);
  });

  it('ignores subscription charges and spending outside the weekend', () => {
    const outside = [spent('2026-10-16'), spent('2026-10-19')];
    const charge = makeExpense({ date: '2026-10-17', subscriptionId: 'sub-1' });
    expect(viewOn(weekend(), { expense: [...outside, charge] }, '2026-10-19').outcome).toBe('won');
  });
});

describe('subscription audit', () => {
  it('wins a subscription audit once every active subscription is reviewed', () => {
    const a = makeSubscription({ id: 'a', auditedAt: null });
    const b = makeSubscription({ id: 'b', auditedAt: null });
    const none = viewOn(audit(), { subscription: [a, b] }, '2026-10-16');
    expect(outcomeOf(none)).toEqual(['active', 0, 2]);

    const one = { ...a, auditedAt: localIso('2026-10-16') };
    expect(outcomeOf(viewOn(audit(), { subscription: [one, b] }, '2026-10-16'))).toEqual([
      'active',
      1,
      2,
    ]);

    const both = [one, { ...b, auditedAt: localIso('2026-10-17') }];
    expect(outcomeOf(viewOn(audit(), { subscription: both }, '2026-10-17'))).toEqual(['won', 2, 2]);
  });

  it('does not count an audit mark from before the challenge began', () => {
    const old = makeSubscription({ auditedAt: localIso('2026-10-14') });
    expect(outcomeOf(viewOn(audit(), { subscription: [old] }, '2026-10-16'))).toEqual([
      'active',
      0,
      1,
    ]);
  });

  it('ignores cancelled subscriptions and needs at least one active', () => {
    const cancelled = makeSubscription({ status: 'cancelled' });
    expect(outcomeOf(viewOn(audit(), { subscription: [cancelled] }, '2026-10-16'))).toEqual([
      'active',
      0,
      0,
    ]);
    const done = makeSubscription({ auditedAt: localIso('2026-10-16') });
    expect(outcomeOf(viewOn(audit(), { subscription: [cancelled, done] }, '2026-10-16'))).toEqual([
      'won',
      1,
      1,
    ]);
  });

  it('is lost when the seven days pass unfinished', () => {
    const sub = makeSubscription({ auditedAt: null });
    expect(viewOn(audit(), { subscription: [sub] }, '2026-10-21').outcome).toBe('active');
    expect(viewOn(audit(), { subscription: [sub] }, '2026-10-22').outcome).toBe('lost');
  });
});

describe('30-day budget streak', () => {
  it('loses the 30-day streak on the first day over and wins after 30 clean days', () => {
    const data = { budgetLimit: [monthlyLimit()] };
    expect(outcomeOf(viewOn(budget30(), data, '2026-10-15'))).toEqual(['active', 1, 30]);
    expect(outcomeOf(viewOn(budget30(), data, '2026-10-19'))).toEqual(['active', 5, 30]);

    const over = { ...data, expense: [spent('2026-10-20', 1500_00)] };
    expect(outcomeOf(viewOn(budget30(), over, '2026-10-19'))).toEqual(['active', 5, 30]);
    expect(viewOn(budget30(), over, '2026-10-20').outcome).toBe('lost');
    // Later clean days (a new month) do not bring it back.
    expect(viewOn(budget30(), over, '2026-11-14').outcome).toBe('lost');

    // The last day is still part of the run; the day after wins it.
    expect(outcomeOf(viewOn(budget30(), data, '2026-11-13'))).toEqual(['active', 30, 30]);
    expect(outcomeOf(viewOn(budget30(), data, '2026-11-14'))).toEqual(['won', 30, 30]);
  });
});

describe('emergency sprint', () => {
  const goalAt = (current: number) => makeGoal({ current, target: 1_000_00 });

  it('wins the sprint as soon as enough is added', () => {
    // Baseline 500.00 across the goals; the goal is 150.00 more.
    const goals = (a: number, b: number) => ({
      goal: [goalAt(a), makeGoal({ current: b, target: 500_00 })],
    });
    expect(outcomeOf(viewOn(sprint(), goals(300_00, 200_00), '2026-10-16'))).toEqual([
      'active',
      0,
      150_00,
    ]);
    expect(outcomeOf(viewOn(sprint(), goals(380_00, 220_00), '2026-10-16'))).toEqual([
      'active',
      100_00,
      150_00,
    ]);
    expect(outcomeOf(viewOn(sprint(), goals(380_00, 270_00), '2026-10-16'))).toEqual([
      'won',
      150_00,
      150_00,
    ]);
    // On the last day it still counts.
    expect(viewOn(sprint(), goals(380_00, 270_00), '2026-11-13').outcome).toBe('won');
  });

  it('is lost when the 30 days pass short, even if the money arrives later', () => {
    const short = { goal: [goalAt(380_00), makeGoal({ current: 220_00, target: 500_00 })] };
    expect(outcomeOf(viewOn(sprint(), short, '2026-11-14'))).toEqual(['lost', 100_00, 150_00]);
    const late = { goal: [goalAt(400_00), makeGoal({ current: 300_00, target: 500_00 })] };
    expect(viewOn(sprint(), late, '2026-11-14').outcome).toBe('lost');
  });

  it('does not count money taken out as progress', () => {
    const withdrawn = { goal: [goalAt(200_00), makeGoal({ current: 100_00, target: 500_00 })] };
    expect(outcomeOf(viewOn(sprint(), withdrawn, '2026-10-16'))).toEqual(['active', 0, 150_00]);
  });
});

describe('abandoned and won challenges', () => {
  it('pays nothing for an abandoned challenge', () => {
    const abandoned = weekend({ status: 'abandoned' });
    // A clean weekend, long over: it would be won if it had not been dropped.
    const view = viewOn(abandoned, {}, '2026-10-20');
    expect(view.outcome).toBe('abandoned');
    expect(challengeAwards(snap({ challenge: [abandoned] }), ctxOn('2026-10-20'))).toEqual([]);
  });

  it('keeps a won challenge won', () => {
    const challenge = budget30({ id: 'c-won' });
    const data = {
      budgetLimit: [monthlyLimit()],
      expense: [spent('2026-10-20', 1500_00)],
      ledger: [makeLedgerEntry({ key: 'challenge:c-won', xp: 400, coins: 100 })],
    };
    const view = viewOn(challenge, data, '2026-10-25');
    expect(view.outcome).toBe('won');
    expect([view.current, view.target]).toEqual([30, 30]);
  });

  it('keeps a won challenge won even after it was abandoned', () => {
    const challenge = weekend({ id: 'c-won', status: 'abandoned' });
    const ledger = [makeLedgerEntry({ key: 'challenge:c-won' })];
    expect(viewOn(challenge, { ledger }, '2026-10-20').outcome).toBe('won');
  });
});

describe('challengeViews', () => {
  it('lists the newest challenge first, with its title and reward', () => {
    const older = weekend({ id: 'older', createdAt: localIso('2026-10-01') });
    const newer = budget30({ id: 'newer', createdAt: localIso('2026-10-14') });
    const views = challengeViews(
      snap({ challenge: [older, newer], budgetLimit: [monthlyLimit()] }),
      ctx,
    );
    expect(views.map((v) => v.challenge.id)).toEqual(['newer', 'older']);
    expect(views[0]).toMatchObject({
      title: '30-Day Budget Streak',
      reward: { xp: 400, coins: 100 },
    });
    expect(views[1]).toMatchObject({
      title: 'No-Spend Weekend',
      reward: { xp: 120, coins: 30 },
    });
  });

  it('describes each outcome in plain words', () => {
    const lost = viewOn(weekend(), { expense: [spent('2026-10-17')] }, '2026-10-18');
    expect(lost.detail).not.toBe('');
    const won = viewOn(weekend(), {}, '2026-10-19');
    expect(won.detail).not.toBe('');
    expect(won.detail).not.toBe(lost.detail);
  });

  it('returns nothing when there are no challenges', () => {
    expect(challengeViews(snap({}), ctx)).toEqual([]);
  });
});

describe('challengeAwards', () => {
  it('awards a won challenge once, keyed by its id', () => {
    const won = weekend({ id: 'c1' });
    const awards = challengeAwards(snap({ challenge: [won] }), ctxOn('2026-10-19'));
    expect(awards).toEqual([
      {
        key: 'challenge:c1',
        kind: 'challenge',
        title: 'No-Spend Weekend',
        label: 'Challenge: No-Spend Weekend',
        xp: 120,
        coins: 30,
      },
    ]);
  });

  it('awards nothing for a running or lost challenge', () => {
    const running = weekend({ id: 'c1' });
    expect(challengeAwards(snap({ challenge: [running] }), ctx)).toEqual([]);
    expect(
      challengeAwards(
        snap({ challenge: [running], expense: [spent('2026-10-17')] }),
        ctxOn('2026-10-19'),
      ),
    ).toEqual([]);
  });
});
