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
  /** In the holding's currency. */
  perShare: number;
  /** After withholding, in minor units of the profile currency; null when the rate is unknown. */
  net: number | null;
};

/**
 * The payouts whose pay date falls from `from` through `to` (inclusive) and that the person has
 * neither confirmed nor skipped. Each holding has one anchor payout: Yahoo's `next` when it has an
 * ex- or pay date (it is the latest announced payout, so it is often already past), else the last
 * history entry. Later payouts step forward from the anchor by the inferred frequency. A payout
 * whose ex-date (its pay date, without one) is before the purchase is not earned, so it is left out.
 * A payout is settled by a record for the same holding whose `expectedPayDate` is its pay date or
 * within half a step of it (see `SETTLE_WITHIN`).
 */
export function expectedPayouts(
  data: DataSnapshot,
  profileCurrency: string,
  from: LocalDate,
  to: LocalDate,
): ExpectedPayout[] {
  const recorded = new Map<string, LocalDate[]>();
  for (const d of data.tables.dividend) {
    recorded.set(d.holdingId, [...(recorded.get(d.holdingId) ?? []), d.expectedPayDate]);
  }
  const out: ExpectedPayout[] = [];

  for (const holding of data.tables.holding) {
    const info = holding.dividendInfo;
    if (!info) continue;
    const last = info.history.reduce<(typeof info.history)[number] | undefined>(
      (latest, e) => (!latest || e.date > latest.date ? e : latest),
      undefined,
    );
    const perShare = info.nextAmount ?? last?.amount;
    // A pay date before its ex-date is the previous cycle's, left behind by Yahoo: no pay date.
    const nextPay =
      info.nextPayDate !== null && info.nextExDate !== null && info.nextPayDate < info.nextExDate
        ? null
        : info.nextPayDate;
    const base = info.nextExDate ?? nextPay ?? last?.date;
    if (perShare === undefined || base === undefined) continue;
    // The base is an ex-date unless Yahoo gave only a pay date.
    const baseIsEx = info.nextExDate !== null || nextPay === null;
    // shortcut: later payouts reuse the announced payout's ex-to-pay gap, and it is 0 when Yahoo
    // has no pay date; upgrade when pay dates are stored per payout.
    const lag =
      info.nextExDate !== null && nextPay !== null ? daysApart(info.nextExDate, nextPay) : 0;
    const frequency = inferFrequency(info.history);
    const months = frequency ? STEP_MONTHS[frequency] : 0;
    const settleWithin = frequency ? SETTLE_WITHIN[frequency] : SETTLE_WITHIN_UNKNOWN;
    const records = recorded.get(holding.id) ?? [];
    const rate = holdingRate(holding, profileCurrency);
    const net =
      rate === null
        ? null
        : toMinor(
            holding.shares * perShare * (1 - holding.withholdingPct / 100),
            rate,
            profileCurrency,
          );

    // With no frequency there is only the anchor; otherwise step until past `to`.
    for (let k = 0; k === 0 || months > 0; k++) {
      const stepped = addMonths(base, k * months);
      const payDate = addDays(stepped, lag);
      if (payDate > to) break;
      const exDate = baseIsEx ? stepped : null;
      if (
        payDate < from ||
        (exDate ?? payDate) < holding.purchaseDate ||
        records.some((d) => Math.abs(daysApart(d, payDate)) < settleWithin)
      ) {
        continue;
      }
      out.push({ holding, exDate, payDate, perShare, net });
    }
  }
  return out.sort((a, b) => a.payDate.localeCompare(b.payDate));
}

/** Payouts that paid in the last 60 days and still wait to be confirmed or skipped. */
export function duePayouts(
  data: DataSnapshot,
  profileCurrency: string,
  today: LocalDate,
): ExpectedPayout[] {
  return expectedPayouts(data, profileCurrency, addDays(today, -60), today);
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
  return expectedPayouts(data, profileCurrency, today, addDays(today, 364));
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
      : expectedPayouts(data, profileCurrency, today, endOfMonth(`${shift(11)}-01`)).map((p) => ({
          month: monthKey(p.payDate),
          amount: p.net ?? 0,
        }));
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
