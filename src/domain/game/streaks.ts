import { addDays, type LocalDate } from '../dates';
import type { StreakFreeze } from '../entities';
import { monthKey, weekRange } from '../periods';
import type { DataSnapshot } from '../snapshot';
import { activeDays, confirmedDividends, createSpendIndex } from './activity';
import { STREAK_MILESTONES } from './rules';
import type { Award, GameContext, StreakKind } from './types';

export type StreakView = {
  kind: StreakKind;
  title: string;
  unit: 'day' | 'week' | 'month';
  /** The run's length: days (weeks for check-ins, months for dividends) kept in a row. */
  count: number;
  /** Whether the streak is being tracked: no overspending waits for a first limit, dividends for a holding. */
  active: boolean;
  /** Whether today (this week, this month) has already kept the streak. */
  doneThisPeriod: boolean;
  /** Freezes held that can still be spent; `null` for a streak freezes do not apply to. */
  tokens: number | null;
  /** The first day (week, month) of the run, as its first day; `null` when `count` is 0. */
  runStart: LocalDate | null;
};

type FreezableStreak = 'logging' | 'checkin';

const TITLES: Record<StreakKind, string> = {
  logging: 'Daily logging',
  'no-overspend': 'No overspending',
  checkin: 'Weekly check-in',
  dividend: 'Dividend streak',
};

/**
 * The periods a streak is kept in, as `LocalDate` strings: days for logging, week starts for
 * check-ins. `current` is today's period, which is still open; `step` is the days between periods.
 */
type Periods = { step: 1 | 7; current: LocalDate; kept: Set<LocalDate> };

function periodsFor(data: DataSnapshot, ctx: GameContext, streak: FreezableStreak): Periods {
  const frozen = data.tables.streakFreeze.filter((f) => f.streak === streak).map((f) => f.date);
  if (streak === 'logging') {
    return { step: 1, current: ctx.today, kept: new Set([...activeDays(data), ...frozen]) };
  }
  const weekStart = (day: LocalDate) => weekRange(day, ctx.weekStartsOn).start;
  const kept = new Set<LocalDate>();
  for (const c of data.tables.checkIn) {
    if (c.kind === 'weekly') kept.add(weekStart(c.date));
  }
  for (const date of frozen) kept.add(weekStart(date));
  return { step: 7, current: weekStart(ctx.today), kept };
}

/** The run of kept periods that ends this period if it is kept, and otherwise the one before. */
function keptRun({ step, current, kept }: Periods) {
  const doneThisPeriod = kept.has(current);
  let count = 0;
  let runStart: LocalDate | null = null;
  for (
    let p = doneThisPeriod ? current : addDays(current, -step);
    kept.has(p);
    p = addDays(p, -step)
  ) {
    count += 1;
    runStart = p;
  }
  return { count, runStart, doneThisPeriod };
}

/** The freezes bought for `streak`, less the ones already spent. */
export function freezeTokensHeld(data: DataSnapshot, streak: FreezableStreak): number {
  const prefix = `shop:freeze-${streak}:`;
  const bought = data.tables.ledger.filter(
    (e) => e.kind === 'purchase' && e.key.startsWith(prefix),
  ).length;
  const spent = data.tables.streakFreeze.filter((f) => f.streak === streak).length;
  return Math.max(0, bought - spent);
}

function logging(data: DataSnapshot, ctx: GameContext): StreakView {
  return {
    kind: 'logging',
    title: TITLES.logging,
    unit: 'day',
    active: true,
    tokens: freezeTokensHeld(data, 'logging'),
    ...keptRun(periodsFor(data, ctx, 'logging')),
  };
}

function checkin(data: DataSnapshot, ctx: GameContext): StreakView {
  return {
    kind: 'checkin',
    title: TITLES.checkin,
    unit: 'week',
    active: true,
    tokens: freezeTokensHeld(data, 'checkin'),
    ...keptRun(periodsFor(data, ctx, 'checkin')),
  };
}

