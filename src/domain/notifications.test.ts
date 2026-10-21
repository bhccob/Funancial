import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  makeDebt,
  makeDividend,
  makeExpense,
  makeHolding,
  makeIncome,
  makeProfile,
  makeSettings,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import { localDateTime } from './dates';
import type {
  BuyDecision,
  Debt,
  Dividend,
  Expense,
  Holding,
  Income,
  ReminderSettings,
  SalaryFreeze,
  Settings,
  Subscription,
} from './entities';
import { formatMoney } from './money';
import {
  inboxItems,
  pastReminders,
  REMINDER_AREA,
  upcomingReminders,
  type Reminder,
  type ReminderKind,
} from './notifications';
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
  dividends: false,
  buyIt: false,
};

type Setup = {
  reminders?: Partial<ReminderSettings>;
  /** Defaults to every rule switched off; pass `ALL` to keep the defaults. */
  all?: boolean;
  weekStartsOn?: 0 | 1;
  lastBackupAt?: string | null;
  onboardedAt?: string | null;
  /** When the profile was made: long before `NOW`, unless a test is about the days before it. */
  profileSince?: string;
  inbox?: Settings['inbox'];
  subscriptions?: Subscription[];
  debts?: Debt[];
  expenses?: Expense[];
  incomes?: Income[];
  freezes?: SalaryFreeze[];
  holdings?: Holding[];
  dividends?: Dividend[];
  /** Rows an older build saved for the retired Buy it? feature: nothing reads them. */
  decisions?: BuyDecision[];
};

