import { describe, expect, it } from 'vitest';
import { confidenceOf, zone } from './meter';

describe('zone', () => {
  it('maps the meter to skip 0–33, wait 34–66 and buy 67–100', () => {
    expect([0, 33].map(zone)).toEqual(['skip', 'skip']);
    expect([34, 50, 66].map(zone)).toEqual(['wait', 'wait', 'wait']);
    expect([67, 100].map(zone)).toEqual(['buy', 'buy']);
  });

  it('rounds a meter between two whole numbers to the nearer zone', () => {
    expect(zone(33.4)).toBe('skip');
    expect(zone(33.5)).toBe('wait');
    expect(zone(66.4)).toBe('wait');
    expect(zone(66.5)).toBe('buy');
  });
});

describe('zone with no number', () => {
  it('never lands a NaN in Buy', () => {
    expect(zone(Number.NaN)).toBe('skip');
  });
});

describe('confidenceOf', () => {
  it('is high 30 points from the middle, medium 15, and low nearer', () => {
    expect([0, 20, 80, 100].map(confidenceOf)).toEqual(['high', 'high', 'high', 'high']);
    expect([21, 35, 65, 79].map(confidenceOf)).toEqual(['medium', 'medium', 'medium', 'medium']);
    expect([36, 50, 64].map(confidenceOf)).toEqual(['low', 'low', 'low']);
  });
});
