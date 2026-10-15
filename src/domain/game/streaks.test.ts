import { describe, expect, it } from 'vitest';
import {
  localIso,
  makeCheckIn,
  makeExpense,
  makeLedgerEntry,
  makeLimit,
  makeStreakFreeze,
} from '@/test/fixtures';
import { addDays, type LocalDate } from '../dates';
import { emptySnapshot, type DataSnapshot } from '../snapshot';
import {
  computeStreaks,
  freezeTokensHeld,
  freezeUsesDue,
  streakAwards,
  type StreakView,
} from './streaks';
import type { GameContext, StreakKind } from './types';

// 2026-10-15 is a Thursday, so with weeks starting Monday the current week starts 2026-10-12.
const ctx: GameContext = {
  today: '2026-10-15',
  now: localIso('2026-10-15', 8),
  weekStartsOn: 1,
  canBackUp: false,
};

function snap(tables: Partial<DataSnapshot['tables']>): DataSnapshot {
  const base = emptySnapshot();
  return { ...base, tables: { ...base.tables, ...tables } };
}

function daysFrom(start: LocalDate, end: LocalDate): LocalDate[] {
  const days: LocalDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** One expense logged at noon on each of `days`. */
function loggedOn(days: readonly LocalDate[]) {
  return days.map((day) => makeExpense({ date: day, createdAt: localIso(day) }));
}

function purchases(streak: 'logging' | 'checkin', count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeLedgerEntry({
      key: `shop:freeze-${streak}:p${i}`,
      kind: 'purchase',
      xp: 0,
      coins: -20,
      label: 'Streak freeze',
    }),
  );
}

function streak(data: DataSnapshot, kind: StreakKind, c: GameContext = ctx): StreakView {
  const view = computeStreaks(data, c).find((s) => s.kind === kind);
  if (!view) throw new Error(`no ${kind} streak`);
  return view;
}

