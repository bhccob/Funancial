import { Coins, Flame } from 'lucide-react';
import { Link } from 'react-router';
import type { GameView } from '@/domain/game/engine';
import { useGameView } from '@/store/useGame';
import { Avatar } from './Avatar';

/** What the HUD shows from the game view. */
type HudView = Pick<GameView, 'level' | 'totals' | 'streaks' | 'cosmetics'>;

/**
 * The game layer's one strip: level, XP, the logging streak and coins, as a single link to the
 * quests. Small and quiet, so it never competes with the money figures under it. A screen that has
 * already worked out the game view hands it in; otherwise the HUD works it out itself.
 */
export function GameHud({ view }: { view?: HudView }) {
  return view ? <HudStrip view={view} /> : <OwnViewHud />;
}

function OwnViewHud() {
  return <HudStrip view={useGameView()} />;
}

function HudStrip({ view: { level, totals, streaks, cosmetics } }: { view: HudView }) {
  const logging = streaks.find((s) => s.kind === 'logging');
  const days = logging?.count ?? 0;
  const coins = Math.max(0, totals.coins);
  const coinsText = `${coins} ${coins === 1 ? 'coin' : 'coins'}`;
  const span = level.xpForNext;
  const streakText = days > 0 ? `${days}-day streak` : 'Start a streak today';
  const xpText = span === null ? 'Max level' : `${num(level.xpIntoLevel)} / ${num(span)} XP`;
  const xpSpoken = span === null ? 'Max level' : `${num(level.xpIntoLevel)} of ${num(span)} XP`;

  return (
    <Link
      to="/quests"
      aria-label={`Level ${level.level}, ${level.tier}, ${xpSpoken}, ${streakText}, ${coinsText}. Open quests`}
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
        {coinsText}
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
