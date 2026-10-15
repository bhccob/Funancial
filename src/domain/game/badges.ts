import { endOfMonth, monthKey, monthsBetween } from '../periods';
import type { DataSnapshot } from '../snapshot';
import { anyOver, createSpendIndex, loggedEntries, localDay, type SpendIndex } from './activity';
import { BADGE_REWARDS } from './rules';
import type { Award, BadgeId, GameContext, Reward } from './types';

export const BADGES: readonly { id: BadgeId; name: string; description: string }[] = [
  { id: 'first-expense', name: 'First Expense Logged', description: 'Log your first expense.' },
  {
    id: 'subscription-slayer',
    name: 'Subscription Slayer',
    description: "Cancel a subscription you don't need.",
  },
  {
    id: 'limit-keeper',
    name: 'Limit Keeper',
    description: 'Finish a calendar month without going over any limit.',
  },
  {
    id: 'freeze-master',
    name: 'Freeze Master',
    description: 'Get through a salary freeze without going over any limit.',
  },
];

export type BadgeView = {
  id: BadgeId;
  name: string;
  description: string;
  /** When the badge was awarded; `null` while it is not earned yet. */
  earnedAt: string | null;
  reward: Reward;
};

const badgeKey = (id: BadgeId) => `badge:${id}`;

/** Every badge, with when it was earned. A badge in the ledger is earned for good. */
export function badgeViews(data: DataSnapshot): BadgeView[] {
  return BADGES.map((badge) => ({
    ...badge,
    earnedAt: data.tables.ledger.find((e) => e.key === badgeKey(badge.id))?.createdAt ?? null,
    reward: BADGE_REWARDS[badge.id],
  }));
}

type Condition = (data: DataSnapshot, ctx: GameContext, spend: SpendIndex) => boolean;

/** A calendar month that has closed, with a limit in force on its first day and none ever over. */
const limitKeeper: Condition = (data, ctx, spend) => {
  const firstLimit = data.tables.budgetLimit.map((l) => localDay(l.createdAt)).sort()[0];
  if (firstLimit === undefined) return false;
  for (const key of monthsBetween(monthKey(firstLimit), monthKey(ctx.today))) {
    const start = `${key}-01`;
    const end = endOfMonth(start);
    if (end >= ctx.today) break;
    if (spend.limitsOn(start) && !anyOver(spend, start, end)) return true;
  }
  return false;
};

const CONDITIONS: Record<BadgeId, Condition> = {
  'first-expense': (data) => loggedEntries(data).some((e) => e.table === 'expense'),
  'subscription-slayer': (data) => data.tables.subscription.some((s) => s.status === 'cancelled'),
  'limit-keeper': limitKeeper,
  'freeze-master': (data, ctx, spend) =>
    data.tables.salaryFreeze.some(
      (f) => f.end < ctx.today && spend.limitsOn(f.start) && !anyOver(spend, f.start, f.end),
    ),
};

/** The badges whose condition holds and that are not in the ledger yet. */
export function badgeAwards(data: DataSnapshot, ctx: GameContext): Award[] {
  const inLedger = new Set(data.tables.ledger.map((e) => e.key));
  const spend = createSpendIndex(data, ctx.weekStartsOn);
  return BADGES.filter(
    (badge) => !inLedger.has(badgeKey(badge.id)) && CONDITIONS[badge.id](data, ctx, spend),
  ).map((badge) => ({
    key: badgeKey(badge.id),
    kind: 'badge',
    title: badge.name,
    label: `Badge: ${badge.name}`,
    ...BADGE_REWARDS[badge.id],
  }));
}
