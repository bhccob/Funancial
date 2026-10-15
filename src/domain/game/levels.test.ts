import { expect, it } from 'vitest';
import { levelInfo, levelStart, tierOf } from './levels';

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
