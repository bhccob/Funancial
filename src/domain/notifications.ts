import { nextDueDate, upcomingBills } from './budget';
import { addDays, formatLocalDateTime, localDateTime, toLocalDate, type LocalDate } from './dates';
import { expectedPayouts } from './dividends';
import type { Profile, ReminderSettings, Settings } from './entities';
import { isLoggedExpense } from './game/activity';
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
  | 'backup'
  | 'dividend-ex'
  | 'dividend-pay'
  | 'buy-wait'
  | 'buy-usage';

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
/** An ex-date reminder comes before its payout pays, so payouts are looked for this far past the horizon. */
const PAY_LAG_DAYS = 60;
const USAGE_ASK_AFTER_DAYS = 14;
const DIVIDENDS_ROUTE = '/invest?tab=dividends';

type Context = {
  data: DataSnapshot;
  profile: Profile;
  settings: Settings;
  prefs: ReminderSettings;
  /** The local day of `now`. */
  today: LocalDate;
  now: string;
  /** The first day a reminder can fall on. Rules that go through the days start here. */
  firstDay: LocalDate;
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
  // Only what the person logged: a subscription renewal or an expected salary appears on its own.
  const loggedToday =
    data.tables.expense.some((e) => e.date === today && isLoggedExpense(e)) ||
    data.tables.income.some((i) => i.date === today && i.status === 'confirmed');
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
    // With no due day every day is "due", so there is no day to remind before. It never fired: its
    // "2 days before" was always already past, and the inbox would show one new row a day.
    if (dueDay === null) continue;
    let due = bill.date;
    while (addDays(due, -2) <= lastDay) {
      out.push({
        key: `card:${bill.refId}:${due}`,
        kind: 'card-due',
        at: moment(addDays(due, -2), MORNING),
        title: `${bill.name} payment due in 2 days`,
        body: `${money(bill.amount)} to pay.`,
        route: '/debts',
      });
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
function reviews({ prefs, settings, firstDay, lastDay }: Context): Reminder[] {
  if (!prefs.reviews) return [];
  const out: Reminder[] = [];
  for (const d of eachDay(firstDay, lastDay)) {
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

/** The day before each known ex-date, and each known pay date, at 09:00. */
function dividends({ data, profile, prefs, today, firstDay, lastDay, money }: Context): Reminder[] {
  if (!prefs.dividends) return [];
  const payouts = expectedPayouts(
    data,
    profile.currency,
    firstDay,
    addDays(lastDay, PAY_LAG_DAYS),
    today,
  );
  // Only dates the price service gave: a guessed date would remind on the wrong day.
  return payouts.flatMap((p): Reminder[] => {
    const { id, symbol } = p.holding;
    const out: Reminder[] = [];
    if (p.exDate && p.exDateKnown) {
      out.push({
        key: `dividend-ex:${id}:${p.payDate}`,
        kind: 'dividend-ex',
        at: moment(addDays(p.exDate, -1), MORNING),
        title: `${symbol} goes ex-dividend tomorrow`,
        body: 'Hold your shares through today to get the next payout.',
        route: DIVIDENDS_ROUTE,
      });
    }
    if (p.payDateKnown) {
      const confirm = 'Confirm it when it arrives.';
      out.push({
        key: `dividend-pay:${id}:${p.payDate}`,
        kind: 'dividend-pay',
        at: moment(p.payDate, MORNING),
        title: `${symbol} pays a dividend today`,
        // With no exchange rate there is no amount to name.
        body: p.net === null ? confirm : `Expected about ${money(p.net)}. ${confirm}`,
        route: DIVIDENDS_ROUTE,
      });
    }
    return out;
  });
}

/** A waiting decision on the day it was set to come back, and a purchase 14 days on, if still unrated. */
function buyIt({ data, prefs }: Context): Reminder[] {
  if (!prefs.buyIt) return [];
  return data.tables.buyDecision.flatMap((d): Reminder[] => {
    const route = `/buy/${d.id}`;
    if (d.status === 'waiting' && d.remindOn) {
      return [
        {
          key: `buy-wait:${d.id}:${d.remindOn}`,
          kind: 'buy-wait',
          at: moment(d.remindOn, MORNING),
          title: `Still want it? ${d.ask.item}`,
          body: 'You chose to wait. See your check again.',
          route,
        },
      ];
    }
    if (d.status === 'bought' && d.boughtOn && d.usage === null) {
      return [
        {
          key: `buy-usage:${d.id}`,
          kind: 'buy-usage',
          at: moment(addDays(d.boughtOn, USAGE_ASK_AFTER_DAYS), MORNING),
          title: `Was ${d.ask.item} worth it?`,
          body: 'Rate it, and your next check takes it into account.',
          route,
        },
      ];
    }
    return [];
  });
}

const RULES: Rule[] = [dailyLog, renewals, cardBills, freezes, reviews, backups, dividends, buyIt];

/** What the rules plan for a context's days. Each caller keeps the moments that suit its window. */
const plan = (ctx: Context): Reminder[] => RULES.flatMap((rule) => rule(ctx));

function contextFor(
  data: DataSnapshot,
  now: string,
  firstDay: LocalDate,
  lastDay: LocalDate,
): Context | null {
  const profile = data.tables.profile[0];
  const settings = data.tables.settings[0];
  if (!profile || !settings) return null;
  return {
    data,
    profile,
    settings,
    prefs: settings.reminders,
    today: now.slice(0, 10),
    now,
    firstDay,
    lastDay,
    money: (minor) => formatMoney(minor, profile.currency),
  };
}

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
  const today = now.slice(0, 10);
  const ctx = contextFor(
    data,
    now,
    today,
    addDays(today, opts.horizonDays ?? DEFAULT_HORIZON_DAYS),
  );
  if (!ctx?.prefs.enabled) return [];

  // The same wall-clock time `horizonDays` later: "within 30 days" means 30 days, not 30 dates.
  const horizonEnd = moment(ctx.lastDay, now.slice(11));

  return plan(ctx)
    .filter((r) => r.at > now && r.at <= horizonEnd)
    .sort(byTimeThenKey)
    .slice(0, opts.limit ?? DEFAULT_LIMIT);
}

/** Kinds the inbox leaves out: a nightly nudge and a weekly one are noise to catch up on. */
const NOT_IN_INBOX: ReadonlySet<ReminderKind> = new Set(['daily-log', 'backup']);

/**
 * The reminders that came due in the `days` up to `now` (inclusive, so the complement of
 * `upcomingReminders`), newest first, one per key: the same rules, run for the days behind. They
 * are what the rules plan from the data as it is now, so the master switch does not matter, the
 * per-kind ones do, and nothing from before the profile was made is listed.
 *
 * A rule that plans ahead from a stored "next" date (a subscription's renewal, a card's due day, a
 * dividend's announced dates) can only name that next occasion. Its reminder is listed from its
 * moment until the charge, the due day or the payout moves the date on; an occasion before that is
 * gone from the data and is not made up. A card with no due day has no occasion at all.
 */
export function pastReminders(
  data: DataSnapshot,
  now: string,
  days = DEFAULT_HORIZON_DAYS,
): Reminder[] {
  const today = now.slice(0, 10);
  const profile = data.tables.profile[0];
  if (!profile) return [];
  // The same wall-clock time `days` earlier, as the horizon is counted; and not before the profile.
  const windowStart = moment(addDays(today, -days), now.slice(11));
  const madeAt = formatLocalDateTime(new Date(profile.createdAt));
  const from = windowStart > madeAt ? windowStart : madeAt;
  const ctx = contextFor(data, now, from.slice(0, 10), today);
  if (!ctx) return [];

  const seen = new Set<string>();
  return plan(ctx)
    .filter((r) => r.at >= from && r.at <= now && !NOT_IN_INBOX.has(r.kind))
    .sort((a, b) => byTimeThenKey(b, a))
    .filter((r) => !seen.has(r.key) && seen.add(r.key));
}

/** Which part of the app a reminder is about, for the inbox row. */
export const REMINDER_AREA: Record<ReminderKind, string> = {
  renewal: 'Subscriptions',
  'card-due': 'Cards',
  'freeze-start': 'Salary freeze',
  'freeze-end': 'Salary freeze',
  'weekly-review': 'Budget',
  'monthly-review': 'Budget',
  'dividend-ex': 'Invest',
  'dividend-pay': 'Invest',
  'buy-wait': 'Buy it?',
  'buy-usage': 'Buy it?',
  'daily-log': 'Today',
  backup: 'Backup',
};

export type InboxItem = Reminder & { read: boolean };

/** The inbox's reminders, each marked read by its key or by falling before `readBefore`. */
export function inboxItems(data: DataSnapshot, now: string): InboxItem[] {
  const inbox = data.tables.settings[0]?.inbox;
  const readBefore = inbox?.readBefore ? Date.parse(inbox.readBefore) : -Infinity;
  const read = new Set(inbox?.read);
  return pastReminders(data, now).map((r) => ({
    ...r,
    read: read.has(r.key) || localDateTime(r.at).getTime() <= readBefore,
  }));
}
