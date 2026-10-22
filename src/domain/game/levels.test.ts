import { describe, expect, it } from 'vitest';
import {
  BORDERS,
  bordersAt,
  levelInfo,
  levelStart,
  MAX_LEVEL,
  newBorderAt,
  tierOf,
} from './levels';

it('starts at level 1, Bronze Saver, 0 of 100', () =>
  expect(levelInfo(0)).toEqual({
    level: 1,
    tier: 'Bronze Saver',
    xpIntoLevel: 0,
    xpForNext: 100,
    progress: 0,
  }));
it('levels up at 100 and needs 264 more', () =>
  expect(levelInfo(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: 264 }));
it('stays level 1 at 99', () => expect(levelInfo(99).level).toBe(1));
it('starts level 3 at 364 and level 11 at 11,749', () => {
  expect(levelStart(3)).toBe(364);
  expect(levelStart(11)).toBe(11_749);
});
it('names the tiers at 10/11, 21, 31, 41', () => {
  expect(tierOf(10)).toBe('Bronze Saver');
  expect(tierOf(11)).toBe('Silver Budgeter');
  expect(tierOf(21)).toBe('Gold Planner');
  expect(tierOf(31)).toBe('Platinum Investor');
  expect(tierOf(41)).toBe('Diamond Master');
});
it('caps at level 50', () =>
  expect(levelInfo(486_200)).toMatchObject({ level: 50, xpForNext: null, progress: 1 }));
it('treats a negative total as level 1 with no progress', () =>
  expect(levelInfo(-50)).toMatchObject({ level: 1, xpIntoLevel: 0 }));
it('rejects a level outside 1 to 50', () => {
  expect(() => levelStart(0)).toThrow(RangeError);
  expect(() => tierOf(51)).toThrow(RangeError);
});

describe('borders', () => {
  it('lists six borders, each with the level that unlocks it', () => {
    expect(BORDERS.map((b) => [b.id, b.name, b.level])).toEqual([
      ['frame-bronze', 'Bronze', 5],
      ['frame-silver', 'Silver', 11],
      ['frame-gold', 'Gold', 21],
      ['frame-platinum', 'Platinum', 31],
      ['frame-diamond', 'Diamond', 41],
      ['frame-prism', 'Prism', 50],
    ]);
  });

  it('unlocks each at its level, and not the one before', () => {
    expect(bordersAt(1)).toEqual([]);
    expect(bordersAt(4)).toEqual([]);
    expect(bordersAt(5)).toEqual(['frame-bronze']);
    expect(bordersAt(10)).toEqual(['frame-bronze']);
    expect(bordersAt(11)).toEqual(['frame-bronze', 'frame-silver']);
    expect(bordersAt(20)).toEqual(['frame-bronze', 'frame-silver']);
    expect(bordersAt(21)).toEqual(['frame-bronze', 'frame-silver', 'frame-gold']);
    expect(bordersAt(30)).toHaveLength(3);
    expect(bordersAt(31)).toHaveLength(4);
    expect(bordersAt(40)).toHaveLength(4);
    expect(bordersAt(41)).toHaveLength(5);
    expect(bordersAt(49)).toHaveLength(5);
    expect(bordersAt(50)).toEqual([
      'frame-bronze',
      'frame-silver',
      'frame-gold',
      'frame-platinum',
      'frame-diamond',
      'frame-prism',
    ]);
    expect(bordersAt(MAX_LEVEL)).toHaveLength(6);
  });

  it('names the border a level unlocks', () => {
    // Silver to Diamond open with a tier (11/21/31/41); Bronze comes early, at 5, and Prism at the top.
    expect(newBorderAt(5)).toEqual({ id: 'frame-bronze', name: 'Bronze' });
    expect(newBorderAt(11)).toEqual({ id: 'frame-silver', name: 'Silver' });
    expect(newBorderAt(21)).toEqual({ id: 'frame-gold', name: 'Gold' });
    expect(newBorderAt(31)).toEqual({ id: 'frame-platinum', name: 'Platinum' });
    expect(newBorderAt(41)).toEqual({ id: 'frame-diamond', name: 'Diamond' });
    expect(newBorderAt(50)).toEqual({ id: 'frame-prism', name: 'Prism' });
  });

  it('names no new border on any other level', () => {
    expect(newBorderAt(12)).toBeNull();
    expect(newBorderAt(1)).toBeNull();
    expect(newBorderAt(4)).toBeNull();
    expect(newBorderAt(6)).toBeNull();
    expect(newBorderAt(49)).toBeNull();
    const levels = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
    expect(levels.filter((l) => newBorderAt(l) !== null)).toEqual([5, 11, 21, 31, 41, 50]);
  });
});
