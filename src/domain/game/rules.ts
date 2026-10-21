import type { BadgeId, ChallengeKind, QuestId, Reward, StreakKind } from './types';

/** XP for each logged expense, and how many logged expenses in one local day still earn it. */
export const LOG_XP = 10;
export const LOG_CAP_PER_DAY = 5;

export const QUEST_REWARDS: Record<QuestId, Reward> = {
  'log-today': { xp: 20, coins: 5 },
  'week-limits': { xp: 60, coins: 15 },
  'week-checkin': { xp: 40, coins: 10 },
  'month-salary': { xp: 100, coins: 25 },
  'month-audit': { xp: 100, coins: 25 },
  'month-dividends': { xp: 80, coins: 20 },
};

/** Reached when a run gets to `at` days (weeks for check-ins, months for dividends). */
export type StreakMilestone = Reward & { at: number };

const DAILY_MILESTONES: readonly StreakMilestone[] = [
  { at: 7, xp: 50, coins: 10 },
  { at: 30, xp: 150, coins: 40 },
  { at: 100, xp: 400, coins: 100 },
  { at: 365, xp: 1000, coins: 250 },
];

export const STREAK_MILESTONES: Record<StreakKind, readonly StreakMilestone[]> = {
  logging: DAILY_MILESTONES,
  'no-overspend': DAILY_MILESTONES,
  checkin: [
    { at: 4, xp: 60, coins: 15 },
    { at: 12, xp: 200, coins: 50 },
    { at: 52, xp: 800, coins: 200 },
  ],
  dividend: [
    { at: 3, xp: 60, coins: 15 },
    { at: 6, xp: 150, coins: 40 },
    { at: 12, xp: 400, coins: 100 },
  ],
};

export const BADGE_REWARDS: Record<BadgeId, Reward> = {
  'first-expense': { xp: 50, coins: 10 },
  'subscription-slayer': { xp: 100, coins: 25 },
  'limit-keeper': { xp: 150, coins: 40 },
  'first-etf': { xp: 100, coins: 25 },
  'portfolio-pro': { xp: 150, coins: 40 },
  'first-dividend': { xp: 100, coins: 25 },
  'dividend-collector': { xp: 150, coins: 40 },
  'passive-income-pro': { xp: 200, coins: 50 },
};

export const CHALLENGE_REWARDS: Record<ChallengeKind, Reward> = {
  'no-spend-weekend': { xp: 120, coins: 30 },
  'subscription-audit': { xp: 120, coins: 30 },
  'budget-30': { xp: 400, coins: 100 },
  'emergency-sprint': { xp: 250, coins: 60 },
  'portfolio-checkup': { xp: 120, coins: 30 },
};
