import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  makeDebt,
  makeExpense,
  makeIncome,
  makeProfile,
  makeSettings,
  makeSubscription,
} from '@/test/fixtures';
import { localDateTime } from './dates';
import type {
  Debt,
  Expense,
  Income,
  ReminderSettings,
  SalaryFreeze,
  Subscription,
} from './entities';
import { formatMoney } from './money';
import { upcomingReminders, type Reminder } from './notifications';
import { emptySnapshot, type DataSnapshot } from './snapshot';

/** Node's global, which the app's TypeScript config does not include: the time-zone check needs it. */
declare const process: { env: Record<string, string | undefined> };

/** A Wednesday. Weeks that start on Monday end on Sundays 10-18, 10-25, 11-01 and 11-08. */
const NOW = '2026-10-14T10:00';
/** `NOW` plus the default 30 days. */
const HORIZON_END = '2026-11-13T10:00';

/** Every switch off except the master one, so a test turns on just the rule it covers. */
const ONLY: Partial<ReminderSettings> = {
  dailyLog: false,
  bills: false,
  freeze: false,
  reviews: false,
  backup: false,
};

type Setup = {
  reminders?: Partial<ReminderSettings>;
  /** Defaults to every rule switched off; pass `ALL` to keep the defaults. */
  all?: boolean;
  weekStartsOn?: 0 | 1;
  lastBackupAt?: string | null;
  onboardedAt?: string | null;
  subscriptions?: Subscription[];
  debts?: Debt[];
  expenses?: Expense[];
  incomes?: Income[];
  freezes?: SalaryFreeze[];
};

function build(setup: Setup = {}): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ onboardedAt: setup.onboardedAt ?? null })];
  data.tables.settings = [
    makeSettings({
      weekStartsOn: setup.weekStartsOn ?? 1,
      lastBackupAt: setup.lastBackupAt ?? null,
      reminders: {
        ...makeSettings().reminders,
        enabled: true,
        ...(setup.all ? {} : ONLY),
        ...setup.reminders,
      },
    }),
  ];
  data.tables.subscription = setup.subscriptions ?? [];
  data.tables.debt = setup.debts ?? [];
  data.tables.expense = setup.expenses ?? [];
  data.tables.income = setup.incomes ?? [];
  data.tables.salaryFreeze = setup.freezes ?? [];
  return data;
}

const money = (minor: number) => formatMoney(minor, 'USD');
/** A stored timestamp at midday on a local day, so its local date is that day in any time zone. */
const noon = (date: string) => localDateTime(`${date}T12:00`).toISOString();
const keys = (rs: Reminder[]) => rs.map((r) => r.key);
const kinds = (rs: Reminder[]) => [...new Set(rs.map((r) => r.kind))].sort();

function freeze(over: Partial<SalaryFreeze> = {}): SalaryFreeze {
  return {
    id: 'freeze-1',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    start: '2026-10-20',
    end: '2026-10-27',
    lostAmount: 0,
    mode: 'manual',
    note: '',
    ...over,
  };
}

/** A card with 230.00 on it, due on the 21st. */
function visa(over: Partial<Debt> = {}): { debts: Debt[]; expenses: Expense[] } {
  return {
    debts: [makeDebt({ id: 'card-visa', name: 'Visa', openingDate: '2026-10-01', ...over })],
    expenses: [
      makeExpense({
        amount: 230_00,
        date: '2026-10-05',
        paymentMethod: 'credit_card',
        cardId: 'card-visa',
      }),
    ],
  };
}

