import type { LocalDate } from './dates';
import type { Profile } from './entities';
import { daysInMonth } from './periods';

const pad = (n: number) => String(n).padStart(2, '0');

/** The pay date of a month, clamped (pay day 31 in September is the 30th). */
export function payDate(month: string, payDay: number): LocalDate {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return `${month}-${pad(Math.min(payDay, daysInMonth(y, m)))}`;
}

/**
 * Salary expected for a month: the monthly amount, or nothing without a salary. Pay days on or
 * before the day the salary was added or changed (`since`) predate it and are never expected.
 */
export function expectedSalary(profile: Profile, month: string): number {
  const salary = profile.salary;
  if (!salary || salary.monthlyAmount === 0) return 0;
  if (salary.since && payDate(month, salary.payDay) <= salary.since) return 0;
  return salary.monthlyAmount;
}
