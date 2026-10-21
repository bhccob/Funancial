import { describe, expect, it } from 'vitest';
import {
  localIso,
  makeChallenge,
  makeDividend,
  makeExpense,
  makeHolding,
  makeLedgerEntry,
  makeSettings,
  makeStreakFreeze,
} from '@/test/fixtures';
import { addDays, type LocalDate } from '../dates';
import type { LedgerEntry } from '../entities';
import { emptySnapshot, type DataSnapshot } from '../snapshot';
import { applyRecords } from '../sync';
import { computeGameView, gameUpdates } from './engine';
import { purchaseEntry } from './shop';
import type { GameContext } from './types';

// 2026-10-15 is a Thursday, so with weeks starting Monday the current week starts 2026-10-12.
const today = '2026-10-15';
const ctx: GameContext = { today, now: localIso(today, 18), weekStartsOn: 1 };

function snap(tables: Partial<DataSnapshot['tables']>): DataSnapshot {
  const base = emptySnapshot();
  return { ...base, tables: { ...base.tables, ...tables } };
}

/** An expense logged at noon on `day`, dated `day`. */
const loggedOn = (day: LocalDate, id: string) =>
  makeExpense({ id, date: day, createdAt: localIso(day) });

const oneExpenseToday = () => snap({ expense: [loggedOn(today, 'e1')] });

const ledgerIds = (records: ReturnType<typeof gameUpdates>['records']) =>
  records.filter((r) => r.table === 'ledger').map((r) => r.record.id);

