import { describe, expect, it } from 'vitest';
import { daysUntil, formatDay, formatMonth, relativeDays } from './format';

describe('date display', () => {
  it('shows a short day and a month name, whatever the time zone', () => {
    expect(formatDay('2026-10-20', 'en-US')).toBe('Oct 20');
    expect(formatDay('2026-01-01', 'en-US')).toBe('Jan 1');
    expect(formatMonth('2026-10', 'en-US')).toBe('October');
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