describe('upcomingReminders', () => {
  it('is empty until reminders are turned on', () => {
    const setup = {
      all: true,
      subscriptions: [makeSubscription({ id: 'sub-tv', nextRenewal: '2026-10-20' })],
      freezes: [freeze()],
    };
    const off = build(setup);
    off.tables.settings = [
      makeSettings({ reminders: { ...makeSettings().reminders, enabled: false } }),
    ];
    expect(upcomingReminders(off, NOW)).toEqual([]);
    expect(upcomingReminders(build(setup), NOW).length).toBeGreaterThan(0);

    const noProfile = build(setup);
    noProfile.tables.profile = [];
    expect(upcomingReminders(noProfile, NOW)).toEqual([]);

    const noSettings = build(setup);
    noSettings.tables.settings = [];
    expect(upcomingReminders(noSettings, NOW)).toEqual([]);
  });

  it('nudges to log every evening, skipping today once something is logged', () => {
    const setup = { reminders: { dailyLog: true } };
    const first = upcomingReminders(build(setup), NOW, { horizonDays: 3 });
    expect(first).toEqual([
      {
        key: 'daily:2026-10-14',
        kind: 'daily-log',
        at: '2026-10-14T20:00',
        title: "Log today's spending",
        body: 'Add what you spent today. It takes a few seconds.',
        route: '/add',
      },
      expect.objectContaining({ key: 'daily:2026-10-15', at: '2026-10-15T20:00' }),
      expect.objectContaining({ key: 'daily:2026-10-16', at: '2026-10-16T20:00' }),
    ]);

    const spent = build({ ...setup, expenses: [makeExpense({ date: '2026-10-14' })] });
    expect(keys(upcomingReminders(spent, NOW, { horizonDays: 3 }))).toEqual([
      'daily:2026-10-15',
      'daily:2026-10-16',
    ]);

    const earned = build({ ...setup, incomes: [makeIncome({ date: '2026-10-14' })] });
    expect(keys(upcomingReminders(earned, NOW, { horizonDays: 3 }))).toEqual([
      'daily:2026-10-15',
      'daily:2026-10-16',
    ]);

    // Only today counts: logging yesterday does not silence tonight.
    const yesterday = build({ ...setup, expenses: [makeExpense({ date: '2026-10-13' })] });
    expect(keys(upcomingReminders(yesterday, NOW, { horizonDays: 1 }))).toEqual([
      'daily:2026-10-14',
    ]);
  });

  it('still nudges on a renewal or pay day when nothing was logged', () => {
    const today = '2026-10-14';
    const tonight = ['daily:2026-10-14'];
    const nudged = (setup: Setup) =>
      keys(
        upcomingReminders(build({ reminders: { dailyLog: true }, ...setup }), NOW, {
          horizonDays: 1,
        }),
      );

    // Made by the app, not by the person: a subscription charge, and salary that is expected
    // (or was marked as never arrived).
    const charge = makeExpense({ date: today, subscriptionId: 'sub-tv' });
    expect(nudged({ expenses: [charge] })).toEqual(tonight);
    expect(nudged({ incomes: [makeIncome({ date: today, status: 'expected' })] })).toEqual(tonight);
    expect(nudged({ incomes: [makeIncome({ date: today, status: 'skipped' })] })).toEqual(tonight);
    expect(
      nudged({
        expenses: [charge],
        incomes: [makeIncome({ date: today, status: 'expected' })],
      }),
    ).toEqual(tonight);

    // Logged by the person: still counts, alongside the generated ones.
    expect(nudged({ expenses: [makeExpense({ date: today, subscriptionId: null })] })).toEqual([]);
    // Entered with Repeat, which starts a subscription: the person still logged it.
    const repeat = makeExpense({
      date: today,
      subscriptionId: 'sub-tv',
      recurrence: { cycle: 'monthly' },
    });
    expect(nudged({ expenses: [repeat] })).toEqual([]);
    expect(nudged({ incomes: [makeIncome({ date: today, status: 'confirmed' })] })).toEqual([]);
    expect(
      nudged({
        expenses: [charge, makeExpense({ date: today })],
        incomes: [makeIncome({ date: today, status: 'expected' })],
      }),
    ).toEqual([]);
  });

  it('uses the chosen time, and never schedules a moment that is not after now', () => {
    const morning = build({ reminders: { dailyLog: true, dailyTime: '07:30' } });
    expect(keys(upcomingReminders(morning, NOW, { horizonDays: 2 }))).toEqual([
      'daily:2026-10-15',
      'daily:2026-10-16',
    ]);
    expect(upcomingReminders(morning, NOW, { horizonDays: 1 })[0]?.at).toBe('2026-10-15T07:30');

    const exactly = build({ reminders: { dailyLog: true, dailyTime: '10:00' } });
    expect(upcomingReminders(exactly, NOW, { horizonDays: 1 })[0]?.at).toBe('2026-10-15T10:00');
  });

  it('reminds the day before each subscription renewal', () => {
    const data = build({
      reminders: { bills: true },
      subscriptions: [makeSubscription({ id: 'sub-tv', nextRenewal: '2026-10-20', amount: 15_99 })],
    });
    expect(upcomingReminders(data, NOW)).toEqual([
      {
        key: 'renewal:sub-tv:2026-10-20',
        kind: 'renewal',
        at: '2026-10-19T09:00',
        title: 'Streamflix renews tomorrow',
        body: `${money(15_99)} will be charged.`,
        route: '/subscriptions',
      },
    ]);
  });

  it('follows a subscription through its cycle, and ignores cancelled ones', () => {
    const data = build({
      reminders: { bills: true },
      subscriptions: [
        makeSubscription({ id: 'sub-gym', nextRenewal: '2026-10-20', cycle: 'weekly' }),
        makeSubscription({ id: 'sub-old', nextRenewal: '2026-10-20', status: 'cancelled' }),
        // Renews tomorrow: its reminder time has passed, and the next one is a month out.
        makeSubscription({ id: 'sub-soon', nextRenewal: '2026-10-15' }),
      ],
    });
    expect(upcomingReminders(data, NOW).map((r) => [r.key, r.at])).toEqual([
      ['renewal:sub-gym:2026-10-20', '2026-10-19T09:00'],
      ['renewal:sub-gym:2026-10-27', '2026-10-26T09:00'],
      ['renewal:sub-gym:2026-11-03', '2026-11-02T09:00'],
      ['renewal:sub-gym:2026-11-10', '2026-11-09T09:00'],
    ]);
  });

  it('reminds two days before a card payment is due', () => {
    const data = build({ reminders: { bills: true }, ...visa() });
    expect(upcomingReminders(data, NOW)).toEqual([
      {
        key: 'card:card-visa:2026-10-21',
        kind: 'card-due',
        at: '2026-10-19T09:00',
        title: 'Visa payment due in 2 days',
        body: `${money(230_00)} to pay.`,
        route: '/goals',
      },
    ]);
  });

  it('repeats a card reminder each month, and skips cards with nothing to pay', () => {
    const owing = build({ reminders: { bills: true }, ...visa() });
    expect(
      upcomingReminders(owing, NOW, { horizonDays: 45 }).map((r) => [r.key, r.at, r.body]),
    ).toEqual([
      ['card:card-visa:2026-10-21', '2026-10-19T09:00', `${money(230_00)} to pay.`],
      ['card:card-visa:2026-11-21', '2026-11-19T09:00', `${money(230_00)} to pay.`],
    ]);

    const minimum = build({
      reminders: { bills: true },
      ...visa({ payInFull: false, minimumPayment: 25_00 }),
    });
    expect(upcomingReminders(minimum, NOW)[0]?.body).toBe(`${money(25_00)} to pay.`);

    const settled = build({ reminders: { bills: true }, ...visa(), expenses: [] });
    expect(upcomingReminders(settled, NOW)).toEqual([]);

    const noDueDay = build({ reminders: { bills: true }, ...visa({ dueDay: null }) });
    expect(upcomingReminders(noDueDay, NOW)).toEqual([]);

    const loan = build({
      reminders: { bills: true },
      debts: [makeDebt({ id: 'loan', kind: 'loan', openingBalance: 900_00, dueDay: 21 })],
    });
    expect(upcomingReminders(loan, NOW)).toEqual([]);
  });

  it('announces a freeze starting and ending', () => {
    const data = build({ reminders: { freeze: true }, freezes: [freeze()] });
    expect(upcomingReminders(data, NOW)).toEqual([
      {
        key: 'freeze-start:freeze-1',
        kind: 'freeze-start',
        at: '2026-10-20T09:00',
        title: 'Salary freeze starts today',
        body: 'Expected pay is lower while it lasts. Bills still apply.',
        route: '/freeze',
      },
      {
        key: 'freeze-end:freeze-1',
        kind: 'freeze-end',
        at: '2026-10-27T09:00',
        title: 'Salary freeze ends today',
        body: 'Your expected pay goes back to normal.',
        route: '/freeze',
      },
    ]);

    const running = build({
      reminders: { freeze: true },
      freezes: [freeze({ start: '2026-10-01' })],
    });
    expect(keys(upcomingReminders(running, NOW))).toEqual(['freeze-end:freeze-1']);
  });

  it('schedules weekly and monthly reviews without doubling up on the last day', () => {
    const monday = build({ reminders: { reviews: true }, weekStartsOn: 1 });
    expect(upcomingReminders(monday, NOW).map((r) => [r.key, r.at])).toEqual([
      ['week:2026-10-18', '2026-10-18T18:00'],
      ['week:2026-10-25', '2026-10-25T18:00'],
      ['month:2026-10-31', '2026-10-31T18:00'],
      ['week:2026-11-01', '2026-11-01T18:00'],
      ['week:2026-11-08', '2026-11-08T18:00'],
    ]);

    const [week, , month] = upcomingReminders(monday, NOW);
    expect(week).toEqual({
      key: 'week:2026-10-18',
      kind: 'weekly-review',
      at: '2026-10-18T18:00',
      title: 'Weekly check-in',
      body: 'See how this week went: spending, limits and bills.',
      route: '/',
    });
    expect(month).toEqual({
      key: 'month:2026-10-31',
      kind: 'monthly-review',
      at: '2026-10-31T18:00',
      title: 'Monthly review',
      body: 'Look back at this month before it ends.',
      route: '/budget',
    });

    // Weeks starting on Sunday end on Saturday, and 10-31 is both that and the month's end.
    const sunday = build({ reminders: { reviews: true }, weekStartsOn: 0 });
    const onSunday = upcomingReminders(sunday, NOW);
    expect(onSunday.map((r) => r.key)).toEqual([
      'week:2026-10-17',
      'week:2026-10-24',
      'month:2026-10-31',
      'week:2026-11-07',
    ]);

    // 2027-01-31 is a Sunday: the last day of a Monday-start week and of the month.
    const both = upcomingReminders(monday, '2027-01-20T10:00').filter(
      (r) => r.at.slice(0, 10) === '2027-01-31',
    );
    expect(both.map((r) => r.kind)).toEqual(['monthly-review']);
  });

  it('reminds to back up a week after the last backup', () => {
    const data = build({
      reminders: { backup: true },
      lastBackupAt: noon('2026-10-07'),
    });
    const all = upcomingReminders(data, NOW);
    expect(all[0]).toEqual({
      key: 'backup:2026-10-14',
      kind: 'backup',
      at: '2026-10-14T19:00',
      title: 'Back up your data',
      body: 'Save an encrypted copy to Drive or Files. It takes a minute.',
      route: '/settings',
    });
    expect(all.map((r) => r.at)).toEqual([
      '2026-10-14T19:00',
      '2026-10-21T19:00',
      '2026-10-28T19:00',
      '2026-11-04T19:00',
      '2026-11-11T19:00',
    ]);
  });

  it('moves an overdue backup reminder to the next 19:00, then repeats weekly', () => {
    const overdue = build({
      reminders: { backup: true },
      lastBackupAt: noon('2026-09-01'),
    });
    expect(upcomingReminders(overdue, NOW).map((r) => r.at)).toEqual([
      '2026-10-14T19:00',
      '2026-10-21T19:00',
      '2026-10-28T19:00',
      '2026-11-04T19:00',
      '2026-11-11T19:00',
    ]);
    // Past 19:00 already, so it waits for tomorrow evening.
    expect(upcomingReminders(overdue, '2026-10-14T19:00')[0]?.at).toBe('2026-10-15T19:00');
  });

  it('counts from onboarding until a first backup is made, and waits for neither', () => {
    const onboarded = build({
      reminders: { backup: true },
      onboardedAt: noon('2026-10-10'),
    });
    expect(upcomingReminders(onboarded, NOW)[0]?.at).toBe('2026-10-17T19:00');

    // A backup wins over the onboarding date.
    const backedUp = build({
      reminders: { backup: true },
      onboardedAt: noon('2026-10-10'),
      lastBackupAt: noon('2026-10-12'),
    });
    expect(upcomingReminders(backedUp, NOW)[0]?.at).toBe('2026-10-19T19:00');

    expect(upcomingReminders(build({ reminders: { backup: true } }), NOW)).toEqual([]);
  });

  it('honours each switch', () => {
    const setup = {
      all: true,
      lastBackupAt: noon('2026-10-07'),
      subscriptions: [makeSubscription({ id: 'sub-tv', nextRenewal: '2026-10-20' })],
      freezes: [freeze()],
      ...visa(),
    };
    const everything = upcomingReminders(build(setup), NOW);
    expect(kinds(everything)).toEqual([
      'backup',
      'card-due',
      'daily-log',
      'freeze-end',
      'freeze-start',
      'monthly-review',
      'renewal',
      'weekly-review',
    ]);

    const without = (off: Partial<ReminderSettings>) =>
      kinds(upcomingReminders(build({ ...setup, reminders: off }), NOW));
    const dropped = (off: Partial<ReminderSettings>) =>
      kinds(everything).filter((k) => !without(off).includes(k));

    expect(dropped({ dailyLog: false })).toEqual(['daily-log']);
    expect(dropped({ bills: false })).toEqual(['card-due', 'renewal']);
    expect(dropped({ freeze: false })).toEqual(['freeze-end', 'freeze-start']);
    expect(dropped({ reviews: false })).toEqual(['monthly-review', 'weekly-review']);
    expect(dropped({ backup: false })).toEqual(['backup']);
  });

  it('keeps the nearest 60 within 30 days, all after now', () => {
    const gyms = Array.from({ length: 12 }, (_, i) =>
      makeSubscription({ id: `sub-${i}`, nextRenewal: '2026-10-20', cycle: 'weekly' }),
    );
    const data = build({ reminders: { dailyLog: true, bills: true }, subscriptions: gyms });

    // 30 evenings (10-14 to 11-12) and 12 weekly subscriptions with 4 reminders each.
    const unlimited = upcomingReminders(data, NOW, { limit: 1000 });
    expect(unlimited).toHaveLength(30 + 12 * 4);

    const nearest = upcomingReminders(data, NOW);
    expect(nearest).toHaveLength(60);
    expect(nearest).toEqual(unlimited.slice(0, 60));
    for (const r of nearest) {
      expect(r.at > NOW).toBe(true);
      expect(r.at <= HORIZON_END).toBe(true);
    }

    const byTimeThenKey = [...nearest].sort(
      (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0) || (a.key < b.key ? -1 : 1),
    );
    expect(nearest).toEqual(byTimeThenKey);
  });

  it('takes a shorter horizon and a smaller limit', () => {
    const data = build({ reminders: { dailyLog: true } });
    const week = upcomingReminders(data, NOW, { horizonDays: 7 });
    expect(week.at(-1)?.at).toBe('2026-10-20T20:00');
    expect(upcomingReminders(data, NOW, { limit: 2 })).toHaveLength(2);
  });
});