describe('gameUpdates', () => {
  it('pays the first expense: logging, the daily quest and a badge', () => {
    const { records, gain } = gameUpdates(oneExpenseToday(), ctx);

    expect(records.map((r) => r.record.id)).toEqual([
      'log:expense:e1#0',
      'quest:log-today:2026-10-15#0',
      'badge:first-expense#0',
    ]);
    expect(records.every((r) => r.table === 'ledger')).toBe(true);
    expect(records.map((r) => r.record.createdAt)).toEqual([ctx.now, ctx.now, ctx.now]);
    expect(gain).toEqual({
      xp: 80,
      coins: 15,
      levelBefore: 1,
      levelAfter: 1,
      tierChanged: false,
      rewards: [
        { kind: 'quest', title: "Log today's spending", xp: 20, coins: 5 },
        { kind: 'badge', title: 'First Expense Logged', xp: 50, coins: 10 },
      ],
    });
  });

  it('changes nothing on a second run', () => {
    const data = oneExpenseToday();
    const applied = applyRecords(data, gameUpdates(data, ctx).records);
    expect(gameUpdates(applied, ctx)).toEqual({ records: [], gain: null });
  });

  it('has nothing to say for an empty snapshot', () => {
    expect(gameUpdates(emptySnapshot(), ctx)).toEqual({ records: [], gain: null });
  });

  it('reverses only logging when the expense is deleted', () => {
    const data = oneExpenseToday();
    const applied = applyRecords(data, gameUpdates(data, ctx).records);
    const deleted = { ...applied, tables: { ...applied.tables, expense: [] } };

    const { records, gain } = gameUpdates(deleted, ctx);
    expect(records).toEqual([
      {
        table: 'ledger',
        record: {
          id: 'log:expense:e1#1',
          createdAt: ctx.now,
          updatedAt: ctx.now,
          key: 'log:expense:e1',
          kind: 'reversal',
          xp: -10,
          coins: 0,
          label: 'Removed: Logged an expense',
        },
      },
    ]);
    expect(gain).toBeNull();

    // The quest and the badge are kept, and the settled ledger asks for nothing more.
    const settled = applyRecords(deleted, records);
    expect(gameUpdates(settled, ctx)).toEqual({ records: [], gain: null });
    expect(computeGameView(settled, ctx).totals).toEqual({ xp: 70, coins: 15 });
  });

  it('never touches a purchase', () => {
    const data = snap({
      expense: [loggedOn(today, 'e1')],
      ledger: [purchaseEntry('avatar-rocket', 'p1', localIso('2026-10-01'))],
    });
    const { records } = gameUpdates(data, ctx);
    expect(ledgerIds(records)).toEqual([
      'log:expense:e1#0',
      'quest:log-today:2026-10-15#0',
      'badge:first-expense#0',
    ]);
  });

  it('keeps the XP and coins of a badge that is no longer on offer', () => {
    // Smart Shopper went with Buy it?, Freeze Master with Salary freeze: an award stays in the
    // ledger and is never taken back.
    const award = makeLedgerEntry({
      id: 'badge:smart-shopper#0',
      key: 'badge:smart-shopper',
      kind: 'award',
      xp: 100,
      coins: 25,
      label: 'Badge: Smart Shopper',
    });
    const data = snap({ ledger: [award] });
    expect(gameUpdates(data, ctx)).toEqual({ records: [], gain: null });
    expect(computeGameView(data, ctx).totals).toEqual({ xp: 100, coins: 25 });
  });

  it('keeps the XP and coins of a Freeze Master badge earned before Salary freeze went', () => {
    const award = makeLedgerEntry({
      id: 'badge:freeze-master#0',
      key: 'badge:freeze-master',
      kind: 'award',
      xp: 150,
      coins: 40,
      label: 'Badge: Freeze Master',
    });
    const data = snap({ ledger: [award] });
    expect(gameUpdates(data, ctx)).toEqual({ records: [], gain: null });
    const view = computeGameView(data, ctx);
    expect(view.totals).toEqual({ xp: 150, coins: 40 });
    expect(view.badges.map((b) => b.id)).not.toContain('freeze-master');
  });

  it('spends freezes and counts them in the same run', () => {
    // Logged on the 9th to the 12th and today; the 13th and 14th were missed, and two freezes are held.
    const days: LocalDate[] = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', today];
    const data = snap({
      expense: days.map((day) => loggedOn(day, `e-${day}`)),
      ledger: [
        purchaseEntry('freeze-logging', 'p1', localIso('2026-10-01')),
        purchaseEntry('freeze-logging', 'p2', localIso('2026-10-01')),
      ],
    });

    const { records, gain } = gameUpdates(data, ctx);

    expect(records.slice(0, 2)).toEqual([
      {
        table: 'streakFreeze',
        record: {
          id: 'freeze:logging:2026-10-13',
          streak: 'logging',
          date: '2026-10-13',
          createdAt: ctx.now,
          updatedAt: ctx.now,
        },
      },
      {
        table: 'streakFreeze',
        record: {
          id: 'freeze:logging:2026-10-14',
          streak: 'logging',
          date: '2026-10-14',
          createdAt: ctx.now,
          updatedAt: ctx.now,
        },
      },
    ]);
    // The frozen days keep the run alive to a 7-day streak that starts on the 9th.
    expect(ledgerIds(records)).toContain('streak:logging:2026-10-09:7#0');
    expect(gain?.rewards).toContainEqual({
      kind: 'streak',
      title: 'Daily logging: 7-day streak',
      xp: 50,
      coins: 10,
    });
    // Five logs at 10 XP, the daily quest, the badge and the streak milestone.
    expect(gain).toMatchObject({ xp: 50 + 20 + 50 + 50, coins: 5 + 10 + 10 });

    const applied = applyRecords(data, records);
    expect(applied.tables.streakFreeze).toHaveLength(2);
    expect(gameUpdates(applied, ctx)).toEqual({ records: [], gain: null });
  });

  it('does not spend a freeze that was already spent', () => {
    const data = snap({
      expense: [loggedOn('2026-10-12', 'e1'), loggedOn(today, 'e2')],
      ledger: [
        purchaseEntry('freeze-logging', 'p1', localIso('2026-10-01')),
        purchaseEntry('freeze-logging', 'p2', localIso('2026-10-01')),
      ],
      streakFreeze: [
        makeStreakFreeze({ id: 'freeze:logging:2026-10-13', date: '2026-10-13' }),
        makeStreakFreeze({ id: 'freeze:logging:2026-10-14', date: '2026-10-14' }),
      ],
    });
    expect(gameUpdates(data, ctx).records.every((r) => r.table === 'ledger')).toBe(true);
  });

  it('pays a won challenge', () => {
    // The weekend of the 17th and 18th is over with nothing logged.
    const monday = '2026-10-19';
    const data = snap({
      challenge: [
        makeChallenge({
          id: 'c1',
          kind: 'no-spend-weekend',
          start: '2026-10-17',
          end: '2026-10-18',
          createdAt: localIso('2026-10-15', 9),
        }),
      ],
    });
    const { records, gain } = gameUpdates(data, {
      ...ctx,
      today: monday,
      now: localIso(monday, 9),
    });
    expect(ledgerIds(records)).toEqual(['challenge:c1#0']);
    expect(gain).toMatchObject({
      xp: 120,
      coins: 30,
      rewards: [{ kind: 'challenge', title: 'No-Spend Weekend', xp: 120, coins: 30 }],
    });
  });

  it('pays a confirmed dividend once: logging XP, two quests and its badges', () => {
    const data = snap({
      holding: [
        makeHolding({
          id: 'h1',
          type: 'etf',
          purchaseDate: '2026-01-01',
          // The payout of 12 October that the dividend below settles.
          dividendInfo: {
            history: [],
            nextExDate: '2026-10-05',
            nextPayDate: '2026-10-12',
            nextAmount: 1,
            fetchedAt: localIso('2026-10-05', 9),
          },
        }),
      ],
      dividend: [
        makeDividend({
          id: 'd1',
          holdingId: 'h1',
          expectedPayDate: '2026-10-12',
          paidOn: today,
          createdAt: localIso(today, 9),
        }),
      ],
    });
    const { records, gain } = gameUpdates(data, ctx);
    expect(ledgerIds(records)).toEqual([
      'log:dividend:d1#0',
      'quest:log-today:2026-10-15#0',
      'quest:month-dividends:2026-10#0',
      'badge:first-etf#0',
      'badge:first-dividend#0',
    ]);
    expect(gain?.rewards.map((r) => r.title)).toEqual([
      "Log today's spending",
      "Confirm this month's dividends",
      'First ETF',
      'First Dividend',
    ]);

    const applied = applyRecords(data, records);
    expect(gameUpdates(applied, ctx)).toEqual({ records: [], gain: null });

    // Deleting the dividend takes back the logging XP and keeps the badge.
    const deleted = { ...applied, tables: { ...applied.tables, dividend: [] } };
    expect(ledgerIds(gameUpdates(deleted, ctx).records)).toEqual(['log:dividend:d1#1']);
  });

  it('reports a level-up and a new tier', () => {
    // Level 11 begins at 11,746 XP, so 11,700 is level 10 and one expense (80 XP) tips it over.
    const data = snap({
      expense: [loggedOn(today, 'e1')],
      ledger: [
        makeLedgerEntry({ key: 'test-award', kind: 'award', xp: 11_700, coins: 0, label: 'Big' }),
      ],
    });
    expect(gameUpdates(data, ctx).gain).toMatchObject({
      xp: 80,
      levelBefore: 10,
      levelAfter: 11,
      tierChanged: true,
    });
  });

  it('keeps the tier when a level-up stays inside it', () => {
    const data = snap({
      expense: [loggedOn(today, 'e1')],
      ledger: [makeLedgerEntry({ key: 'test-award', kind: 'award', xp: 50, coins: 0 })],
    });
    expect(gameUpdates(data, ctx).gain).toMatchObject({
      levelBefore: 1,
      levelAfter: 2,
      tierChanged: false,
    });
  });
});

