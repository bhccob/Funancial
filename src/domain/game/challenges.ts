import { addDays, type LocalDate } from '../dates';
import type { Challenge, ChallengeKind } from '../entities';
import type { DataSnapshot } from '../snapshot';
import { createSpendIndex, localDay, type SpendIndex } from './activity';
import { CHALLENGE_REWARDS } from './rules';
import type { Award, GameContext, Reward } from './types';

export const CHALLENGES: readonly { kind: ChallengeKind; title: string; description: string }[] = [
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
];

const titleOf = (kind: ChallengeKind): string =>
  CHALLENGES.find((c) => c.kind === kind)?.title ?? kind;

export type ChallengeOutcome = 'active' | 'won' | 'lost' | 'abandoned';

export type ChallengeView = {
  challenge: Challenge;
  title: string;
  outcome: ChallengeOutcome;
  /** Progress so far: days, subscriptions or (for the sprint) minor units of money. */
  current: number;
  target: number;
  detail: string;
  reward: Reward;
};

const ledgerKey = (id: string) => `challenge:${id}`;

/** The days from `start` to `end`, inclusive; none if `end` is before `start`. */
function daysBetween(start: LocalDate, end: LocalDate): LocalDate[] {
  const days: LocalDate[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

function emergencyTotals(data: DataSnapshot): { current: number; target: number } {
  let current = 0;
  let target = 0;
  for (const goal of data.tables.goal) {
    if (goal.kind !== 'emergency') continue;
    current += goal.current;
    target += goal.target;
  }
  return { current, target };
}

/** The Saturday of the weekend a challenge started `today` is about: this one if it is on, else the next. */
function weekendStart(today: LocalDate): LocalDate {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(today, weekday === 0 ? -1 : 6 - weekday);
}

/** Why `kind` cannot be started now, or `null` if it can. */
export function startRequirement(
  kind: ChallengeKind,
  data: DataSnapshot,
  ctx: GameContext,
): string | null {
  if (challengeViews(data, ctx).some((v) => v.challenge.kind === kind && v.outcome === 'active')) {
    return 'This challenge is already running.';
  }
  if (
    kind === 'subscription-audit' &&
    !data.tables.subscription.some((s) => s.status === 'active')
  ) {
    return 'Add a subscription first.';
  }
  if (kind === 'budget-30' && data.tables.budgetLimit.length === 0) return 'Set a limit first.';
  if (kind === 'emergency-sprint' && !data.tables.goal.some((g) => g.kind === 'emergency')) {
    return 'Add an emergency fund goal first.';
  }
  return null;
}

/** A challenge starting now. The caller supplies the id; the time is the context's. */
export function newChallenge(
  kind: ChallengeKind,
  data: DataSnapshot,
  ctx: GameContext,
  id: string,
): Challenge {
  const { today } = ctx;
  const base = { id, createdAt: ctx.now, updatedAt: ctx.now, kind, baseline: null, goal: null };
  const active = { status: 'active' } as const;
  switch (kind) {
    case 'no-spend-weekend': {
      const start = weekendStart(today);
      return { ...base, ...active, start, end: addDays(start, 1) };
    }
    case 'subscription-audit':
      return { ...base, ...active, start: today, end: addDays(today, 6) };
    case 'budget-30':
      return { ...base, ...active, start: today, end: addDays(today, 29) };
    case 'emergency-sprint': {
      const { current, target } = emergencyTotals(data);
      return {
        ...base,
        ...active,
        start: today,
        end: addDays(today, 29),
        baseline: current,
        goal: Math.max(1, Math.round(target / 10)),
      };
    }
  }
}

/** Where a challenge stands on its own terms, before the ledger and `abandoned` are considered. */
type Standing = {
  current: number;
  target: number;
  won: boolean;
  lost: boolean;
  detail: { active: string; won: string; lost: string };
};

function noSpendWeekend(c: Challenge, data: DataSnapshot, ctx: GameContext): Standing {
  const spentOn = new Set<LocalDate>();
  for (const e of data.tables.expense) {
    if (e.subscriptionId === null) spentOn.add(e.date);
  }
  const days = daysBetween(c.start, c.end);
  const lost = days.some((day) => spentOn.has(day));
  const current = days.filter((day) => day <= ctx.today && !spentOn.has(day)).length;
  return {
    current,
    target: days.length,
    won: !lost && ctx.today > c.end,
    lost,
    detail: {
      active:
        ctx.today < c.start
          ? 'Starts Saturday'
          : `${current} of ${days.length} days with nothing logged`,
      won: 'Nothing logged all weekend.',
      lost: 'Something was logged this weekend. Try again next weekend.',
    },
  };
}

function subscriptionAudit(c: Challenge, data: DataSnapshot, ctx: GameContext): Standing {
  const active = data.tables.subscription.filter((s) => s.status === 'active');
  const since = Date.parse(c.createdAt);
  // Reviewed in time: marked after the challenge began and no later than its last day.
  const audited = active.filter(
    (s) =>
      s.auditedAt !== null && Date.parse(s.auditedAt) >= since && localDay(s.auditedAt) <= c.end,
  );
  const won = active.length > 0 && audited.length === active.length;
  return {
    current: audited.length,
    target: active.length,
    won,
    lost: !won && ctx.today > c.end,
    detail: {
      active:
        active.length === 0
          ? 'Add a subscription to review.'
          : `${audited.length} of ${active.length} reviewed`,
      won: 'Every subscription reviewed.',
      lost: 'The 7 days are up. Start another audit any time.',
    },
  };
}

function budget30(c: Challenge, spend: SpendIndex, ctx: GameContext): Standing {
  const days = daysBetween(c.start, c.end);
  const elapsed = days.filter((day) => day <= ctx.today);
  const over = elapsed.filter((day) => spend.overOn(day)).length;
  const lost = over > 0;
  const current = elapsed.length - over;
  return {
    current,
    target: days.length,
    won: !lost && ctx.today > c.end,
    lost,
    detail: {
      active:
        current === 0 ? 'Starts today' : `Day ${current} of ${days.length}, within every limit`,
      won: `${days.length} days within every limit.`,
      lost: 'Went over a limit. Start again whenever you like.',
    },
  };
}

function emergencySprint(c: Challenge, data: DataSnapshot, ctx: GameContext): Standing {
  const goal = c.goal ?? 1;
  const added = emergencyTotals(data).current - (c.baseline ?? 0);
  const won = added >= goal && ctx.today <= c.end;
  const current = Math.min(Math.max(added, 0), goal);
  return {
    current,
    target: goal,
    won,
    lost: !won && ctx.today > c.end,
    detail: {
      active: `${Math.floor((current * 100) / goal)}% of the way there`,
      won: 'Goal reached. Nice work.',
      lost: 'The 30 days are up. You can start another sprint.',
    },
  };
}

function standingOf(
  c: Challenge,
  data: DataSnapshot,
  ctx: GameContext,
  spend: SpendIndex,
): Standing {
  switch (c.kind) {
    case 'no-spend-weekend':
      return noSpendWeekend(c, data, ctx);
    case 'subscription-audit':
      return subscriptionAudit(c, data, ctx);
    case 'budget-30':
      return budget30(c, spend, ctx);
    case 'emergency-sprint':
      return emergencySprint(c, data, ctx);
  }
}

/**
 * Every challenge the person has started, newest first. A challenge paid in the ledger is won for
 * good; one that was dropped is abandoned; the rest are worked out from the data.
 */
export function challengeViews(data: DataSnapshot, ctx: GameContext): ChallengeView[] {
  const paid = new Set(data.tables.ledger.map((e) => e.key));
  const spend = createSpendIndex(data, ctx.weekStartsOn);
  const newestFirst = [...data.tables.challenge].sort(
    (a, b) =>
      (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0) ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
  return newestFirst.map((challenge): ChallengeView => {
    const standing = standingOf(challenge, data, ctx, spend);
    const outcome: ChallengeOutcome = paid.has(ledgerKey(challenge.id))
      ? 'won'
      : challenge.status === 'abandoned'
        ? 'abandoned'
        : standing.won
          ? 'won'
          : standing.lost
            ? 'lost'
            : 'active';
    return {
      challenge,
      title: titleOf(challenge.kind),
      outcome,
      current: outcome === 'won' ? standing.target : standing.current,
      target: standing.target,
      detail:
        outcome === 'abandoned'
          ? 'Stopped. You can start it again any time.'
          : standing.detail[outcome],
      reward: CHALLENGE_REWARDS[challenge.kind],
    };
  });
}

/** One award for each challenge that was won. */
export function challengeAwards(data: DataSnapshot, ctx: GameContext): Award[] {
  return challengeViews(data, ctx)
    .filter((v) => v.outcome === 'won')
    .map((v) => ({
      key: ledgerKey(v.challenge.id),
      kind: 'challenge',
      title: v.title,
      label: `Challenge: ${v.title}`,
      ...v.reward,
    }));
}
