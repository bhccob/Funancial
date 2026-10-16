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

/** "Thu" */
export function formatWeekday(d: LocalDate, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(utc(d));
}

/** "OCT" */
export function formatMonthShort(d: LocalDate, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
    .format(utc(d))
    .toLocaleUpperCase(locale);
}

/** "Feb 14, 2027" */
export function formatDate(d: LocalDate, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(utc(d));
}

/** 1 → "1st", 22 → "22nd" (for "due on the 21st"). */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10];
  return `${n}${suffix ?? 'th'}`;
}

/** "2026-10" → "October" */
export function formatMonth(yearMonth: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    utc(`${yearMonth}-01`),
  );
}

/** "2026-10" → "October 2026" */
export function formatMonthYear(yearMonth: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utc(`${yearMonth}-01`));
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

/**
 * How long before `now` (epoch ms) a moment (an ISO timestamp) was: "just now", "5 min ago",
 * "2 h ago", "1 day ago". A moment ahead of `now` reads "just now"; one that cannot be read, "".
 */
export function relativeTime(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (Number.isNaN(minutes)) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** "Oct 14, 3:05 PM": a moment (an ISO timestamp) in the reader's own time zone. */
export function formatDateTime(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** 8.44 → "8.4%". With `signed`: "+8.4%", "−3.0%" (a true minus), and a plain "0.0%" for nothing. */
export function formatPercent(pct: number, signed = false, locale?: string): string {
  const rounded = Math.round(Math.abs(pct) * 10) / 10;
  const text = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rounded / 100);
  return signed && rounded !== 0 ? `${pct < 0 ? '−' : '+'}${text}` : text;
}

/** 40 → "40", 0.123456 → "0.1235", 1234.5 → "1,234.5": a number of shares, to four decimals at most. */
export function formatShares(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(n);
}
