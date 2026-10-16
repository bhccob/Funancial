import { addDays, type LocalDate } from './dates';
import type { Holding } from './entities';
import { daysInMonth, endOfMonth, monthKey, monthsBetween } from './periods';
import { holdingRate, toMinor } from './portfolio';
import type { DataSnapshot } from './snapshot';

export type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

const STEP_MONTHS: Record<Frequency, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};
/**
 * How near (in days, exclusive) a confirmed or skipped record must lie to a payout to settle it:
 * half a step. The real pay date often differs from the inferred one, and a payout that moved a
 * few days must not come back as due after it was confirmed. Without a frequency, a quarter's half.
 */
const SETTLE_WITHIN: Record<Frequency, number> = {
  monthly: 15,
  quarterly: 45,
  semiannual: 90,
  annual: 180,
};
const SETTLE_WITHIN_UNKNOWN = 45;
/** Days from ex-date to pay date when Yahoo announces no pay date to measure the gap by. */
const DEFAULT_LAG = 14;
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const daysApart = (a: LocalDate, b: LocalDate) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** `d` moved by `n` months, on the same day of the month where the month is long enough. */
function addMonths(d: LocalDate, n: number): LocalDate {
  const total = Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1 + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(Number(d.slice(8, 10)), daysInMonth(y, m)))}`;
}

/** How often a holding pays, from the median gap between its past payouts; null if unclear. */
export function inferFrequency(
  history: Array<{ date: LocalDate; amount: number }>,
): Frequency | null {
  const dates = history.map((h) => h.date).sort();
  if (dates.length < 2) return null;
  const gaps = dates.slice(1).map((d, i) => daysApart(dates[i]!, d));
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  const median = gaps.length % 2 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
  if (median <= 45) return 'monthly';
  if (median <= 120) return 'quarterly';
  if (median <= 240) return 'semiannual';
  if (median <= 400) return 'annual';
  return null;
}

export type ExpectedPayout = {
  holding: Holding;
  exDate: LocalDate | null;
  payDate: LocalDate;
  /** Whether `exDate` is a real ex-date from the price service, not a guess. */
  exDateKnown: boolean;
  /** Whether `payDate` is a real pay date from the price service, not a guess. */
  payDateKnown: boolean;
  /** In the holding's currency. */
  perShare: number;
  /** After withholding, in minor units of the profile currency; null when the rate is unknown. */
  net: number | null;
};

type Payout = Omit<ExpectedPayout, 'holding' | 'net'>;

/**
 * Every payout of a holding, earned or not, settled or not: one per history entry (a real ex-date,
 * at its own amount), Yahoo's `next` (which replaces a history entry on the same ex-date), and steps
 * forward from the latest ex-date by the frequency, up to `to`. A dividend with no payout for over
 * two steps before `today` has stopped, so it gets no steps; without a frequency there are none.
 */
function schedule(
  holding: Holding,
  frequency: Frequency | null,
  to: LocalDate,
  today: LocalDate,
): Payout[] {
  const info = holding.dividendInfo;
  if (!info) return [];
  const { history, nextExDate } = info;
  const last = history.reduce<(typeof history)[number] | undefined>(
    (latest, e) => (!latest || e.date > latest.date ? e : latest),
    undefined,
  );
  // A pay date before its ex-date is the previous cycle's, left behind by Yahoo: no pay date.
  const nextPay =
    info.nextPayDate !== null && nextExDate !== null && info.nextPayDate < nextExDate
      ? null
      : info.nextPayDate;
  // shortcut: no per-symbol pay lag without Yahoo's calendar, so every payout takes the announced
  // payout's ex-to-pay gap, or 14 days without one; upgrade when pay dates are stored per payout.
  const lag =
    nextExDate !== null && nextPay !== null ? daysApart(nextExDate, nextPay) : DEFAULT_LAG;

  const out: Payout[] = history
    .filter((e) => e.date !== nextExDate)
    .map((e) => ({
      exDate: e.date,
      payDate: addDays(e.date, lag),
      exDateKnown: true,
      payDateKnown: false,
      perShare: e.amount,
    }));
  const perShare = info.nextAmount ?? last?.amount;
  if (perShare === undefined) return out;
  if (nextExDate !== null || nextPay !== null) {
    out.push({
      exDate: nextExDate,
      payDate: nextPay ?? addDays(nextExDate!, lag),
      exDateKnown: nextExDate !== null,
      payDateKnown: nextPay !== null,
      perShare,
    });
  }

  // A pay date alone stands for an ex-date `lag` days before it.
  const nextEx = nextExDate ?? (nextPay === null ? null : addDays(nextPay, -lag));
  const latest = nextEx !== null && (!last || nextEx > last.date) ? nextEx : last?.date;
  if (!frequency || !latest) return out;
  const months = STEP_MONTHS[frequency];
  if (latest < addMonths(today, -2 * months)) return out;
  for (let k = 1; ; k++) {
    const exDate = addMonths(latest, k * months);
    const payDate = addDays(exDate, lag);
    if (payDate > to) break;
    out.push({ exDate, payDate, exDateKnown: false, payDateKnown: false, perShare });
  }
  return out;
}

/**
 * The payouts of the holdings that pay from `from` through `to` (inclusive), earned by holding the
 * shares on the ex-date (the pay date, without one), that a record settles (`settled`) or that
 * still wait. A payout is settled by a confirmed or skipped record of the same holding whose
 * `expectedPayDate` is within half a step of its pay date (see `SETTLE_WITHIN`); a record whose
 * holding was deleted settles by symbol, so deleting and adding a holding again cannot reopen a
 * payout, while two lots of one symbol keep their records apart.
 */
function payouts(
  data: DataSnapshot,
  profileCurrency: string,
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
  settled: boolean,
): ExpectedPayout[] {
  const held = new Set(data.tables.holding.map((h) => h.id));
  const out: ExpectedPayout[] = [];

  for (const holding of data.tables.holding) {
    const frequency = inferFrequency(holding.dividendInfo?.history ?? []);
    const settleWithin = frequency ? SETTLE_WITHIN[frequency] : SETTLE_WITHIN_UNKNOWN;
    const records = data.tables.dividend.filter((d) =>
      held.has(d.holdingId) ? d.holdingId === holding.id : d.symbol === holding.symbol,
    );
    const rate = holdingRate(holding, profileCurrency);

    for (const p of schedule(holding, frequency, to, today)) {
      if (p.payDate < from || p.payDate > to || (p.exDate ?? p.payDate) < holding.purchaseDate) {
        continue;
      }
      const isSettled = records.some(
        (d) => Math.abs(daysApart(d.expectedPayDate, p.payDate)) < settleWithin,
      );
      if (isSettled !== settled) continue;
      const net =
        rate === null
          ? null
          : toMinor(
              holding.shares * p.perShare * (1 - holding.withholdingPct / 100),
              rate,
              profileCurrency,
            );
      out.push({ holding, ...p, net });
    }
  }
  return out.sort((a, b) => a.payDate.localeCompare(b.payDate));
}

/**
 * The payouts from `from` through `to` that the person has neither confirmed nor skipped yet, as
 * seen on `today`, which decides whether a dividend has stopped (see `schedule`).
 */
export function expectedPayouts(
  data: DataSnapshot,
  profileCurrency: string,
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
): ExpectedPayout[] {
  return payouts(data, profileCurrency, from, to, today, false);
}

/** The payouts from `from` through `to` that a confirmed or skipped record settles. */
export function settledPayouts(
  data: DataSnapshot,
  profileCurrency: string,
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
): ExpectedPayout[] {
  return payouts(data, profileCurrency, from, to, today, true);
}

/** Payouts that paid in the last 60 days and still wait to be confirmed or skipped. */
export function duePayouts(
  data: DataSnapshot,
  profileCurrency: string,
  today: LocalDate,
): ExpectedPayout[] {
  return expectedPayouts(data, profileCurrency, addDays(today, -60), today, today);
}

/** Confirmed dividends by the day they were paid, reinvested ones included. */
export function dividendTotals(
  data: DataSnapshot,
  today: LocalDate,
): { month: number; quarter: number; year: number } {
  const quarterOf = (d: LocalDate) => Math.floor((Number(d.slice(5, 7)) - 1) / 3);
  const totals = { month: 0, quarter: 0, year: 0 };
  for (const d of data.tables.dividend) {
    if (d.status !== 'confirmed' || d.paidOn.slice(0, 4) !== today.slice(0, 4)) continue;
    totals.year += d.amount;
    if (quarterOf(d.paidOn) === quarterOf(today)) totals.quarter += d.amount;
    if (monthKey(d.paidOn) === monthKey(today)) totals.month += d.amount;
  }
  return totals;
}

/** The expected payouts of the next 365 days: today through the day before the same day next year. */
function nextYear(data: DataSnapshot, profileCurrency: string, today: LocalDate) {
  return expectedPayouts(data, profileCurrency, today, addDays(today, 364), today);
}

/** What the holdings are expected to pay over the next 365 days, net, in minor units. */
export function projectedAnnual(
  data: DataSnapshot,
  profileCurrency: string,
  today: LocalDate,
): number {
  return nextYear(data, profileCurrency, today).reduce((sum, p) => sum + (p.net ?? 0), 0);
}

/**
 * Twelve months of dividend income, oldest first. `past` ends with this month and counts what was
 * confirmed, by the day it was paid; `next` starts with this month and counts what is expected from
 * today on, net, by pay date.
 */
export function monthlyIncome(
  data: DataSnapshot,
  profileCurrency: string,
  today: LocalDate,
  dir: 'past' | 'next',
): Array<{ month: string; amount: number }> {
  const thisMonth = monthKey(today);
  const shift = (n: number) => monthKey(addMonths(`${thisMonth}-01`, n));
  const months =
    dir === 'past' ? monthsBetween(shift(-11), thisMonth) : monthsBetween(thisMonth, shift(11));
  const items =
    dir === 'past'
      ? data.tables.dividend
          .filter((d) => d.status === 'confirmed')
          .map((d) => ({ month: monthKey(d.paidOn), amount: d.amount }))
      : expectedPayouts(data, profileCurrency, today, endOfMonth(`${shift(11)}-01`), today).map(
          (p) => ({
            month: monthKey(p.payDate),
            amount: p.net ?? 0,
          }),
        );
  return months.map((month) => ({
    month,
    amount: items.reduce((sum, i) => (i.month === month ? sum + i.amount : sum), 0),
  }));
}

/** The holdings expected to pay the most over the next 365 days, net, biggest first. */
export function topPayers(
  data: DataSnapshot,
  profileCurrency: string,
  today: LocalDate,
  n = 3,
): Array<{ holding: Holding; annual: number }> {
  const annual = new Map<string, number>();
  for (const p of nextYear(data, profileCurrency, today)) {
    annual.set(p.holding.id, (annual.get(p.holding.id) ?? 0) + (p.net ?? 0));
  }
  return data.tables.holding
    .map((holding) => ({ holding, annual: annual.get(holding.id) ?? 0 }))
    .filter((p) => p.annual > 0)
    .sort((a, b) => b.annual - a.annual)
    .slice(0, n);
}
