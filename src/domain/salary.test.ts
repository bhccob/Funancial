import { describe, expect, it } from 'vitest';
import { ex } from './examples';
import { expectedSalary, freezeAllocation, freezeLoss, payDate } from './salary';

const profile = ex.profile({
  openingDate: '2026-08-01',
  salary: { monthlyAmount: 3_000_00, payDay: 25 },
});

describe('payDate', () => {
  it('clamps the pay day to the month', () => {
    expect(payDate('2026-02', 30)).toBe('2026-02-28');
    expect(payDate('2026-09', 31)).toBe('2026-09-30');
    expect(payDate('2026-10', 25)).toBe('2026-10-25');
  });
});

describe('freezeLoss', () => {
  it('values each frozen day by its own month (SAL-1)', () => {
    expect(freezeLoss('2026-09-28', '2026-10-03', 3_000_00)).toBe(590_32);
  });

  it('a single day in a 31-day month is a 31st of the pay', () => {
    expect(freezeLoss('2026-10-15', '2026-10-15', 3_100_00)).toBe(100_00);
  });
});

describe('freezeAllocation', () => {
  it('computed mode assigns each month its own share', () => {
    const f = ex.freeze({ start: '2026-09-28', end: '2026-10-03', lostAmount: 590_32 });
    expect(freezeAllocation(f, 3_000_00)).toEqual({ '2026-09': 300_00, '2026-10': 290_32 });
  });

  it('manual mode splits the entered amount by days, remainder to the last month', () => {
    const f = ex.freeze({
      start: '2026-09-28',
      end: '2026-10-03',
      lostAmount: 500_00,
      mode: 'manual',
    });
    expect(freezeAllocation(f, 3_000_00)).toEqual({ '2026-09': 250_00, '2026-10': 250_00 });
    const odd = ex.freeze({
      start: '2026-09-30',
      end: '2026-10-02',
      lostAmount: 100_00,
      mode: 'manual',
    });
    expect(freezeAllocation(odd, 3_000_00)).toEqual({ '2026-09': 33_33, '2026-10': 66_67 });
  });
});

describe('expectedSalary', () => {
  it('reduces each month by its frozen share (SAL-1)', () => {
    const freezes = [ex.freeze({ start: '2026-09-28', end: '2026-10-03', lostAmount: 590_32 })];
    expect(expectedSalary(profile, freezes, '2026-09')).toBe(2_700_00);
    expect(expectedSalary(profile, freezes, '2026-10')).toBe(2_709_68);
    expect(expectedSalary(profile, freezes, '2026-11')).toBe(3_000_00);
  });

  it('never goes below zero and is zero without a salary', () => {
    const big = [
      ex.freeze({ start: '2026-10-01', end: '2026-10-02', lostAmount: 9_000_00, mode: 'manual' }),
    ];
    expect(expectedSalary(profile, big, '2026-10')).toBe(0);
    expect(expectedSalary({ ...profile, salary: null }, [], '2026-10')).toBe(0);
  });
});