describe('computeStreaks', () => {
  it('lists the logging, no-overspend and check-in streaks, in that order', () => {
    const views = computeStreaks(snap({}), ctx);
    expect(views.map((v) => [v.kind, v.title, v.unit])).toEqual([
      ['logging', 'Daily logging', 'day'],
      ['no-overspend', 'No overspending', 'day'],
      ['checkin', 'Weekly check-in', 'week'],
    ]);
  });

  describe('daily logging', () => {
    it('counts the logging run through yesterday until today is done', () => {
      const through = daysFrom('2026-10-12', '2026-10-14');
      expect(streak(snap({ expense: loggedOn(through) }), 'logging')).toMatchObject({
        count: 3,
        active: true,
        doneThisPeriod: false,
        runStart: '2026-10-12',
      });

      const withToday = snap({ expense: loggedOn([...through, '2026-10-15']) });
      expect(streak(withToday, 'logging')).toMatchObject({
        count: 4,
        doneThisPeriod: true,
        runStart: '2026-10-12',
      });
    });

    it('counts a no-spend check-in as an active day', () => {
      const data = snap({
        expense: loggedOn(['2026-10-13']),
        checkIn: [makeCheckIn({ kind: 'no-spend', date: '2026-10-14' })],
      });
      expect(streak(data, 'logging')).toMatchObject({ count: 2, runStart: '2026-10-13' });
    });

    it('breaks after a missed day without freezes', () => {
      expect(streak(snap({ expense: loggedOn(['2026-10-12']) }), 'logging')).toMatchObject({
        count: 0,
        doneThisPeriod: false,
        runStart: null,
      });
      // Two days ago is not enough: the run must reach yesterday or today.
      expect(streak(snap({ expense: loggedOn(['2026-10-13']) }), 'logging').count).toBe(0);
      expect(streak(snap({}), 'logging')).toMatchObject({ count: 0, runStart: null });
    });

    it('counts only the run that ends now, not an older one', () => {
      const data = snap({
        expense: loggedOn([...daysFrom('2026-10-01', '2026-10-05'), '2026-10-14', '2026-10-15']),
      });
      expect(streak(data, 'logging')).toMatchObject({ count: 2, runStart: '2026-10-14' });
    });

    it('counts covered days and spends the tokens', () => {
      const data = snap({
        expense: loggedOn(daysFrom('2026-10-10', '2026-10-12')),
        ledger: purchases('logging', 2),
        streakFreeze: [
          makeStreakFreeze({ streak: 'logging', date: '2026-10-13' }),
          makeStreakFreeze({ streak: 'logging', date: '2026-10-14' }),
        ],
      });
      expect(streak(data, 'logging')).toMatchObject({
        count: 5,
        tokens: 0,
        doneThisPeriod: false,
        runStart: '2026-10-10',
      });
    });

    it('ignores check-in freezes', () => {
      const data = snap({
        expense: loggedOn(['2026-10-12']),
        streakFreeze: [
          makeStreakFreeze({ streak: 'checkin', date: '2026-10-13' }),
          makeStreakFreeze({ streak: 'checkin', date: '2026-10-14' }),
        ],
      });
      expect(streak(data, 'logging').count).toBe(0);
    });

    it('counts each day once across the daylight-saving change', () => {
      // Clocks change on 2026-10-25 in Europe and on 2026-11-01 in the United States.
      const europe = snap({ expense: loggedOn(['2026-10-24', '2026-10-25', '2026-10-26']) });
      expect(streak(europe, 'logging', { ...ctx, today: '2026-10-26' })).toMatchObject({
        count: 3,
        runStart: '2026-10-24',
      });

      const us = snap({ expense: loggedOn(['2026-10-31', '2026-11-01', '2026-11-02']) });
      expect(streak(us, 'logging', { ...ctx, today: '2026-11-02' })).toMatchObject({
        count: 3,
        runStart: '2026-10-31',
      });
    });

    it('reports the logging tokens held', () => {
      expect(streak(snap({ ledger: purchases('logging', 3) }), 'logging').tokens).toBe(3);
    });
  });

  describe('no overspending', () => {
    it('tracks no overspending only once a limit exists', () => {
      expect(streak(snap({}), 'no-overspend')).toEqual({
        kind: 'no-overspend',
        title: 'No overspending',
        unit: 'day',
        count: 0,
        active: false,
        doneThisPeriod: false,
        tokens: null,
        runStart: null,
      });

      const data = snap({
        budgetLimit: [
          makeLimit({
            scope: 'category',
            category: 'food',
            period: 'weekly',
            amount: 50_00,
            createdAt: localIso('2026-10-01'),
          }),
        ],
        expense: [makeExpense({ category: 'food', amount: 60_00, date: '2026-10-08' })],
      });
      // Over from 2026-10-08 to the end of that week (10-11); clear again from Monday 10-12.
      expect(streak(data, 'no-overspend')).toMatchObject({
        active: true,
        count: 4,
        runStart: '2026-10-12',
        doneThisPeriod: true,
        tokens: null,
      });
    });

    it('never counts days from before the first limit existed', () => {
      const data = snap({
        budgetLimit: [makeLimit({ amount: 50_00, createdAt: localIso('2026-10-13') })],
      });
      expect(streak(data, 'no-overspend')).toMatchObject({
        active: true,
        count: 3,
        runStart: '2026-10-13',
        doneThisPeriod: true,
      });
    });

    it('is back to 0 on a day the person is over a limit', () => {
      const data = snap({
        budgetLimit: [makeLimit({ amount: 50_00, createdAt: localIso('2026-10-01') })],
        expense: [makeExpense({ category: 'food', amount: 60_00, date: '2026-10-15' })],
      });
      expect(streak(data, 'no-overspend')).toMatchObject({
        active: true,
        count: 0,
        runStart: null,
        doneThisPeriod: false,
      });
    });
  });

  describe('weekly check-in', () => {
    it('counts check-in weeks and keeps this week open', () => {
      const lastTwo = [
        makeCheckIn({ kind: 'weekly', date: '2026-09-28' }),
        makeCheckIn({ kind: 'weekly', date: '2026-10-05' }),
      ];
      expect(streak(snap({ checkIn: lastTwo }), 'checkin')).toMatchObject({
        count: 2,
        active: true,
        doneThisPeriod: false,
        runStart: '2026-09-28',
        tokens: 0,
      });

      const withThisWeek = [...lastTwo, makeCheckIn({ kind: 'weekly', date: '2026-10-12' })];
      expect(streak(snap({ checkIn: withThisWeek }), 'checkin')).toMatchObject({
        count: 3,
        doneThisPeriod: true,
        runStart: '2026-09-28',
      });
    });

    it('does not count no-spend check-ins, and breaks after a missed week', () => {
      const data = snap({
        checkIn: [
          makeCheckIn({ kind: 'no-spend', date: '2026-10-12' }),
          makeCheckIn({ kind: 'weekly', date: '2026-09-28' }),
        ],
      });
      expect(streak(data, 'checkin')).toMatchObject({ count: 0, runStart: null });
    });

    it('counts a frozen week and spends the token', () => {
      const data = snap({
        checkIn: [
          makeCheckIn({ kind: 'weekly', date: '2026-09-21' }),
          makeCheckIn({ kind: 'weekly', date: '2026-10-05' }),
        ],
        ledger: purchases('checkin', 1),
        streakFreeze: [makeStreakFreeze({ streak: 'checkin', date: '2026-09-28' })],
      });
      expect(streak(data, 'checkin')).toMatchObject({
        count: 3,
        runStart: '2026-09-21',
        tokens: 0,
      });
    });

    it('puts a check-in in the week its date falls in', () => {
      const data = snap({ checkIn: [makeCheckIn({ kind: 'weekly', date: '2026-10-14' })] });
      expect(streak(data, 'checkin')).toMatchObject({
        count: 1,
        doneThisPeriod: true,
        runStart: '2026-10-12',
      });
    });

    it('starts weeks on Sunday when asked to', () => {
      // With Sunday weeks, Thursday 2026-10-15 is in the week that starts 2026-10-11.
      const data = snap({ checkIn: [makeCheckIn({ kind: 'weekly', date: '2026-10-11' })] });
      expect(streak(data, 'checkin', { ...ctx, weekStartsOn: 0 })).toMatchObject({
        count: 1,
        doneThisPeriod: true,
        runStart: '2026-10-11',
      });
    });
  });
});

