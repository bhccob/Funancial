import { describe, expect, it } from 'vitest';
import {
  localIso,
  makeCheckIn,
  makeExpense,
  makeIncome,
  makeLimit,
  makeProfile,
  makeSettings,
  makeSubscription,
} from '@/test/fixtures';
import { emptySnapshot, type DataSnapshot } from '../snapshot';
import { currentQuests, questAwards, type QuestView } from './quests';
import type { GameContext, QuestId } from './types';

// 2026-10-15 is a Thursday, so with weeks starting Monday the current week is 2026-10-12 to 10-18.
const ctx: GameContext = {
  today: '2026-10-15',
  now: localIso('2026-10-15', 8),
  weekStartsOn: 1,
  canBackUp: true,
};

function snap(tables: Partial<DataSnapshot['tables']>): DataSnapshot {
  const base = emptySnapshot();
  return { ...base, tables: { ...base.tables, ...tables } };
}

function quest(data: DataSnapshot, id: QuestId, c: GameContext = ctx): QuestView {
  const view = currentQuests(data, c).find((q) => q.id === id);
  if (!view) throw new Error(`no ${id} quest`);
  return view;
}

const ids = (data: DataSnapshot, c: GameContext = ctx) => currentQuests(data, c).map((q) => q.id);

/** A food expense logged at noon on `day`, dated `day`. */
const spent = (day: string, amount = 12_50) =>
  makeExpense({ date: day, amount, category: 'food', createdAt: localIso(day) });

/** A weekly food limit of 120.00 that has existed since `since`. */
const limitSince = (since: string) => makeLimit({ createdAt: localIso(since) });

