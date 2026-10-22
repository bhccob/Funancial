import type { Cosmetics, LedgerEntry } from '../entities';
import type { DataSnapshot, TableRecord } from '../snapshot';
import { applyRecords } from '../sync';
import { badgeAwards, badgeViews, type BadgeView } from './badges';
import { challengeAwards, challengeViews, type ChallengeView } from './challenges';
import { ledgerTotals, loggingAwards, reconcileLedger } from './ledger';
import { levelInfo, type LevelInfo } from './levels';
import { currentQuests, questAwards, type QuestView } from './quests';
import { equippedCosmetics, ownedItems } from './shop';
import { computeStreaks, freezeUsesDue, streakAwards, type StreakView } from './streaks';
import type { Award, AwardKind, GameContext, Reward } from './types';

/** How many ledger entries the view keeps for the history list. */
const HISTORY_LENGTH = 30;

export type GameGain = {
  xp: number;
  coins: number;
  levelBefore: number;
  levelAfter: number;
  tierChanged: boolean;
  /** The awards beyond plain logging that were paid in this run, oldest first. */
  rewards: Array<{ kind: Exclude<AwardKind, 'log'>; title: string; xp: number; coins: number }>;
};

/**
 * What the store writes after every write of its own: the streak freezes now due and the ledger
 * entries still owed, together with what the person gained, or `null` when no award was paid
 * (taking back logging XP is not a gain). Running it on the result writes nothing more.
 */
export function gameUpdates(
  data: DataSnapshot,
  ctx: GameContext,
): { records: TableRecord[]; gain: GameGain | null } {
  const freezes: TableRecord[] = freezeUsesDue(data, ctx).map((record) => ({
    table: 'streakFreeze',
    record,
  }));
  // The freezes count toward the streaks and awards below, so they are applied first.
  const settled = applyRecords(data, freezes);

  const oneTime = [
    ...questAwards(settled, ctx),
    ...streakAwards(computeStreaks(settled, ctx)),
    ...badgeAwards(settled, ctx),
    ...challengeAwards(settled, ctx),
  ];
  const entries = reconcileLedger(
    settled.tables.ledger,
    { reversible: loggingAwards(settled), oneTime },
    ctx.now,
  );

  const records: TableRecord[] = [
    ...freezes,
    ...entries.map((record): TableRecord => ({ table: 'ledger', record })),
  ];
  return { records, gain: gainOf(settled.tables.ledger, entries, oneTime) };
}

function gainOf(
  ledger: readonly LedgerEntry[],
  entries: readonly LedgerEntry[],
  oneTime: readonly Award[],
): GameGain | null {
  const awarded = entries.filter((e) => e.kind === 'award');
  if (awarded.length === 0) return null;

  const before = levelInfo(ledgerTotals(ledger).xp);
  const after = levelInfo(ledgerTotals([...ledger, ...entries]).xp);

  const awardByKey = new Map(oneTime.map((a) => [a.key, a]));
  const rewards: GameGain['rewards'] = [];
  for (const { key, xp, coins } of awarded) {
    const award = awardByKey.get(key);
    if (award && award.kind !== 'log') {
      rewards.push({ kind: award.kind, title: award.title, xp, coins });
    }
  }

  const { xp, coins } = ledgerTotals(awarded);
  return {
    xp,
    coins,
    levelBefore: before.level,
    levelAfter: after.level,
    tierChanged: before.tier !== after.tier,
    rewards,
  };
}

export type GameView = {
  totals: Reward;
  level: LevelInfo;
  streaks: StreakView[];
  quests: QuestView[];
  badges: BadgeView[];
  challenges: ChallengeView[];
  owned: Set<string>;
  cosmetics: Cosmetics;
  /** The latest ledger entries, newest first. */
  history: LedgerEntry[];
};

/** Everything the game screens show, read from `data` as it is. */
export function computeGameView(data: DataSnapshot, ctx: GameContext): GameView {
  const { ledger } = data.tables;
  const totals = ledgerTotals(ledger);
  const level = levelInfo(totals.xp);
  const owned = ownedItems(ledger, level.level);
  // The sort is stable, so entries written in the same moment keep the ledger's order, reversed below.
  const history = [...ledger]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .slice(-HISTORY_LENGTH)
    .reverse();
  return {
    totals,
    level,
    streaks: computeStreaks(data, ctx),
    quests: currentQuests(data, ctx),
    badges: badgeViews(data),
    challenges: challengeViews(data, ctx),
    owned,
    cosmetics: equippedCosmetics(data.tables.settings[0], owned),
    history,
  };
}