describe('freezeTokensHeld', () => {
  it('is the purchases of that streak less the freezes already used', () => {
    const data = snap({
      ledger: [...purchases('logging', 3), ...purchases('checkin', 2)],
      streakFreeze: [
        makeStreakFreeze({ streak: 'logging', date: '2026-10-13' }),
        makeStreakFreeze({ streak: 'checkin', date: '2026-09-28' }),
        makeStreakFreeze({ streak: 'checkin', date: '2026-10-05' }),
      ],
    });
    expect(freezeTokensHeld(data, 'logging')).toBe(2);
    expect(freezeTokensHeld(data, 'checkin')).toBe(0);
  });

  it('counts only purchases', () => {
    const data = snap({
      ledger: [
        ...purchases('logging', 1),
        makeLedgerEntry({ key: 'shop:freeze-logging:x', kind: 'reversal' }),
        makeLedgerEntry({ key: 'shop:theme-dark:y', kind: 'purchase' }),
      ],
    });
    expect(freezeTokensHeld(data, 'logging')).toBe(1);
  });

  it('is never below zero', () => {
    const data = snap({ streakFreeze: [makeStreakFreeze({ streak: 'logging' })] });
    expect(freezeTokensHeld(data, 'logging')).toBe(0);
  });
});

describe('freezeUsesDue', () => {
  const run = loggedOn(daysFrom('2026-10-10', '2026-10-12'));

  it('spends freezes only when they cover the whole gap', () => {
    const covered = snap({ expense: run, ledger: purchases('logging', 2) });
    expect(freezeUsesDue(covered, ctx)).toEqual([
      {
        id: 'freeze:logging:2026-10-13',
        streak: 'logging',
        date: '2026-10-13',
        createdAt: ctx.now,
        updatedAt: ctx.now,
      },
      {
        id: 'freeze:logging:2026-10-14',
        streak: 'logging',
        date: '2026-10-14',
        createdAt: ctx.now,
        updatedAt: ctx.now,
      },
    ]);

    const short = snap({ expense: run, ledger: purchases('logging', 1) });
    expect(freezeUsesDue(short, ctx)).toEqual([]);
  });

  it('spends no more than the gap when it holds more tokens', () => {
    const data = snap({ expense: run, ledger: purchases('logging', 5) });
    expect(freezeUsesDue(data, ctx).map((u) => u.date)).toEqual(['2026-10-13', '2026-10-14']);
  });

  it('holds a streak that logs again today after the gap', () => {
    const data = snap({
      expense: [...run, ...loggedOn(['2026-10-15'])],
      ledger: purchases('logging', 2),
    });
    expect(freezeUsesDue(data, ctx).map((u) => u.date)).toEqual(['2026-10-13', '2026-10-14']);
  });

  it('spends nothing when no day was missed', () => {
    const throughYesterday = snap({
      expense: loggedOn(daysFrom('2026-10-10', '2026-10-14')),
      ledger: purchases('logging', 2),
    });
    expect(freezeUsesDue(throughYesterday, ctx)).toEqual([]);

    const throughToday = snap({
      expense: loggedOn(daysFrom('2026-10-10', '2026-10-15')),
      ledger: purchases('logging', 2),
    });
    expect(freezeUsesDue(throughToday, ctx)).toEqual([]);
  });

  it('spends nothing with no tokens, or with nothing to hold', () => {
    expect(freezeUsesDue(snap({ expense: run }), ctx)).toEqual([]);
    expect(freezeUsesDue(snap({ ledger: purchases('logging', 3) }), ctx)).toEqual([]);
  });

  it('is settled once the uses are written', () => {
    const data = snap({ expense: run, ledger: purchases('logging', 2) });
    const uses = freezeUsesDue(data, ctx);
    const settled = snap({ expense: run, ledger: data.tables.ledger, streakFreeze: uses });
    expect(freezeUsesDue(settled, ctx)).toEqual([]);
    expect(streak(settled, 'logging')).toMatchObject({ count: 5, tokens: 0 });
  });

  it('keeps the logging and check-in tokens apart', () => {
    const data = snap({ expense: run, ledger: purchases('checkin', 2) });
    expect(freezeUsesDue(data, ctx)).toEqual([]);
  });

  it('covers missed check-in weeks, dated by the start of each week', () => {
    const data = snap({
      checkIn: [makeCheckIn({ kind: 'weekly', date: '2026-09-21' })],
      ledger: purchases('checkin', 2),
    });
    expect(freezeUsesDue(data, ctx)).toEqual([
      {
        id: 'freeze:checkin:2026-09-28',
        streak: 'checkin',
        date: '2026-09-28',
        createdAt: ctx.now,
        updatedAt: ctx.now,
      },
      {
        id: 'freeze:checkin:2026-10-05',
        streak: 'checkin',
        date: '2026-10-05',
        createdAt: ctx.now,
        updatedAt: ctx.now,
      },
    ]);
  });

  it('spends check-in freezes only when they cover every missed week', () => {
    const data = snap({
      checkIn: [makeCheckIn({ kind: 'weekly', date: '2026-09-21' })],
      ledger: purchases('checkin', 1),
    });
    expect(freezeUsesDue(data, ctx)).toEqual([]);
  });

  it('spends nothing when only this week is still open', () => {
    const data = snap({
      checkIn: [makeCheckIn({ kind: 'weekly', date: '2026-10-05' })],
      ledger: purchases('checkin', 2),
    });
    expect(freezeUsesDue(data, ctx)).toEqual([]);
  });

  it('lists the logging uses before the check-in uses', () => {
    const data = snap({
      expense: loggedOn(daysFrom('2026-10-10', '2026-10-13')),
      checkIn: [makeCheckIn({ kind: 'weekly', date: '2026-09-28' })],
      ledger: [...purchases('logging', 1), ...purchases('checkin', 1)],
    });
    expect(freezeUsesDue(data, ctx).map((u) => u.id)).toEqual([
      'freeze:logging:2026-10-14',
      'freeze:checkin:2026-10-05',
    ]);
  });
});

