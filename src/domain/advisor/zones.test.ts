import { describe, expect, it } from 'vitest';
import { BUY_FROM, GUARD_CAP, WAIT_FROM, zone } from '.';

describe('meter zones', () => {
  it('start where Help says they do: skip 0–33, wait 34–66, buy 67–100', () => {
    expect([WAIT_FROM, BUY_FROM, GUARD_CAP]).toEqual([34, 67, 66]);
    expect(zone(WAIT_FROM - 1)).toBe('skip');
    expect(zone(WAIT_FROM)).toBe('wait');
    expect(zone(BUY_FROM - 1)).toBe('wait');
    expect(zone(BUY_FROM)).toBe('buy');
  });

  it('cap a guarded meter at the top of the wait zone, never in buy', () => {
    expect(zone(GUARD_CAP)).toBe('wait');
    expect(zone(GUARD_CAP + 1)).toBe('buy');
  });
});