describe('currentQuests', () => {
  it('shows each quest only when it applies', () => {
    const quiet = { ...ctx, canBackUp: false };
    expect(ids(snap({}), quiet)).toEqual(['log-today', 'week-checkin']);
    expect(ids(snap({ budgetLimit: [limitSince('2026-10-01')] }), quiet)).toEqual([
      'log-today',
      'week-limits',
      'week-checkin',
    ]);
    expect(ids(snap({ profile: [makeProfile()] }), quiet)).toEqual([
      'log-today',
      'week-checkin',
      'month-salary',
    ]);
    expect(ids(snap({ profile: [makeProfile({ salary: null })] }), quiet)).toEqual([
      'log-today',
      'week-checkin',
    ]);
    expect(ids(snap({ subscription: [makeSubscription()] }), quiet)).toEqual([
      'log-today',
      'week-checkin',
      'month-audit',
    ]);
    expect(ids(snap({ subscription: [makeSubscription({ status: 'cancelled' })] }), quiet)).toEqual(
      ['log-today', 'week-checkin'],
    );
  });

  it('lists daily, then weekly, then monthly quests, with the backup quest when it can run', () => {
    const data = snap({
      budgetLimit: [limitSince('2026-10-01')],
      profile: [makeProfile()],
      subscription: [makeSubscription()],
    });
    expect(currentQuests(data, ctx).map((q) => [q.id, q.cadence, q.period])).toEqual([
      ['log-today', 'daily', '2026-10-15'],
      ['week-limits', 'weekly', '2026-10-12'],
      ['week-checkin', 'weekly', '2026-10-12'],
      ['month-salary', 'monthly', '2026-10'],
      ['month-audit', 'monthly', '2026-10'],
      ['month-backup', 'monthly', '2026-10'],
    ]);
    expect(ids(data, { ...ctx, canBackUp: false })).not.toContain('month-backup');
  });

  it('pays each quest its reward and gives it its title', () => {
    const view = quest(snap({}), 'log-today');
    expect(view.title).toBe("Log today's spending");
    expect(view.reward).toEqual({ xp: 20, coins: 5 });
    expect(quest(snap({}), 'week-checkin').reward).toEqual({ xp: 40, coins: 10 });
  });

  describe('log-today', () => {
    it('is open on a quiet day, offering Nothing spent', () => {
      expect(quest(snap({}), 'log-today')).toMatchObject({
        done: false,
        current: 0,
        target: 1,
        detail: 'Add an expense, or tap Nothing spent',
        action: 'no-spend',
      });
    });

    it('completes by logging or by a no-spend check-in, not by a subscription charge', () => {
      const logged = snap({ expense: [spent('2026-10-15')] });
      expect(quest(logged, 'log-today')).toMatchObject({
        done: true,
        current: 1,
        detail: 'Done for today',
      });

      const extra = snap({
        income: [makeIncome({ source: 'extra', period: null, createdAt: localIso('2026-10-15') })],
      });
      expect(quest(extra, 'log-today').done).toBe(true);

      const noSpend = snap({ checkIn: [makeCheckIn({ kind: 'no-spend', date: '2026-10-15' })] });
      expect(quest(noSpend, 'log-today')).toMatchObject({ done: true, current: 1 });

      const charge = makeExpense({
        date: '2026-10-15',
        subscriptionId: 'sub-1',
        createdAt: localIso('2026-10-15'),
      });
      expect(quest(snap({ expense: [charge] }), 'log-today').done).toBe(false);

      const yesterday = snap({
        expense: [spent('2026-10-14')],
        checkIn: [
          makeCheckIn({ kind: 'no-spend', date: '2026-10-14' }),
          makeCheckIn({ kind: 'weekly', date: '2026-10-15' }),
        ],
      });
      expect(quest(yesterday, 'log-today').done).toBe(false);
    });

    it('offers Nothing spent only until something is logged', () => {
      expect(quest(snap({}), 'log-today').action).toBe('no-spend');
      expect(quest(snap({ expense: [spent('2026-10-15')] }), 'log-today').action).toBeNull();
      expect(
        quest(
          snap({ checkIn: [makeCheckIn({ kind: 'no-spend', date: '2026-10-15' })] }),
          'log-today',
        ).action,
      ).toBeNull();

      const charge = makeExpense({
        date: '2026-10-15',
        subscriptionId: 'sub-1',
        createdAt: localIso('2026-10-14'),
      });
      expect(quest(snap({ expense: [charge] }), 'log-today').action).toBe('no-spend');
    });
  });

  describe('week-limits', () => {
    const limits = [limitSince('2026-10-01')];

    it('tracks the week of limits', () => {
      expect(quest(snap({ budgetLimit: limits }), 'week-limits')).toMatchObject({
        done: false,
        current: 4,
        target: 7,
        detail: 'Day 4 of 7 · on track',
        action: null,
      });
      expect(quest(snap({ budgetLimit: limits }), 'week-limits').reward).toEqual({
        xp: 60,
        coins: 15,
      });

      const over = snap({ budgetLimit: limits, expense: [spent('2026-10-13', 150_00)] });
      expect(quest(over, 'week-limits')).toMatchObject({
        done: false,
        current: 4,
        target: 7,
        detail: 'Over a limit this week. Next week is a fresh start.',
      });
    });

    it('starts the day count at the start of a week that begins on Sunday', () => {
      const sunday = { ...ctx, weekStartsOn: 0 as const };
      const view = quest(snap({ budgetLimit: limits }), 'week-limits', sunday);
      expect(view).toMatchObject({
        period: '2026-10-11',
        current: 5,
        detail: 'Day 5 of 7 · on track',
      });
    });

    it("is not reopened by last week's overspending", () => {
      const lastWeek = snap({ budgetLimit: limits, expense: [spent('2026-10-08', 150_00)] });
      expect(quest(lastWeek, 'week-limits').detail).toBe('Day 4 of 7 · on track');
    });

    it('is never done during the week, even on its last day', () => {
      const sunday = { ...ctx, today: '2026-10-18' };
      expect(quest(snap({ budgetLimit: limits }), 'week-limits', sunday)).toMatchObject({
        done: false,
        current: 7,
        detail: 'Day 7 of 7 · on track',
      });
    });
  });

  describe('week-checkin', () => {
    it('is open until the weekly check-in is done', () => {
      expect(quest(snap({}), 'week-checkin')).toMatchObject({
        done: false,
        current: 0,
        target: 1,
        detail: 'Review your week in a minute',
        action: 'checkin',
      });
    });

    it('completes with this week’s check-in, and not with last week’s', () => {
      const done = snap({ checkIn: [makeCheckIn({ kind: 'weekly', date: '2026-10-12' })] });
      expect(quest(done, 'week-checkin')).toMatchObject({
        done: true,
        current: 1,
        detail: 'Checked in',
        action: null,
      });

      const lastWeek = snap({ checkIn: [makeCheckIn({ kind: 'weekly', date: '2026-10-05' })] });
      expect(quest(lastWeek, 'week-checkin').done).toBe(false);

      const noSpend = snap({ checkIn: [makeCheckIn({ kind: 'no-spend', date: '2026-10-12' })] });
      expect(quest(noSpend, 'week-checkin').done).toBe(false);
    });
  });

  describe('month-salary', () => {
    const salary = (status: 'expected' | 'confirmed' | 'skipped', period = '2026-10') =>
      makeIncome({ source: 'salary', period, status, date: `${period}-25` });

    it('waits for pay day while no salary is expected', () => {
      expect(quest(snap({ profile: [makeProfile()] }), 'month-salary')).toMatchObject({
        done: false,
        current: 0,
        target: 1,
        detail: 'Waiting for pay day',
        action: null,
      });
    });

    it('completes once the salary is confirmed or skipped', () => {
      const profile = [makeProfile()];
      expect(quest(snap({ profile, income: [salary('expected')] }), 'month-salary')).toMatchObject({
        done: false,
        detail: 'Confirm it or mark it as not arrived',
      });
      for (const status of ['confirmed', 'skipped'] as const) {
        expect(quest(snap({ profile, income: [salary(status)] }), 'month-salary')).toMatchObject({
          done: true,
          current: 1,
          detail: 'Done',
        });
      }
    });

    it("ignores other months' salary and extra income", () => {
      const profile = [makeProfile()];
      const income = [
        salary('confirmed', '2026-09'),
        makeIncome({ source: 'extra', period: null, status: 'confirmed' }),
      ];
      expect(quest(snap({ profile, income }), 'month-salary')).toMatchObject({
        done: false,
        detail: 'Waiting for pay day',
      });
    });
  });

  describe('month-audit', () => {
    it('counts subscriptions audited this month', () => {
      const data = snap({
        subscription: [
          makeSubscription({ auditedAt: localIso('2026-10-03') }),
          makeSubscription({ auditedAt: localIso('2026-09-28') }),
          makeSubscription({ status: 'cancelled', auditedAt: null }),
        ],
      });
      expect(quest(data, 'month-audit')).toMatchObject({
        done: false,
        current: 1,
        target: 2,
        detail: '1 of 2 reviewed',
        action: null,
      });
    });

    it('completes once every active subscription is audited', () => {
      const data = snap({
        subscription: [
          makeSubscription({ auditedAt: localIso('2026-10-01') }),
          makeSubscription({ auditedAt: localIso('2026-10-14') }),
        ],
      });
      expect(quest(data, 'month-audit')).toMatchObject({
        done: true,
        current: 2,
        target: 2,
        detail: '2 of 2 reviewed',
      });
    });

    it('counts a subscription never audited as not reviewed', () => {
      expect(quest(snap({ subscription: [makeSubscription()] }), 'month-audit')).toMatchObject({
        done: false,
        current: 0,
        target: 1,
        detail: '0 of 1 reviewed',
      });
    });
  });

  describe('month-backup', () => {
    it('completes with a backup this month', () => {
      const backedUp = snap({ settings: [makeSettings({ lastBackupAt: localIso('2026-10-02') })] });
      expect(quest(backedUp, 'month-backup')).toMatchObject({
        done: true,
        current: 1,
        target: 1,
        detail: 'Backed up',
        action: null,
      });
    });

    it('stays open without a backup this month', () => {
      const lastMonth = snap({
        settings: [makeSettings({ lastBackupAt: localIso('2026-09-30') })],
      });
      expect(quest(lastMonth, 'month-backup')).toMatchObject({
        done: false,
        current: 0,
        detail: 'Save an encrypted copy',
      });

      const never = snap({ settings: [makeSettings({ lastBackupAt: null })] });
      expect(quest(never, 'month-backup').done).toBe(false);
      expect(quest(snap({}), 'month-backup').done).toBe(false);
    });
  });
});

