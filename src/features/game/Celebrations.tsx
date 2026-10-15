import { useEffect, useRef, useState } from 'react';
import type { GameGain } from '@/domain/game/engine';
import { toast } from '@/lib/toast';
import { useApp } from '@/store/AppStoreProvider';
import { LevelUpDialog } from './LevelUpDialog';

type Reward = GameGain['rewards'][number];

/** Badges are named one by one up to this many; more than that read as a count. */
const MAX_NAMED_BADGES = 2;

type LevelUp = { level: number; tierChanged: boolean; open: boolean };

/** One quest, streak or challenge in a line; the coins are left out when it pays none. */
function describeReward({ kind, title, xp, coins }: Reward): string {
  const head =
    kind === 'quest'
      ? `Quest complete: ${title}`
      : kind === 'challenge'
        ? `Challenge won: ${title}`
        : title;
  return `${head} · +${xp} XP${coins > 0 ? ` · +${coins} coins` : ''}`;
}

/** What to say about the rewards that are not badges, or `null` when there are none. */
function rewardMessage(rewards: readonly Reward[]): string | null {
  const [first, ...more] = rewards;
  if (!first) return null;
  if (more.length === 0) return describeReward(first);
  const xp = rewards.reduce((sum, r) => sum + r.xp, 0);
  const coins = rewards.reduce((sum, r) => sum + r.coins, 0);
  return `+${xp} XP · +${coins} coins from ${rewards.length} rewards`;
}

/** What to say about the badges: one line each for a few, one line for a handful. */
function badgeMessages(badges: readonly Reward[]): string[] {
  if (badges.length > MAX_NAMED_BADGES) return [`${badges.length} badges unlocked`];
  return badges.map((b) => `Badge unlocked: ${b.title}`);
}

/**
 * The game's rewards, shown once per gain the store publishes: a toast for the quests, streaks and
 * challenges, toasts for the badges, and the level-up dialog. A gain with only logging XP shows
 * nothing, as the HUD bar moves on its own.
 */
export function Celebrations() {
  const gameGain = useApp((s) => s.gameGain);
  const [levelUp, setLevelUp] = useState<LevelUp | null>(null);
  const [levelUpGainId, setLevelUpGainId] = useState<number | null>(null);
  const toastedGainId = useRef<number | null>(null);

  // The dialog is state, so it is opened while rendering, the way React has a component react to a
  // new value: once per gain id, whatever else re-renders this or hands over the same gain again.
  if (gameGain && gameGain.id !== levelUpGainId) {
    setLevelUpGainId(gameGain.id);
    const { levelBefore, levelAfter, tierChanged } = gameGain.gain;
    if (levelAfter > levelBefore) setLevelUp({ level: levelAfter, tierChanged, open: true });
  }

  useEffect(() => {
    // Toasts are a side effect, so they wait for the commit. The ref, not the dependency, makes
    // this once: the store may hand over a new object for the same gain, and StrictMode runs
    // effects twice on mount.
    if (!gameGain || gameGain.id === toastedGainId.current) return;
    toastedGainId.current = gameGain.id;

    const { rewards } = gameGain.gain;
    const badges = rewards.filter((r) => r.kind === 'badge');
    const rest = rewards.filter((r) => r.kind !== 'badge');
    for (const message of [rewardMessage(rest), ...badgeMessages(badges)]) {
      if (message) toast('reward', message);
    }
  }, [gameGain]);

  if (!levelUp) return null;
  return (
    <LevelUpDialog
      {...levelUp}
      onClose={() => setLevelUp((current) => current && { ...current, open: false })}
    />
  );
}
