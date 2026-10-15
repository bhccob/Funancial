import { Coins, Flame } from 'lucide-react';
import { Link } from 'react-router';
import { useGameView } from '@/store/useGame';
import { Avatar } from './Avatar';

/**
 * The game layer's one strip: level, XP, the logging streak and coins, as a single link to the
 * quests. Small and quiet, so it never competes with the money figures under it.
 */
export function GameHud() {
  const { level, totals, streaks, cosmetics } = useGameView();
  const logging = streaks.find((s) => s.kind === 'logging');
  const days = logging?.count ?? 0;
  const coins = Math.max(0, totals.coins);
  const needed = level.xpForNext;
  const streakText = days > 0 ? `${days}-day streak` : 'Start a streak today';
  const xpText = needed === null ? 'Max level' : `${num(level.xpIntoLevel)} / ${num(needed)} XP`;
  const xpSpoken = needed === null ? 'Max level' : `${num(level.xpIntoLevel)} of ${num(needed)} XP`;

  return (
    <Link
      to="/quests"
      aria-label={`Level ${level.level}, ${level.tier}, ${xpSpoken}, ${streakText}, ${coins} coins. Open quests`}
      className="border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-3"
    >
      <Avatar item={cosmetics.avatar} frame={cosmetics.frame} size={32} />

      <span className="flex items-center gap-2">
        <span className="bg-xp-text text-xp-contrast rounded-[8px] px-2 py-0.5 text-xs font-extrabold tabular-nums">
          LV {level.level}
        </span>
        <span className="text-[13px] font-bold">{level.tier}</span>
      </span>

      {/* Beside the tier on a narrow screen, so the strip is two rows; last on a wide one. */}
      <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold tabular-nums lg:order-last lg:ml-0">
        <Coins aria-hidden="true" className="size-4" />
        {coins} coins
      </span>

      <span className="flex min-w-40 flex-1 items-center gap-2">
        <span
          aria-hidden="true"
          className="bg-track h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
        >
          <span
            className="bg-xp block h-full rounded-full motion-safe:transition-[width]"
            style={{ width: `${level.progress * 100}%` }}
          />
        </span>
        <span className="text-muted shrink-0 text-xs font-semibold tabular-nums">{xpText}</span>
      </span>

      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <Flame aria-hidden="true" className="text-warning size-4" />
        {streakText}
      </span>
    </Link>
  );
}

/** A whole number in the reader's locale: "23,300". */
function num(n: number): string {
  return n.toLocaleString();
}
