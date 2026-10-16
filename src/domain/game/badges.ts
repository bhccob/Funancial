import { minorDigits } from '../money';
import { endOfMonth, monthKey, monthsBetween } from '../periods';
import type { DataSnapshot } from '../snapshot';
import {
  anyOver,
  confirmedDividends,
  createSpendIndex,
  loggedEntries,
  localDay,
  type SpendIndex,
} from './activity';
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
  { id: 'first-etf', name: 'First ETF', description: 'Add an ETF to your portfolio.' },
  { id: 'portfolio-pro', name: 'Portfolio Pro', description: 'Hold five or more investments.' },
  { id: 'first-dividend', name: 'First Dividend', description: 'Confirm your first dividend.' },
  { id: 'dividend-collector', name: 'Dividend Collector', description: 'Confirm 12 dividends.' },
  {
    id: 'passive-income-pro',
    name: 'Passive Income Pro',
    description: 'Collect 100 in dividends in one month.',
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

/** Confirmed dividends paid in one calendar month that add up to 100 in the profile currency. */
const passiveIncomePro: Condition = (data) => {
  const currency = data.tables.profile[0]?.currency;
  if (currency === undefined) return false;
  const target = 100 * 10 ** minorDigits(currency);
  const byMonth = new Map<string, number>();
  for (const d of confirmedDividends(data)) {
    const month = monthKey(d.paidOn);
    const total = (byMonth.get(month) ?? 0) + d.amount;
    if (total >= target) return true;
    byMonth.set(month, total);
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
  'first-etf': (data) => data.tables.holding.some((h) => h.type === 'etf'),
  'portfolio-pro': (data) => data.tables.holding.length >= 5,
  'first-dividend': (data) => confirmedDividends(data).length >= 1,
  'dividend-collector': (data) => confirmedDividends(data).length >= 12,
  'passive-income-pro': passiveIncomePro,
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
