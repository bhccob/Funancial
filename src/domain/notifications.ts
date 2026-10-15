import { nextDueDate, upcomingBills } from './budget';
import { addDays, toLocalDate, type LocalDate } from './dates';
import type { Profile, ReminderSettings, Settings } from './entities';
import { formatMoney } from './money';
import { endOfMonth, weekRange } from './periods';
import { nextOccurrence } from './recurrence';
import type { DataSnapshot } from './snapshot';

export type ReminderKind =
  | 'daily-log'
  | 'renewal'
  | 'card-due'
  | 'freeze-start'
  | 'freeze-end'
  | 'weekly-review'
  | 'monthly-review'
  | 'backup';

export type Reminder = {
  /** Stable for the same occasion, so a reminder can be replaced or cancelled by key. */
  key: string;
  kind: ReminderKind;
  /** Local wall-clock moment, `YYYY-MM-DDTHH:MM`. */
  at: string;
  title: string;
  body: string;
  route: string;
};

const DEFAULT_HORIZON_DAYS = 30;
const DEFAULT_LIMIT = 60;

const MORNING = '09:00';
const EVENING = '18:00';
const BACKUP_TIME = '19:00';
const BACKUP_EVERY_DAYS = 7;

type Context = {
  data: DataSnapshot;
  profile: Profile;
  settings: Settings;
  prefs: ReminderSettings;
  /** The local day of `now`. */
  today: LocalDate;
  now: string;
  /** The last day a reminder can fall on. Rules stop looking past it. */
  lastDay: LocalDate;
  money: (minor: number) => string;
};

type Rule = (ctx: Context) => Reminder[];

const moment = (date: LocalDate, time: string) => `${date}T${time}`;

/** Each local day from `from` to `to`, inclusive. */
function* eachDay(from: LocalDate, to: LocalDate): Generator<LocalDate> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

function dailyLog({ data, prefs, today, lastDay }: Context): Reminder[] {
  if (!prefs.dailyLog) return [];
  const loggedToday =
    data.tables.expense.some((e) => e.date === today) ||
    data.tables.income.some((i) => i.date === today);
  const out: Reminder[] = [];
  for (const d of eachDay(today, lastDay)) {
    if (d === today && loggedToday) continue;
    out.push({
      key: `daily:${d}`,
      kind: 'daily-log',
      at: moment(d, prefs.dailyTime),
      title: "Log today's spending",
      body: 'Add what you spent today. It takes a few seconds.',
      route: '/add',
    });
  }
  return out;
}

function renewals({ data, prefs, lastDay, money }: Context): Reminder[] {
  if (!prefs.bills) return [];
  const out: Reminder[] = [];
  for (const s of data.tables.subscription) {
    if (s.status !== 'active') continue;
    for (
      let renews = s.nextRenewal;
      addDays(renews, -1) <= lastDay;
      renews = nextOccurrence(renews, s.cycle, s.anchorDay)
    ) {
      out.push({
        key: `renewal:${s.id}:${renews}`,
        kind: 'renewal',
        at: moment(addDays(renews, -1), MORNING),
        title: `${s.name} renews tomorrow`,
        body: `${money(s.amount)} will be charged.`,
        route: '/subscriptions',
      });
    }
  }
  return out;
}

/**
 * Each card's next bill comes from `upcomingBills`; later months repeat it on the card's due day
 * with the same amount, the best figure there is until the next bill is worked out.
 */
function cardBills({ data, prefs, today, lastDay, money }: Context): Reminder[] {
  if (!prefs.bills) return [];
  const out: Reminder[] = [];
  for (const bill of upcomingBills(data, today)) {
    if (bill.kind !== 'card') continue;
    const dueDay = data.tables.debt.find((d) => d.id === bill.refId)?.dueDay ?? null;
    let due = bill.date;
    while (addDays(due, -2) <= lastDay) {
      out.push({
        key: `card:${bill.refId}:${due}`,
        kind: 'card-due',
        at: moment(addDays(due, -2), MORNING),
        title: `${bill.name} payment due in 2 days`,
        body: `${money(bill.amount)} to pay.`,
        route: '/goals',
      });
      // With no due day every day is "due", so there is no month to step to.
      if (dueDay === null) break;
      due = nextDueDate(addDays(due, 1), dueDay);
    }
  }
  return out;
}