describe('computeGameView', () => {
  it('builds the view', () => {
    const ocean = purchaseEntry('theme-ocean', 'p1', localIso('2026-10-10'));
    const data = snap({
      expense: [loggedOn(today, 'e1')],
      ledger: [
        makeLedgerEntry({
          id: 'log:expense:e1#0',
          key: 'log:expense:e1',
          kind: 'award',
          xp: 10,
          coins: 200,
          createdAt: localIso('2026-10-09'),
        }),
        ocean,
      ],
      challenge: [makeChallenge({ id: 'c1', start: today, end: addDays(today, 1) })],
      settings: [
        makeSettings({
          cosmetics: { theme: 'theme-ocean', avatar: 'avatar-cat', frame: 'frame-none' },
        }),
      ],
    });

    const view = computeGameView(data, ctx);

    expect(view.totals).toEqual({ xp: 10, coins: 50 });
    expect(view.level).toMatchObject({ level: 1, tier: 'Bronze Saver', xpIntoLevel: 10 });
    expect(view.streaks.map((s) => s.kind)).toEqual([
      'logging',
      'no-overspend',
      'checkin',
      'dividend',
    ]);
    expect(view.badges.map((b) => b.id)).toEqual([
      'first-expense',
      'subscription-slayer',
      'limit-keeper',
      'first-etf',
      'portfolio-pro',
      'first-dividend',
      'dividend-collector',
      'passive-income-pro',
    ]);
    expect(view.quests.map((q) => q.id)).toEqual(['log-today', 'week-checkin']);
    expect(view.challenges.map((c) => c.challenge.id)).toEqual(['c1']);
    expect(view.owned).toEqual(
      new Set(['theme-violet', 'avatar-sprout', 'frame-none', 'theme-ocean']),
    );
    // The cat was never bought, so the avatar falls back to the sprout.
    expect(view.cosmetics).toEqual({
      theme: 'theme-ocean',
      avatar: 'avatar-sprout',
      frame: 'frame-none',
    });
    expect(view.history.map((e) => e.id)).toEqual([ocean.id, 'log:expense:e1#0']);
  });

  it('wears the defaults before settings exist', () => {
    expect(computeGameView(emptySnapshot(), ctx).cosmetics).toEqual({
      theme: 'theme-violet',
      avatar: 'avatar-sprout',
      frame: 'frame-none',
    });
  });

  describe('history', () => {
    const entry = (n: number, createdAt: string): LedgerEntry =>
      makeLedgerEntry({ id: `e${n}#0`, key: `e${n}`, createdAt, updatedAt: createdAt });

    it('is the last 30 entries, newest first, whatever order the ledger comes in', () => {
      const day = (n: number) => localIso(addDays('2026-08-01', n));
      const entries = Array.from({ length: 33 }, (_, n) => entry(n, day(n)));
      // The store hands rows back in no particular order.
      const shuffled = [...entries.slice(10), ...entries.slice(0, 10)].reverse();

      const { history } = computeGameView(snap({ ledger: shuffled }), ctx);

      expect(history).toHaveLength(30);
      expect(history[0]?.id).toBe('e32#0');
      expect(history[29]?.id).toBe('e3#0');
      expect(history.map((e) => e.createdAt)).toEqual(
        entries
          .slice(3)
          .map((e) => e.createdAt)
          .reverse(),
      );
    });

    it('puts entries written at the same moment in reverse of the ledger order', () => {
      const at = localIso(today, 9);
      const ledger = [entry(1, at), entry(2, at), entry(3, at)];
      const ids = computeGameView(snap({ ledger }), ctx).history.map((e) => e.id);
      expect(ids).toEqual(['e3#0', 'e2#0', 'e1#0']);
    });

    it('does not reorder the snapshot it reads', () => {
      const ledger = [entry(1, localIso('2026-10-02')), entry(2, localIso('2026-10-01'))];
      computeGameView(snap({ ledger }), ctx);
      expect(ledger.map((e) => e.id)).toEqual(['e1#0', 'e2#0']);
    });
  });
});
