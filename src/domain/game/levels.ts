export const MAX_LEVEL = 50;

export const TIERS = [
  { name: 'Bronze Saver', from: 1 },
  { name: 'Silver Budgeter', from: 11 },
  { name: 'Gold Planner', from: 21 },
  { name: 'Platinum Investor', from: 31 },
  { name: 'Diamond Master', from: 41 },
] as const;

export type LevelInfo = {
  level: number;
  tier: string;
  /** XP earned past the start of this level. */
  xpIntoLevel: number;
  /**
   * The level's full span: the XP from this level's start to the next level's (not what is still
   * needed, which is `xpForNext - xpIntoLevel`); `null` at `MAX_LEVEL`.
   */
  xpForNext: number | null;
  /** 0 to 1 through this level; `1` at `MAX_LEVEL`. */
  progress: number;
};

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    throw new RangeError(`Not a level from 1 to ${MAX_LEVEL}: ${level}`);
  }
}

/** The XP from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  return Math.round(100 * level ** 1.4);
}

/** The total XP at which `level` begins. Level 1 begins at 0. */
export function levelStart(level: number): number {
  assertLevel(level);
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForLevel(l);
  return total;
}

export function tierOf(level: number): string {
  assertLevel(level);
  let name: string = TIERS[0].name;
  for (const tier of TIERS) if (level >= tier.from) name = tier.name;
  return name;
}

/** Where `totalXp` sits on the level curve. Negative totals count as level 1 with no progress. */
export function levelInfo(totalXp: number): LevelInfo {
  let level = 1;
  let start = 0;
  while (level < MAX_LEVEL && totalXp >= start + xpForLevel(level)) {
    start += xpForLevel(level);
    level += 1;
  }
  const xpIntoLevel = Math.max(0, totalXp - start);
  if (level === MAX_LEVEL) {
    return { level, tier: tierOf(level), xpIntoLevel, xpForNext: null, progress: 1 };
  }
  const xpForNext = xpForLevel(level);
  return { level, tier: tierOf(level), xpIntoLevel, xpForNext, progress: xpIntoLevel / xpForNext };
}

export type Border = { id: string; name: string; level: number };

/**
 * The profile borders, each worn from the level that unlocks it. The ids are `frame-*` cosmetics
 * (`frame-none` is always there and is not listed). Silver to Diamond open with a tier.
 */
export const BORDERS: readonly Border[] = [
  { id: 'frame-bronze', name: 'Bronze', level: 5 },
  { id: 'frame-silver', name: 'Silver', level: 11 },
  { id: 'frame-gold', name: 'Gold', level: 21 },
  { id: 'frame-platinum', name: 'Platinum', level: 31 },
  { id: 'frame-diamond', name: 'Diamond', level: 41 },
  { id: 'frame-prism', name: 'Prism', level: MAX_LEVEL },
];

/** The ids of the borders unlocked by `level`, lowest first. */
export function bordersAt(level: number): string[] {
  return BORDERS.filter((b) => b.level <= level).map((b) => b.id);
}

/**
 * The borders that going from level `before` to `after` unlocks, lowest first: every one passed on
 * the way, as one gain can jump several levels.
 */
export function newBorders(before: number, after: number): Border[] {
  return BORDERS.filter((b) => b.level > before && b.level <= after);
}
