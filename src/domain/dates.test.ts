import { describe, expect, it } from 'vitest';
import { addDays, LocalDateSchema, toLocalDate } from './dates';

describe('LocalDateSchema', () => {
  it('accepts real calendar dates, including leap days', () => {
    expect(LocalDateSchema.safeParse('2026-10-14').success).toBe(true);
    expect(LocalDateSchema.safeParse('2028-02-29').success).toBe(true);
  });
  it('rejects impossible dates and loose formats', () => {
    expect(LocalDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(LocalDateSchema.safeParse('2027-02-29').success).toBe(false);
    expect(LocalDateSchema.safeParse('2026-13-01').success).toBe(false);
    expect(LocalDateSchema.safeParse('2026-2-3').success).toBe(false);
    expect(LocalDateSchema.safeParse('2026-10-14T00:00:00Z').success).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('is not thrown off by daylight-saving changes', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('toLocalDate', () => {
  it('uses the local calendar day, not UTC', () => {
    expect(toLocalDate(new Date(2026, 9, 14, 23, 59))).toBe('2026-10-14');
    expect(toLocalDate(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01');
  });
});
