import type { Reward } from '@/domain/game/types';

/** A reward as one phrase: "+50 XP, +10 coins". */
export function rewardText({ xp, coins }: Reward): string {
  const parts = [`+${xp.toLocaleString()} XP`];
  if (coins > 0) parts.push(`+${coins.toLocaleString()} coins`);
  return parts.join(', ');
}
