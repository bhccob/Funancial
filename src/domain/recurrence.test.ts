import { describe, expect, it } from 'vitest';
import { monthlyEquivalent, nextOccurrence } from './recurrence';

describe('nextOccurrence', () => {
  it('clamps to short months without losing the anchor day', () => {
    expect(nextOccurrence('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
    expect(nextOccurrence('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(nextOccurrence('2026-03-31', 'monthly', 31)).toBe('2026-04-30');
  });

  it('handles quarters, years and weeks', () => {
    expect(nextOccurrence('2026-11-30', 'quarterly', 30)).toBe('2027-02-28');
    expect(nextOccurrence('2028-02-29', 'yearly', 29)).toBe('2029-02-28');
    expect(nextOccurrence('2026-12-29', 'weekly', 29)).toBe('2027-01-05');
    expect(nextOccurrence('2026-12-15', 'monthly', 15)).toBe('2027-01-15');
  });
});

describe('monthlyEquivalent', () => {
  it('converts each cycle to a per-month amount', () => {
    expect(monthlyEquivalent(12_00, 'weekly')).toBe(52_00);
    expect(monthlyEquivalent(15_99, 'monthly')).toBe(15_99);
    expect(monthlyEquivalent(30_00, 'quarterly')).toBe(10_00);
    expect(monthlyEquivalent(120_00, 'yearly')).toBe(10_00);
    expect(monthlyEquivalent(9_99, 'yearly')).toBe(83);
  });
});
