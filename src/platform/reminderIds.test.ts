import { describe, expect, it } from 'vitest';
import { reminderIds } from './reminderIds';

const MAX_ID = 0x7fffffff;

/**
 * Keys found offline by inverting FNV-1a: each one's 31-bit hash is exactly the value named, so
 * the guards at both ends of the id range are exercised by real keys.
 */
const HASHES_TO_0 = 'r:udjf2R';
const HASHES_TO_1 = 'r:821o5m';
const HASHES_TO_MAX = 'r:ehnd4_';
/** Two different keys with the same 31-bit hash (2016287137). */
const COLLIDING = ['daily:2026-07-33558', 'daily:2026-02-75805'];

describe('reminderIds', () => {
  it('gives stable, unique, positive ids', () => {
    const keys = [
      ...Array.from({ length: 31 }, (_, i) => `daily:2026-10-${String(i + 1).padStart(2, '0')}`),
      'renewal:netflix:2026-10-21',
      'card-due:visa:2026-10-21',
      'weekly-review:2026-10-18',
      'monthly-review:2026-10-31',
      'backup:2026-10-21',
    ];

    const ids = reminderIds(keys);

    expect(ids).toHaveLength(keys.length);
    expect(reminderIds(keys)).toEqual(ids);
    expect(new Set(ids).size).toBe(keys.length);
    for (const id of ids) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(1);
      expect(id).toBeLessThanOrEqual(MAX_ID);
    }
  });

  it('is FNV-1a over the key, kept to 31 bits', () => {
    // The published FNV-1a test vector: fnv1a32('foobar') = 0xbf9cf968, less its top bit.
    expect(reminderIds(['foobar'])).toEqual([0x3f9cf968]);
  });

  it('gives a key the same id whatever else is in the list', () => {
    const [alone] = reminderIds(['daily:2026-10-15']);
    expect(reminderIds(['backup:2026-10-21', 'daily:2026-10-15'])[1]).toBe(alone);
  });

  it('moves on to the next free id when two keys collide', () => {
    const [first, second] = COLLIDING as [string, string];
    const [solo] = reminderIds([first]);

    expect(reminderIds([second])[0]).toBe(solo);
    expect(reminderIds([first, second])).toEqual([solo, (solo as number) + 1]);
    expect(reminderIds([second, first])).toEqual([solo, (solo as number) + 1]);
  });

  it('never hands out 0, or 1 (the test reminder)', () => {
    expect(reminderIds([HASHES_TO_0])).toEqual([2]);
    expect(reminderIds([HASHES_TO_1])).toEqual([2]);
    expect(reminderIds([HASHES_TO_0, HASHES_TO_1])).toEqual([2, 3]);
  });

  it('wraps past the largest id instead of overflowing 31 bits', () => {
    expect(reminderIds([HASHES_TO_MAX])).toEqual([MAX_ID]);
    expect(reminderIds([HASHES_TO_MAX, HASHES_TO_MAX])).toEqual([MAX_ID, 2]);
  });

  it('gives nothing for no keys', () => {
    expect(reminderIds([])).toEqual([]);
  });
});