describe('localDateTime', () => {
  // Deleting TZ does not make Node look the zone up again, so put back the zone in force before.
  const had = process.env.TZ;
  const system = Intl.DateTimeFormat().resolvedOptions().timeZone;
  beforeAll(() => {
    process.env.TZ = 'Europe/Amsterdam';
  });
  afterAll(() => {
    process.env.TZ = had ?? system;
    if (had === undefined) delete process.env.TZ;
  });

  it('keeps 09:00 at 09:00 across a clock change', () => {
    // Node must honour the zone set above, or the checks below prove nothing.
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-120);
    expect(new Date(2026, 11, 1).getTimezoneOffset()).toBe(-60);

    const before = localDateTime('2026-10-24T09:00');
    const after = localDateTime('2026-10-25T09:00');
    expect(before.getHours()).toBe(9);
    expect(after.getHours()).toBe(9);
    // The clocks went back that night, so the wall-clock day was 25 hours long.
    expect((after.getTime() - before.getTime()) / 3_600_000).toBe(25);
  });

  it('reads wall-clock local time', () => {
    expect(localDateTime('2026-10-25T09:00').getTime()).toBe(new Date(2026, 9, 25, 9, 0).getTime());
    expect(localDateTime('2026-01-02T23:45').getTime()).toBe(
      new Date(2026, 0, 2, 23, 45).getTime(),
    );
  });

  it('rejects anything that is not a local date and time', () => {
    expect(() => localDateTime('2026-10-25')).toThrow(RangeError);
    expect(() => localDateTime('2026-10-25T09:00:00Z')).toThrow(RangeError);
  });
});