describe('questAwards', () => {
  it('awards nothing while no quest is done', () => {
    expect(questAwards(snap({}), ctx)).toEqual([]);
  });

  it('awards the daily quest with its day', () => {
    expect(questAwards(snap({ expense: [spent('2026-10-15')] }), ctx)).toEqual([
      {
        key: 'quest:log-today:2026-10-15',
        kind: 'quest',
        title: "Log today's spending",
        label: "Quest: Log today's spending",
        xp: 20,
        coins: 5,
      },
    ]);
  });

  it('awards the weekly check-in with the week it closes', () => {
    const data = snap({ checkIn: [makeCheckIn({ kind: 'weekly', date: '2026-10-12' })] });
    expect(questAwards(data, ctx)).toEqual([
      {
        key: 'quest:week-checkin:2026-10-12',
        kind: 'quest',
        title: 'Do your weekly check-in',
        label: 'Quest: Do your weekly check-in',
        xp: 40,
        coins: 10,
      },
    ]);
  });

  it('awards the monthly quests with their month', () => {
    const data = snap({
      profile: [makeProfile()],
      income: [makeIncome({ source: 'salary', period: '2026-10', status: 'skipped' })],
      subscription: [makeSubscription({ auditedAt: localIso('2026-10-03') })],
      settings: [makeSettings({ lastBackupAt: localIso('2026-10-02') })],
    });
    expect(questAwards(data, ctx).map((a) => [a.key, a.xp, a.coins])).toEqual([
      ['quest:month-salary:2026-10', 100, 25],
      ['quest:month-audit:2026-10', 100, 25],
      ['quest:month-backup:2026-10', 80, 20],
    ]);
  });

  describe('the limits quest for the week that just closed', () => {
    it('awards it for the week before this one when no day was over', () => {
      const data = snap({ budgetLimit: [limitSince('2026-10-01')] });
      expect(questAwards(data, ctx)).toEqual([
        {
          key: 'quest:week-limits:2026-10-05',
          kind: 'quest',
          title: 'Stay within your limits this week',
          label: 'Quest: Stay within your limits this week',
          xp: 60,
          coins: 15,
        },
      ]);
    });

    it('awards nothing when a day of that week was over, and never judges the week before', () => {
      const data = snap({
        budgetLimit: [limitSince('2026-09-01')],
        expense: [spent('2026-10-08', 150_00)],
      });
      const keys = questAwards(data, ctx).map((a) => a.key);
      expect(keys).not.toContain('quest:week-limits:2026-10-05');
      expect(keys).not.toContain('quest:week-limits:2026-09-28');
      expect(keys).toEqual([]);
    });

    it('judges only the most recent closed week, though earlier ones were clean', () => {
      const data = snap({ budgetLimit: [limitSince('2026-09-01')] });
      expect(questAwards(data, ctx).map((a) => a.key)).toEqual(['quest:week-limits:2026-10-05']);
    });

    it('awards nothing when no limit existed by the last day of that week', () => {
      const data = snap({ budgetLimit: [limitSince('2026-10-12')] });
      expect(questAwards(data, ctx)).toEqual([]);
    });

    it('awards it when the limit began on the last day of that week', () => {
      const data = snap({ budgetLimit: [limitSince('2026-10-11')] });
      expect(questAwards(data, ctx).map((a) => a.key)).toEqual(['quest:week-limits:2026-10-05']);
    });

    it('does not count overspending in the current week against the week that closed', () => {
      const data = snap({
        budgetLimit: [limitSince('2026-10-01')],
        expense: [spent('2026-10-13', 150_00)],
      });
      expect(questAwards(data, ctx).map((a) => a.key)).toEqual(['quest:week-limits:2026-10-05']);
    });

    it('follows a week that starts on Sunday', () => {
      const sunday = { ...ctx, weekStartsOn: 0 as const };
      const data = snap({ budgetLimit: [limitSince('2026-10-01')] });
      expect(questAwards(data, sunday).map((a) => a.key)).toEqual(['quest:week-limits:2026-10-04']);
    });

    it('is awarded alongside the quests done this period', () => {
      const data = snap({
        budgetLimit: [limitSince('2026-10-01')],
        expense: [spent('2026-10-15')],
      });
      expect(questAwards(data, ctx).map((a) => a.key)).toEqual([
        'quest:log-today:2026-10-15',
        'quest:week-limits:2026-10-05',
      ]);
    });
  });
});