describe('streakAwards', () => {
  it('awards milestones per run', () => {
    const sevenDays = snap({ expense: loggedOn(daysFrom('2026-10-09', '2026-10-15')) });
    expect(streakAwards(computeStreaks(sevenDays, ctx))).toEqual([
      {
        key: 'streak:logging:2026-10-09:7',
        kind: 'streak',
        title: 'Daily logging: 7-day streak',
        label: 'Daily logging: 7-day streak',
        xp: 50,
        coins: 10,
      },
    ]);

    const sixDays = snap({ expense: loggedOn(daysFrom('2026-10-10', '2026-10-15')) });
    expect(streakAwards(computeStreaks(sixDays, ctx))).toEqual([]);
  });

  it('awards every milestone a long run has passed, keyed to the start of that run', () => {
    const data = snap({ expense: loggedOn(daysFrom('2026-09-10', '2026-10-15')) });
    expect(streakAwards(computeStreaks(data, ctx)).map((a) => [a.key, a.xp, a.coins])).toEqual([
      ['streak:logging:2026-09-10:7', 50, 10],
      ['streak:logging:2026-09-10:30', 150, 40],
    ]);
  });

  it('awards check-in milestones by the week', () => {
    const weeks = ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'].map((date) =>
      makeCheckIn({ kind: 'weekly', date }),
    );
    expect(streakAwards(computeStreaks(snap({ checkIn: weeks }), ctx))).toEqual([
      {
        key: 'streak:checkin:2026-09-21:4',
        kind: 'streak',
        title: 'Weekly check-in: 4-week streak',
        label: 'Weekly check-in: 4-week streak',
        xp: 60,
        coins: 15,
      },
    ]);
  });

  it('awards no-overspend milestones and skips streaks with no run', () => {
    const view = (kind: StreakKind, count: number, runStart: string | null): StreakView => ({
      kind,
      title: kind === 'no-overspend' ? 'No overspending' : 'Daily logging',
      unit: 'day',
      count,
      active: true,
      doneThisPeriod: true,
      tokens: null,
      runStart,
    });
    const awards = streakAwards([view('logging', 0, null), view('no-overspend', 8, '2026-10-08')]);
    expect(awards.map((a) => [a.key, a.label])).toEqual([
      ['streak:no-overspend:2026-10-08:7', 'No overspending: 7-day streak'],
    ]);
  });
});
