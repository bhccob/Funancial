import type { LocalDate } from '@/domain/dates';

// Local dates are calendar days, so they are formatted in UTC to stay on the same day everywhere.
const utc = (d: LocalDate) => new Date(`${d}T00:00:00Z`);

/** "Oct 20" */
export function formatDay(d: LocalDate, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(utc(d));
}

/** "2026-10" → "October" */
export function formatMonth(yearMonth: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    utc(`${yearMonth}-01`),
  );
}

/** Whole days from today to d (negative when d has passed). */
export function daysUntil(today: LocalDate, d: LocalDate): number {
  return Math.round((utc(d).getTime() - utc(today).getTime()) / 86_400_000);
}

/** "today", "tomorrow", "in 6 days", "2 days ago" */
export function relativeDays(today: LocalDate, d: LocalDate): string {
  const days = daysUntil(today, d);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  return days === -1 ? '1 day ago' : `${-days} days ago`;
}
