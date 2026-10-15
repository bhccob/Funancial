import type { LocalDate } from './dates';
import type { Profile, SalaryFreeze } from './entities';
import { daysInMonth, endOfMonth, monthKey, monthsBetween } from './periods';

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;
const daysBetween = (a: LocalDate, b: LocalDate) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS) + 1;

/** The pay date of a month, clamped (pay day 31 in September is the 30th). */
export function payDate(month: string, payDay: number): LocalDate {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return `${month}-${pad(Math.min(payDay, daysInMonth(y, m)))}`;
}

/** Frozen days in each month the freeze touches. */
function frozenDays(start: LocalDate, end: LocalDate): Array<{ month: string; days: number }> {
  return monthsBetween(monthKey(start), monthKey(end)).map((month) => {
    const from = `${month}-01` > start ? `${month}-01` : start;
    const last = endOfMonth(`${month}-01`);
    const to = last < end ? last : end;
    return { month, days: daysBetween(from, to) };
  });
}

const computedShare = (monthly: number, month: string, days: number) =>
  Math.round((monthly * days) / daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7))));

/** Pay lost to a freeze, valuing each day by its own month's daily rate. */
export function freezeLoss(start: LocalDate, end: LocalDate, monthlySalary: number): number {
  return frozenDays(start, end).reduce(
    (s, { month, days }) => s + computedShare(monthlySalary, month, days),
    0,
  );
}

/**
 * How a freeze's lost pay is spread over months. Computed freezes use each month's daily rate;
 * an entered amount is split by days, the last month taking the rounding remainder.
 */
export function freezeAllocation(
  freeze: SalaryFreeze,
  monthlySalary: number,
): Record<string, number> {
  const parts = frozenDays(freeze.start, freeze.end);
  const out: Record<string, number> = {};
  if (freeze.mode === 'computed') {
    for (const { month, days } of parts) out[month] = computedShare(monthlySalary, month, days);
    return out;
  }
  const totalDays = parts.reduce((s, p) => s + p.days, 0);
  let assigned = 0;
  parts.forEach(({ month, days }, i) => {
    const share =
      i === parts.length - 1
        ? freeze.lostAmount - assigned
        : Math.round((freeze.lostAmount * days) / totalDays);
    out[month] = share;
    assigned += share;
  });
  return out;
}

/** Salary expected for a month after freezes. Bills are unaffected by freezes. */
export function expectedSalary(profile: Profile, freezes: SalaryFreeze[], month: string): number {
  const monthly = profile.salary?.monthlyAmount ?? 0;
  if (monthly === 0) return 0;
  const frozen = freezes.reduce((s, f) => s + (freezeAllocation(f, monthly)[month] ?? 0), 0);
  return Math.max(0, monthly - frozen);
}
