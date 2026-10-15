import { describe, expect, it } from 'vitest';
import {
  dayOfMonth,
  dayRange,
  daysInMonth,
  endOfMonth,
  inRange,
  monthKey,
  monthRange,
  monthsBetween,
  periodRange,
  weekRange,
  yearRange,
} from './periods';

describe('ranges', () => {
  it('week ranges respect the week start', () => {
    expect(weekRange('2026-10-14', 1)).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(weekRange('2026-10-14', 0)).toEqual({ start: '2026-10-11', end: '2026-10-17' });
    expect(weekRange('2026-10-12', 1)).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(weekRange('2026-10-18', 1)).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(weekRange('2027-01-01', 1)).toEqual({ start: '2026-12-28', end: '2027-01-03' });
  });

  it('month and year ranges cover leap years', () => {
    expect(monthRange('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange('2028-02-10').end).toBe('2028-02-29');
    expect(yearRange('2026-06-01')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(dayRange('2026-06-01')).toEqual({ start: '2026-06-01', end: '2026-06-01' });
  });

  it('periodRange picks week or month', () => {
    expect(periodRange('weekly', '2026-10-14', 1)).toEqual(weekRange('2026-10-14', 1));
    expect(periodRange('monthly', '2026-10-14', 1)).toEqual(monthRange('2026-10-14'));
  });

  it('inRange is inclusive', () => {
    const r = { start: '2026-10-01', end: '2026-10-31' };
    expect(inRange('2026-10-01', r)).toBe(true);
    expect(inRange('2026-10-31', r)).toBe(true);
    expect(inRange('2026-11-01', r)).toBe(false);
  });
});

describe('month helpers', () => {
  it('derive keys, ends and lengths', () => {
    expect(monthKey('2026-10-14')).toBe('2026-10');
    expect(endOfMonth('2026-09-03')).toBe('2026-09-30');
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(dayOfMonth('2026-10-07')).toBe(7);
    expect(monthsBetween('2026-11', '2027-02')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(monthsBetween('2026-11', '2026-11')).toEqual(['2026-11']);
    expect(monthsBetween('2026-12', '2026-11')).toEqual([]);
  });
});