function noOverspend(data: DataSnapshot, ctx: GameContext): StreakView {
  const view = {
    kind: 'no-overspend',
    title: TITLES['no-overspend'],
    unit: 'day',
    tokens: null,
  } as const;
  const spend = createSpendIndex(data, ctx.weekStartsOn);
  if (!spend.limitsOn(ctx.today)) {
    return { ...view, active: false, count: 0, doneThisPeriod: false, runStart: null };
  }
  let count = 0;
  let runStart: LocalDate | null = null;
  // `limitsOn` stops the walk at the first day any limit existed.
  for (let day = ctx.today; spend.limitsOn(day) && !spend.overOn(day); day = addDays(day, -1)) {
    count += 1;
    runStart = day;
  }
  return { ...view, active: true, count, doneThisPeriod: !spend.overOn(ctx.today), runStart };
}

/**
 * Calendar months in a row with a confirmed dividend, by the day it was paid: this month counts
 * once it has one, and the run otherwise ends last month. Tracked only with a holding, and there
 * are no freezes for it.
 */
export function dividendStreak(data: DataSnapshot, ctx: GameContext): StreakView {
  const view = { kind: 'dividend', title: TITLES.dividend, unit: 'month', tokens: null } as const;
  if (data.tables.holding.length === 0) {
    return { ...view, active: false, count: 0, doneThisPeriod: false, runStart: null };
  }
  const paid = new Set(confirmedDividends(data).map((d) => monthKey(d.paidOn)));
  const thisMonth = monthKey(ctx.today);
  const doneThisPeriod = paid.has(thisMonth);
  // The day before a month's first is in the month before.
  const before = (month: string) => monthKey(addDays(`${month}-01`, -1));
  let count = 0;
  let runStart: LocalDate | null = null;
  for (
    let month = doneThisPeriod ? thisMonth : before(thisMonth);
    paid.has(month);
    month = before(month)
  ) {
    count += 1;
    runStart = `${month}-01`;
  }
  return { ...view, active: true, count, doneThisPeriod, runStart };
}

/** The four streaks, in the order the app shows them: logging, no overspending, check-in, dividends. */
export function computeStreaks(data: DataSnapshot, ctx: GameContext): StreakView[] {
  return [
    logging(data, ctx),
    noOverspend(data, ctx),
    checkin(data, ctx),
    dividendStreak(data, ctx),
  ];
}

/**
 * The freezes to spend on `streak` now: one for every period missed between the last kept one and
 * the current one, but only when the tokens held cover all of them. Otherwise the streak breaks
 * and no token is spent.
 */
function usesFor(
  data: DataSnapshot,
  ctx: GameContext,
  streak: FreezableStreak,
  tokens: number,
): StreakFreeze[] {
  const { step, current, kept } = periodsFor(data, ctx, streak);
  let lastKept: LocalDate | null = null;
  for (const p of kept) {
    if (p < current && (lastKept === null || p > lastKept)) lastKept = p;
  }
  if (lastKept === null) return [];

  const missed: LocalDate[] = [];
  for (let p = addDays(lastKept, step); p < current; p = addDays(p, step)) {
    missed.push(p);
    if (missed.length > tokens) return [];
  }
  return missed.map((date) => ({
    id: `freeze:${streak}:${date}`,
    streak,
    date,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  }));
}

/** The freeze rows still to be written: logging first, then check-in, oldest first. */
export function freezeUsesDue(data: DataSnapshot, ctx: GameContext): StreakFreeze[] {
  return [
    ...usesFor(data, ctx, 'logging', freezeTokensHeld(data, 'logging')),
    ...usesFor(data, ctx, 'checkin', freezeTokensHeld(data, 'checkin')),
  ];
}

/** One award for every milestone each run has reached, so a new run earns them again. */
export function streakAwards(streaks: StreakView[]): Award[] {
  const awards: Award[] = [];
  for (const s of streaks) {
    if (s.runStart === null) continue;
    for (const { at, xp, coins } of STREAK_MILESTONES[s.kind]) {
      if (at > s.count) continue;
      const title = `${s.title}: ${at}-${s.unit} streak`;
      awards.push({
        key: `streak:${s.kind}:${s.runStart}:${at}`,
        kind: 'streak',
        title,
        label: title,
        xp,
        coins,
      });
    }
  }
  return awards;
}
