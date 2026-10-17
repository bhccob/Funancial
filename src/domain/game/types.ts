import type { LocalDate } from '../dates';

/** The moment a game step runs in. Time comes in here, never from `Date.now()`. */
export type GameContext = {
  today: LocalDate;
  now: string;
  weekStartsOn: 0 | 1;
  canBackUp: boolean;
};

export type Reward = { xp: number; coins: number };

export type AwardKind = 'log' | 'quest' | 'streak' | 'badge' | 'challenge';

export type Award = {
  key: string;
  kind: AwardKind;
  title: string;
  label: string;
  xp: number;
  coins: number;
};

export type StreakKind = 'logging' | 'no-overspend' | 'checkin' | 'dividend';

export type QuestId =
  | 'log-today'
  | 'week-limits'
  | 'week-checkin'
  | 'month-salary'
  | 'month-audit'
  | 'month-dividends'
  | 'month-backup';

export type BadgeId =
  | 'first-expense'
  | 'subscription-slayer'
  | 'limit-keeper'
  | 'freeze-master'
  | 'first-etf'
  | 'portfolio-pro'
  | 'first-dividend'
  | 'dividend-collector'
  | 'passive-income-pro'
  | 'smart-shopper'
  | 'impulse-controller'
  | 'budget-defender';

export type { ChallengeKind } from '../entities';