function freezes({ data, prefs }: Context): Reminder[] {
  if (!prefs.freeze) return [];
  return data.tables.salaryFreeze.flatMap((f): Reminder[] => [
    {
      key: `freeze-start:${f.id}`,
      kind: 'freeze-start',
      at: moment(f.start, MORNING),
      title: 'Salary freeze starts today',
      body: 'Expected pay is lower while it lasts. Bills still apply.',
      route: '/freeze',
    },
    {
      key: `freeze-end:${f.id}`,
      kind: 'freeze-end',
      at: moment(f.end, MORNING),
      title: 'Salary freeze ends today',
      body: 'Your expected pay goes back to normal.',
      route: '/freeze',
    },
  ]);
}

/** A weekly check-in on each week's last day, or the monthly review when that day also ends the month. */
function reviews({ prefs, settings, today, lastDay }: Context): Reminder[] {
  if (!prefs.reviews) return [];
  const out: Reminder[] = [];
  for (const d of eachDay(today, lastDay)) {
    if (d === endOfMonth(d)) {
      out.push({
        key: `month:${d}`,
        kind: 'monthly-review',
        at: moment(d, EVENING),
        title: 'Monthly review',
        body: 'Look back at this month before it ends.',
        route: '/budget',
      });
    } else if (d === weekRange(d, settings.weekStartsOn).end) {
      out.push({
        key: `week:${d}`,
        kind: 'weekly-review',
        at: moment(d, EVENING),
        title: 'Weekly check-in',
        body: 'See how this week went: spending, limits and bills.',
        route: '/',
      });
    }
  }
  return out;
}

/**
 * A week after the last backup (or after onboarding, before a first one) at 19:00, then weekly.
 * A backup that is already due is reminded at the next 19:00 instead, and weekly from there.
 */
function backups({ profile, settings, prefs, today, now, lastDay }: Context): Reminder[] {
  if (!prefs.backup) return [];
  const since = settings.lastBackupAt ?? profile.onboardedAt;
  if (!since) return [];
  const tonight = moment(today, BACKUP_TIME);
  const nextEvening = now < tonight ? today : addDays(today, 1);
  const due = addDays(toLocalDate(new Date(since)), BACKUP_EVERY_DAYS);
  const first = moment(due, BACKUP_TIME) > now ? due : nextEvening;
  const out: Reminder[] = [];
  for (let d = first; d <= lastDay; d = addDays(d, BACKUP_EVERY_DAYS)) {
    out.push({
      key: `backup:${d}`,
      kind: 'backup',
      at: moment(d, BACKUP_TIME),
      title: 'Back up your data',
      body: 'Save an encrypted copy to Drive or Files. It takes a minute.',
      route: '/settings',
    });
  }
  return out;
}

const RULES: Rule[] = [dailyLog, renewals, cardBills, freezes, reviews, backups];

const byTimeThenKey = (a: Reminder, b: Reminder) =>
  a.at < b.at ? -1 : a.at > b.at ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

/**
 * The reminders to have scheduled on the phone, given the data and the local time now
 * (`YYYY-MM-DDTHH:MM`): strictly after `now`, within `horizonDays`, soonest first, at most
 * `limit`. Empty while reminders are off or before there is a profile.
 */
export function upcomingReminders(
  data: DataSnapshot,
  now: string,
  opts: { horizonDays?: number; limit?: number } = {},
): Reminder[] {
  const profile = data.tables.profile[0];
  const settings = data.tables.settings[0];
  if (!profile || !settings?.reminders.enabled) return [];

  const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const today = now.slice(0, 10);
  const ctx: Context = {
    data,
    profile,
    settings,
    prefs: settings.reminders,
    today,
    now,
    lastDay: addDays(today, horizonDays),
    money: (minor) => formatMoney(minor, profile.currency),
  };
  // The same wall-clock time `horizonDays` later: "within 30 days" means 30 days, not 30 dates.
  const horizonEnd = moment(ctx.lastDay, now.slice(11));

  return RULES.flatMap((rule) => rule(ctx))
    .filter((r) => r.at > now && r.at <= horizonEnd)
    .sort(byTimeThenKey)
    .slice(0, opts.limit ?? DEFAULT_LIMIT);
}