function build(setup: Setup = {}): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [
    makeProfile({
      onboardedAt: setup.onboardedAt ?? null,
      createdAt: setup.profileSince ?? '2026-01-01T09:00:00.000Z',
    }),
  ];
  data.tables.settings = [
    makeSettings({
      weekStartsOn: setup.weekStartsOn ?? 1,
      lastBackupAt: setup.lastBackupAt ?? null,
      ...(setup.inbox ? { inbox: setup.inbox } : {}),
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
  data.tables.holding = setup.holdings ?? [];
  data.tables.dividend = setup.dividends ?? [];
  data.tables.buyDecision = setup.decisions ?? [];
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

type Info = NonNullable<Holding['dividendInfo']>;

/** KO: 10 shares in dollars, no tax withheld, paying 1.25 a share on the dates given. */
function payer(info: Partial<Info>, over: Partial<Holding> = {}): Holding {
  return makeHolding({
    id: 'ko',
    symbol: 'KO',
    currency: 'USD',
    shares: 10,
    withholdingPct: 0,
    purchaseDate: '2026-01-01',
    dividendInfo: {
      history: [],
      nextExDate: null,
      nextPayDate: null,
      nextAmount: 1.25,
      fetchedAt: '2026-10-14T08:00:00.000Z',
      ...info,
    },
    ...over,
  });
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
        route: '/debts',
      },
    ]);
  });

  it('never reminds of an archived card', () => {
    const data = build({ reminders: { bills: true }, ...visa({ archivedOn: '2026-10-14' }) });
    expect(upcomingReminders(data, NOW)).toEqual([]);
  });

  it('reminds of what is left of a minimum, and not at all once it is paid', () => {
    const minimum = visa({ payInFull: false, minimumPayment: 25_00 });
    const after = (amount: number) => {
      const data = build({ reminders: { bills: true }, ...minimum });
      data.tables.transaction = [
        makeTransaction({
          type: 'card_payment',
          amount,
          date: '2026-10-14',
          from: 'cash',
          to: null,
          debtId: 'card-visa',
        }),
      ];
      return upcomingReminders(data, NOW).map((r) => r.body);
    };
    expect(after(10_00)).toEqual([`${money(15_00)} to pay.`]);
    expect(after(25_00)).toEqual([]);
  });

  it('reminds of the whole minimum in later months, after a part or full payment now', () => {
    const minimum = visa({ payInFull: false, minimumPayment: 25_00 });
    const after = (amount: number) => {
      const data = build({ reminders: { bills: true }, ...minimum });
      data.tables.transaction = [
        makeTransaction({
          type: 'card_payment',
          amount,
          date: '2026-10-14',
          from: 'cash',
          to: null,
          debtId: 'card-visa',
        }),
      ];
      return upcomingReminders(data, NOW, { horizonDays: 45 }).map((r) => [r.key, r.body]);
    };
    expect(after(10_00)).toEqual([
      ['card:card-visa:2026-10-21', `${money(15_00)} to pay.`],
      ['card:card-visa:2026-11-21', `${money(25_00)} to pay.`],
    ]);
    expect(after(25_00)).toEqual([['card:card-visa:2026-11-21', `${money(25_00)} to pay.`]]);
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

  it('plans no backup reminder, whatever the old backup switch and date say', () => {
    // Backups are gone; the switch and `lastBackupAt` stay in saved data so older data still loads.
    const old = [
      { reminders: { backup: true }, lastBackupAt: noon('2026-10-07') },
      { reminders: { backup: true }, lastBackupAt: noon('2026-09-01') },
      { reminders: { backup: true }, onboardedAt: noon('2026-10-10') },
      { reminders: { backup: true } },
    ];
    for (const setup of old) expect(upcomingReminders(build(setup), NOW)).toEqual([]);

    const everyRule = upcomingReminders(
      build({ all: true, lastBackupAt: noon('2026-10-07') }),
      NOW,
    );
    expect(everyRule.length).toBeGreaterThan(0);
    expect(
      everyRule.filter((r) => r.key.startsWith('backup:') || /back up/i.test(r.title)),
    ).toEqual([]);
  });

  it('reminds the day before an ex-date and on the pay date', () => {
    const holdings = [payer({ nextExDate: '2026-10-20', nextPayDate: '2026-10-27' })];
    const data = build({ reminders: { dividends: true }, holdings });
    expect(upcomingReminders(data, NOW)).toEqual([
      {
        key: 'dividend-ex:ko:2026-10-27',
        kind: 'dividend-ex',
        at: '2026-10-19T09:00',
        title: 'KO goes ex-dividend tomorrow',
        body: 'Hold your shares through today to get the next payout.',
        route: '/invest?tab=dividends',
      },
      {
        key: 'dividend-pay:ko:2026-10-27',
        kind: 'dividend-pay',
        at: '2026-10-27T09:00',
        title: 'KO pays a dividend today',
        body: `Expected about ${money(12_50)}. Confirm it when it arrives.`,
        route: '/invest?tab=dividends',
      },
    ]);
  });

  it('follows a holding through its payouts across the horizon', () => {
    const history = [
      { date: '2026-08-16', amount: 1.25 },
      { date: '2026-09-16', amount: 1.25 },
    ];
    const holdings = [payer({ history, nextExDate: '2026-10-16', nextPayDate: '2026-10-23' })];
    const data = build({ reminders: { dividends: true }, holdings });
    expect(keys(upcomingReminders(data, NOW))).toEqual([
      'dividend-ex:ko:2026-10-23',
      'dividend-pay:ko:2026-10-23',
    ]);
    // November's payout is a step forward with guessed dates, so it gets no reminder.
    const longer = upcomingReminders(data, NOW, { horizonDays: 60 });
    expect(longer.map((r) => [r.kind, r.at])).toEqual([
      ['dividend-ex', '2026-10-15T09:00'],
      ['dividend-pay', '2026-10-23T09:00'],
    ]);
  });

  it('reminds only of the dates Yahoo gave, not of guessed ones', () => {
    // An ex-date alone: the pay date is a guess, so there is no pay-day reminder.
    const exOnly = [payer({ nextExDate: '2026-10-20' })];
    const data = build({ reminders: { dividends: true }, holdings: exOnly });
    expect(upcomingReminders(data, NOW).map((r) => [r.kind, r.at])).toEqual([
      ['dividend-ex', '2026-10-19T09:00'],
    ]);
  });

  it('reminds of an ex-date inside the horizon though the payout pays after it', () => {
    // Ex on 11-10 (reminder 11-09), paying 11-20: the horizon ends 11-13.
    const holdings = [payer({ nextExDate: '2026-11-10', nextPayDate: '2026-11-20' })];
    const data = build({ reminders: { dividends: true }, holdings });
    expect(upcomingReminders(data, NOW).map((r) => [r.kind, r.at])).toEqual([
      ['dividend-ex', '2026-11-09T09:00'],
    ]);
  });

  it('reminds only on the pay date when no ex-date is known', () => {
    const holdings = [payer({ nextPayDate: '2026-10-27' })];
    const data = build({ reminders: { dividends: true }, holdings });
    expect(kinds(upcomingReminders(data, NOW))).toEqual(['dividend-pay']);
  });

  it('never schedules a moment already past, nor a payout already confirmed or skipped', () => {
    // Ex on 10-15 would remind on 10-14 at 09:00, before NOW (10:00); it pays on 10-16.
    const soon = [payer({ nextExDate: '2026-10-15', nextPayDate: '2026-10-16' })];
    expect(
      keys(upcomingReminders(build({ reminders: { dividends: true }, holdings: soon }), NOW)),
    ).toEqual(['dividend-pay:ko:2026-10-16']);

    const later = [payer({ nextExDate: '2026-10-20', nextPayDate: '2026-10-27' })];
    for (const status of ['confirmed', 'skipped'] as const) {
      const settled = makeDividend({
        holdingId: 'ko',
        expectedPayDate: '2026-10-27',
        status,
        ...(status === 'skipped' ? { amount: 0, bucket: null } : {}),
      });
      const data = build({
        reminders: { dividends: true },
        holdings: later,
        dividends: [settled],
      });
      expect(upcomingReminders(data, NOW)).toEqual([]);
    }
  });

  it('leaves the amount out when the exchange rate is unknown', () => {
    const holdings = [payer({ nextPayDate: '2026-10-27' }, { currency: 'EUR', quote: null })];
    const data = build({ reminders: { dividends: true }, holdings });
    expect(upcomingReminders(data, NOW)[0]?.body).toBe('Confirm it when it arrives.');
  });

  describe('Buy it? is gone', () => {
    /** A row the retired feature saved: the part of it that used to bring a reminder back. */
    const decision = (over: Record<string, unknown>) =>
      ({
        id: 'dec',
        status: 'open',
        remindOn: null,
        boughtOn: null,
        usage: null,
        ...over,
      }) as never;
    const left: BuyDecision[] = [
      decision({ id: 'dec-wait', status: 'waiting', remindOn: '2026-10-20' }),
      decision({ id: 'dec-bought', status: 'bought', boughtOn: '2026-10-10' }),
    ];

    it('brings no reminder for a saved decision, whatever its switch says', () => {
      for (const buyIt of [true, false]) {
        const setup = { all: true, reminders: { buyIt } };
        const bare = build(setup);
        const saved = build({ ...setup, decisions: left });
        expect(saved.tables.buyDecision).toHaveLength(2);
        expect(upcomingReminders(saved, NOW)).toEqual(upcomingReminders(bare, NOW));
        expect(pastReminders(saved, NOW)).toEqual(pastReminders(bare, NOW));
      }
    });
  });

  it('honours each switch', () => {
    const setup = {
      all: true,
      lastBackupAt: noon('2026-10-07'),
      subscriptions: [makeSubscription({ id: 'sub-tv', nextRenewal: '2026-10-20' })],
      freezes: [freeze()],
      holdings: [payer({ nextExDate: '2026-10-20', nextPayDate: '2026-10-27' })],
      ...visa(),
    };
    const everything = upcomingReminders(build(setup), NOW);
    expect(kinds(everything)).toEqual([
      'card-due',
      'daily-log',
      'dividend-ex',
      'dividend-pay',
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
    // The old backup switch is still in the data, and drops nothing.
    expect(dropped({ backup: false })).toEqual([]);
    expect(dropped({ dividends: false })).toEqual(['dividend-ex', 'dividend-pay']);
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

describe('pastReminders', () => {
  const past = (setup: Setup, days?: number, now = NOW) => pastReminders(build(setup), now, days);

  /** One occasion of every kind the inbox keeps, each already past at `NOW`. */
  const lately = {
    all: true,
    lastBackupAt: noon('2026-10-01'),
    subscriptions: [makeSubscription({ id: 'sub-tv', nextRenewal: '2026-10-15' })],
    // The freeze ends the morning the dividend pays, so two reminders share one moment.
    freezes: [freeze({ start: '2026-10-05', end: '2026-10-12' })],
    holdings: [payer({ nextExDate: '2026-10-10', nextPayDate: '2026-10-12' })],
    ...visa({ dueDay: 16 }),
  };

  it('is what the rules planned for the last 30 days, newest first, with the master switch off', () => {
    const data = build({
      reminders: { enabled: false, freeze: true },
      freezes: [freeze({ start: '2026-10-12', end: '2026-10-13' })],
    });
    expect(upcomingReminders(data, NOW)).toEqual([]);
    expect(pastReminders(data, NOW)).toEqual([
      {
        key: 'freeze-end:freeze-1',
        kind: 'freeze-end',
        at: '2026-10-13T09:00',
        title: 'Salary freeze ends today',
        body: 'Your expected pay goes back to normal.',
        route: '/freeze',
      },
      {
        key: 'freeze-start:freeze-1',
        kind: 'freeze-start',
        at: '2026-10-12T09:00',
        title: 'Salary freeze starts today',
        body: 'Expected pay is lower while it lasts. Bills still apply.',
        route: '/freeze',
      },
    ]);
  });

  it('covers the 30 days up to now, both ends in, and nothing later', () => {
    const freezes = [
      freeze({ id: 'a', start: '2026-09-13', end: '2026-09-14' }), // 09:00, before the window's 10:00
      freeze({ id: 'b', start: '2026-09-15', end: '2026-10-14' }),
      freeze({ id: 'c', start: '2026-10-14', end: '2026-10-15' }), // ends tomorrow: not yet
    ];
    expect(keys(past({ reminders: { freeze: true }, freezes }))).toEqual([
      'freeze-start:c',
      'freeze-end:b',
      'freeze-start:b',
    ]);

    // At 09:00 the window starts at 09:00 a month back, and a moment equal to now is past, not upcoming.
    const nine = '2026-10-14T09:00';
    const data = build({ reminders: { freeze: true }, freezes });
    expect(keys(pastReminders(data, nine))).toEqual([
      'freeze-start:c',
      'freeze-end:b',
      'freeze-start:b',
      'freeze-end:a',
    ]);
    expect(keys(upcomingReminders(data, nine))).toEqual(['freeze-end:c']);
  });

  it('takes a shorter window', () => {
    const reviews = { reminders: { reviews: true } };
    expect(keys(past(reviews))).toEqual([
      'week:2026-10-11',
      'week:2026-10-04',
      'month:2026-09-30',
      'week:2026-09-27',
      'week:2026-09-20',
    ]);
    expect(keys(past(reviews, 7))).toEqual(['week:2026-10-11']);
  });

  it('does not look back past the moment the profile was made', () => {
    const reviews = { reminders: { reviews: true } };
    expect(keys(past({ ...reviews, profileSince: noon('2026-10-02') }))).toEqual([
      'week:2026-10-11',
      'week:2026-10-04',
    ]);
    // Made on Sunday the 4th at 19:00, an hour after that evening's check-in.
    const since = localDateTime('2026-10-04T19:00').toISOString();
    expect(keys(past({ ...reviews, profileSince: since }))).toEqual(['week:2026-10-11']);
  });

  it('is empty for a brand-new profile, whatever else is in the data', () => {
    const madeNow = localDateTime(NOW).toISOString();
    expect(past({ ...lately, profileSince: madeNow })).toEqual([]);
    // Made at 09:00 it holds what came due since: this morning's renewal and card reminders.
    const earlier = localDateTime('2026-10-14T09:00').toISOString();
    expect(keys(past({ ...lately, profileSince: earlier }))).toEqual([
      'renewal:sub-tv:2026-10-15',
      'card:card-visa:2026-10-16',
    ]);
  });

  it('is empty before there is a profile and settings', () => {
    expect(pastReminders(emptySnapshot(), NOW)).toEqual([]);
    const noProfile = build({ reminders: { reviews: true } });
    noProfile.tables.profile = [];
    expect(pastReminders(noProfile, NOW)).toEqual([]);
  });

  it('keeps every kind the inbox shows, and never the daily nudge', () => {
    const everything = past(lately);
    expect(kinds(everything)).toEqual([
      'card-due',
      'dividend-ex',
      'dividend-pay',
      'freeze-end',
      'freeze-start',
      'monthly-review',
      'renewal',
      'weekly-review',
    ]);

    // This morning's nudge (09:00 is before now) fired, and is still left out.
    const morning = { ...lately, reminders: { dailyTime: '09:00' } };
    expect(past(morning).some((r) => r.key.startsWith('daily:'))).toBe(false);
  });

  it('honours each switch', () => {
    const everything = kinds(past(lately));
    const without = (off: Partial<ReminderSettings>) => kinds(past({ ...lately, reminders: off }));
    const dropped = (off: Partial<ReminderSettings>) =>
      everything.filter((k) => !without(off).includes(k));

    expect(dropped({ bills: false })).toEqual(['card-due', 'renewal']);
    expect(dropped({ freeze: false })).toEqual(['freeze-end', 'freeze-start']);
    expect(dropped({ reviews: false })).toEqual(['monthly-review', 'weekly-review']);
    expect(dropped({ dividends: false })).toEqual(['dividend-ex', 'dividend-pay']);
    expect(dropped({ dailyLog: false, backup: false })).toEqual([]);
  });

  it('keeps one reminder for a key, the newest', () => {
    const freezes = [
      freeze({ id: 'f', start: '2026-10-01', end: '2026-10-02' }),
      freeze({ id: 'f', start: '2026-10-08', end: '2026-10-09' }),
    ];
    const got = past({ reminders: { freeze: true }, freezes });
    expect(got.map((r) => [r.key, r.at])).toEqual([
      ['freeze-end:f', '2026-10-09T09:00'],
      ['freeze-start:f', '2026-10-08T09:00'],
    ]);
  });

  it('sorts newest first, and by key within a moment', () => {
    const got = past(lately);
    expect(got.map((r) => r.at)).toEqual(
      got
        .map((r) => r.at)
        .sort()
        .reverse(),
    );
    const sameMoment = got.filter((r) => r.at === '2026-10-12T09:00').map((r) => r.key);
    expect(sameMoment.length).toBeGreaterThan(1);
    expect(sameMoment).toEqual([...sameMoment].sort().reverse());
  });

  it('shares no reminder with the upcoming ones: each moment is one or the other', () => {
    const before = past(lately);
    const after = upcomingReminders(build(lately), NOW);
    expect(after.length).toBeGreaterThan(0);
    expect(keys(before).filter((k) => keys(after).includes(k))).toEqual([]);
    for (const r of before) expect(r.at <= NOW).toBe(true);
    for (const r of after) expect(r.at > NOW).toBe(true);
  });

  // The rules plan ahead from a stored "next" date, so they can name only the occasion of the next
  // date a subscription, a card or a dividend has. What follows pins what that gives, and that
  // nothing is made up for the days before it.
  describe('what a rule can only see ahead', () => {
    it('lists a renewal from its reminder until the charge is made, and never an older one', () => {
      const subscriptions = [
        // Renews tomorrow: its reminder was this morning.
        makeSubscription({ id: 'sub-due', nextRenewal: '2026-10-15' }),
        // Charged on the 12th, so its date moved on: the reminder before that cannot be found again.
        makeSubscription({ id: 'sub-charged', nextRenewal: '2026-11-12' }),
        // Renews the day after: its reminder is tomorrow.
        makeSubscription({ id: 'sub-later', nextRenewal: '2026-10-16' }),
      ];
      expect(keys(past({ reminders: { bills: true }, subscriptions }))).toEqual([
        'renewal:sub-due:2026-10-15',
      ]);
    });

    it('lists a card bill from two days before it is due, and nothing once that has passed', () => {
      const card = (dueDay: number | null) =>
        keys(past({ reminders: { bills: true }, ...visa({ dueDay }) }));
      expect(card(16)).toEqual(['card:card-visa:2026-10-16']);
      expect(card(21)).toEqual([]);
      expect(card(10)).toEqual([]);
      // With no due day the bill is "due" every day: not a reminder that ever fired.
      expect(card(null)).toEqual([]);
    });

    it('lists the dates the price service gave, until the payout is confirmed or skipped', () => {
      const given = [payer({ nextExDate: '2026-10-10', nextPayDate: '2026-10-12' })];
      const on = (dividends: Dividend[] = []) =>
        keys(past({ reminders: { dividends: true }, holdings: given, dividends }));
      expect(on()).toEqual(['dividend-pay:ko:2026-10-12', 'dividend-ex:ko:2026-10-12']);
      expect(on([makeDividend({ holdingId: 'ko', expectedPayDate: '2026-10-12' })])).toEqual([]);

      // An ex-date the service listed as gone has no pay date of its own: only the ex-day's reminder.
      const history = [{ date: '2026-10-02', amount: 1.25 }];
      const listed = [payer({ history, nextExDate: '2026-11-10', nextPayDate: '2026-11-20' })];
      expect(
        past({ reminders: { dividends: true }, holdings: listed }).map((r) => [r.kind, r.at]),
      ).toEqual([['dividend-ex', '2026-10-01T09:00']]);
    });
  });
});

describe('inboxItems', () => {
  const reviews = { reminders: { reviews: true } };

  it('is the past reminders, each with whether it was read', () => {
    const data = build(reviews);
    expect(inboxItems(data, NOW)).toEqual(
      pastReminders(data, NOW).map((r) => ({ ...r, read: false })),
    );
    expect(inboxItems(data, NOW)).toHaveLength(5);
  });

  it('reads one by its key, and all of them up to a moment', () => {
    const readBefore = localDateTime('2026-09-30T18:00').toISOString();
    const data = build({ ...reviews, inbox: { readBefore, read: ['week:2026-10-11'] } });
    expect(inboxItems(data, NOW).map((i) => [i.key, i.read])).toEqual([
      ['week:2026-10-11', true],
      ['week:2026-10-04', false],
      ['month:2026-09-30', true],
      ['week:2026-09-27', true],
      ['week:2026-09-20', true],
    ]);
  });

  it('still holds the keys of backup reminders that were read, and lists nothing for them', () => {
    // Saved before backups went: those keys stay in the list, which the store trims by itself.
    const data = build({ ...reviews, inbox: { readBefore: null, read: ['backup:2026-10-07'] } });
    expect(inboxItems(data, NOW).map((i) => i.key)).toEqual(
      pastReminders(data, NOW).map((r) => r.key),
    );
    expect(inboxItems(data, NOW).some((i) => i.key.startsWith('backup:'))).toBe(false);
  });

  it('is empty before there is a profile and settings', () => {
    expect(inboxItems(emptySnapshot(), NOW)).toEqual([]);
  });
});

describe('REMINDER_AREA', () => {
  it('names the area of every kind', () => {
    const area: Record<ReminderKind, string> = {
      renewal: 'Subscriptions',
      'card-due': 'Cards',
      'freeze-start': 'Salary freeze',
      'freeze-end': 'Salary freeze',
      'weekly-review': 'Budget',
      'monthly-review': 'Budget',
      'dividend-ex': 'Invest',
      'dividend-pay': 'Invest',
      'daily-log': 'Today',
    };
    expect(REMINDER_AREA).toEqual(area);
  });

  it('has no Buy it? kind', () => {
    expect(Object.keys(REMINDER_AREA).filter((kind) => kind.startsWith('buy-'))).toEqual([]);
    expect(Object.values(REMINDER_AREA)).not.toContain('Buy it?');
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
