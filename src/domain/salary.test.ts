import { describe, expect, it } from 'vitest';
import { ex } from './examples';
import * as salaryModule from './salary';
import { expectedSalary, payDate } from './salary';

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

describe('expectedSalary', () => {
  it('is the monthly amount from the pay month on', () => {
    expect(expectedSalary(profile, '2026-10')).toBe(profile.salary!.monthlyAmount);
    expect(expectedSalary(profile, '2026-11')).toBe(3_000_00);
  });

  it('is 0 for a month whose pay day came on or before `since`', () => {
    const since = (day: string) => ({
      ...profile,
      salary: { monthlyAmount: 3_000_00, payDay: 25, since: day },
    });
    expect(expectedSalary(since('2026-10-14'), '2026-09')).toBe(0);
    expect(expectedSalary(since('2026-10-14'), '2026-10')).toBe(3_000_00);
    expect(expectedSalary(since('2026-10-25'), '2026-10')).toBe(0);
    expect(expectedSalary(since('2026-10-25'), '2026-11')).toBe(3_000_00);
  });

  it('is 0 without a salary or with a zero one', () => {
    expect(expectedSalary({ ...profile, salary: null }, '2026-10')).toBe(0);
    expect(
      expectedSalary({ ...profile, salary: { monthlyAmount: 0, payDay: 25 } }, '2026-10'),
    ).toBe(0);
  });

  it('has no freezes any more: the module holds the pay date and the expected salary only', () => {
    expect(Object.keys(salaryModule).sort()).toEqual(['expectedSalary', 'payDate']);
  });
});
