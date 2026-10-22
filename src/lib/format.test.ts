import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  formatDate,
  formatDateTime,
  formatDay,
  formatMonth,
  formatMonthShort,
  formatMonthYear,
  formatPercent,
  formatShares,
  ordinal,
  relativeDays,
  relativeTime,
  sharesText,
} from './format';

describe('date display', () => {
  it('shows a short day and a month name, whatever the time zone', () => {
    expect(formatDay('2026-10-20', 'en-US')).toBe('Oct 20');
    expect(formatDay('2026-01-01', 'en-US')).toBe('Jan 1');
    expect(formatMonth('2026-10', 'en-US')).toBe('October');
    expect(formatDate('2027-02-14', 'en-US')).toBe('Feb 14, 2027');
    expect(formatMonthYear('2026-10', 'en-US')).toBe('October 2026');
  });

  it('names the month in capitals for chart labels', () => {
    expect(formatMonthShort('2026-10-15', 'en-US')).toBe('OCT');
    expect(formatMonthShort('2026-01-01', 'en-US')).toBe('JAN');
  });

  it('writes day numbers as ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '31st',
    ]);
  });

  it('says how far away a date is', () => {
    expect(relativeDays('2026-10-14', '2026-10-14')).toBe('today');
    expect(relativeDays('2026-10-14', '2026-10-15')).toBe('tomorrow');
    expect(relativeDays('2026-10-14', '2026-10-20')).toBe('in 6 days');
    expect(relativeDays('2026-10-30', '2026-11-02')).toBe('in 3 days');
    expect(relativeDays('2026-10-14', '2026-10-13')).toBe('1 day ago');
    expect(daysUntil('2026-10-14', '2027-03-01')).toBe(138);
  });
});

describe('moments and percentages', () => {
  it('shows a moment as a day and a time', () => {
    // Local time: built from parts, so the test machine's zone does not matter.
    const moment = new Date(2026, 9, 14, 15, 5).toISOString();
    expect(formatDateTime(moment, 'en-US')).toMatch(/^Oct 14, 3:05\s?PM$/);
  });

  it('says how long ago a moment was, from minutes to days', () => {
    const now = Date.parse('2026-10-14T12:00:00.000Z');
    const before = (ms: number) => new Date(now - ms).toISOString();
    const MIN = 60_000;
    expect(relativeTime(before(0), now)).toBe('just now');
    expect(relativeTime(before(59_000), now)).toBe('just now');
    expect(relativeTime(before(MIN), now)).toBe('1 min ago');
    expect(relativeTime(before(59 * MIN), now)).toBe('59 min ago');
    expect(relativeTime(before(60 * MIN), now)).toBe('1 h ago');
    expect(relativeTime(before(5 * 60 * MIN + 30 * MIN), now)).toBe('5 h ago');
    expect(relativeTime(before(23 * 60 * MIN + 59 * MIN), now)).toBe('23 h ago');
    expect(relativeTime(before(24 * 60 * MIN), now)).toBe('1 day ago');
    expect(relativeTime(before(3 * 24 * 60 * MIN), now)).toBe('3 days ago');
    // A clock that runs ahead, or a time that cannot be read, never says "-5 min ago".
    expect(relativeTime(before(-5 * MIN), now)).toBe('just now');
    expect(relativeTime('not a date', now)).toBe('');
  });

  it('shows a percentage with one decimal, and a true minus when signed', () => {
    expect(formatPercent(8.44, false, 'en-US')).toBe('8.4%');
    expect(formatPercent(-3, false, 'en-US')).toBe('3.0%');
    expect(formatPercent(12, true, 'en-US')).toBe('+12.0%');
    expect(formatPercent(-3, true, 'en-US')).toBe('−3.0%');
    expect(formatPercent(-0.04, true, 'en-US')).toBe('0.0%');
    expect(formatPercent(0, true, 'en-US')).toBe('0.0%');
  });

  it('shows shares with up to four decimals and no trailing zeros', () => {
    expect(formatShares(40, 'en-US')).toBe('40');
    expect(formatShares(0.25, 'en-US')).toBe('0.25');
    expect(formatShares(0.123456, 'en-US')).toBe('0.1235');
    expect(formatShares(1234.5, 'en-US')).toBe('1,234.5');
  });

  it('says "share" for exactly one and "shares" for anything else', () => {
    expect(sharesText(1, 'en-US')).toBe('1 share');
    expect(sharesText(0.5, 'en-US')).toBe('0.5 shares');
    expect(sharesText(40, 'en-US')).toBe('40 shares');
  });
});
