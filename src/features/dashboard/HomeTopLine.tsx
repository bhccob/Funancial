import { Coins, Flame } from 'lucide-react';
import { Link } from 'react-router';
import { Ring } from '@/components/charts/Ring';
import type { LocalDate } from '@/domain/dates';
import type { GameView } from '@/domain/game/engine';
import { formatDay } from '@/lib/format';
import { HideAmountsButton } from './HideAmountsButton';

export interface HomeTopLineProps {
  name: string | undefined;
  today: LocalDate;
  game: Pick<GameView, 'level' | 'totals' | 'streaks'>;
}

/** A whole number in the reader's locale: "23,300" (XP and coins). */
const num = (n: number) => n.toLocaleString();

/**
 * "Hi, Sam · Oct 15" on the left; on the right one link to the quests holding the logging streak,
 * the coins and a ring of the progress through the level, then the eye that hides every amount.
 */
export function HomeTopLine({ name, today, game }: HomeTopLineProps) {
  const { level, totals, streaks } = game;
  const streak = streaks.find((s) => s.kind === 'logging')?.count ?? 0;
  const coins = Math.max(0, totals.coins);
  const xp =
    level.xpForNext === null
      ? 'Max level'
      : `${num(level.xpIntoLevel)} of ${num(level.xpForNext)} XP`;

  return (
    <div className="mb-[26px] flex items-center gap-3">
      {/* One line that ends in an ellipsis, so the date is cut before the name; the date does not
          show below 440px, where it never fits beside the level ring and the eye without squeezing
          the name. */}
      <p className="min-w-0 flex-1 truncate text-[15px] font-extrabold">
        <span>{name ? `Hi, ${name}` : 'Hi there'}</span>
        <span className="text-muted hidden pl-1 font-bold min-[440px]:inline">
          · {formatDay(today)}
        </span>
      </p>
      <Link
        to="/quests"
        aria-label={`Level ${level.level}, ${xp}, ${streak}-day streak, ${num(coins)} ${coins === 1 ? 'coin' : 'coins'}. Open quests`}
        className="flex min-h-11 shrink-0 items-center gap-3.5 text-sm font-extrabold tabular-nums"
      >
        <span className="inline-flex items-center gap-1">
          <Flame aria-hidden="true" className="text-warning size-[17px]" />
          {streak}
        </span>
        <span className="inline-flex items-center gap-1">
          <Coins aria-hidden="true" className="size-[17px]" />
          {num(coins)}
        </span>
        {/* The link's label already says the level and its progress. */}
        <span aria-hidden="true" className="flex">
          <Ring
            value={level.progress * 100}
            size={40}
            thickness={3.5}
            color="var(--color-xp)"
            label={`Level ${level.level}`}
          >
            <b className="text-xp-text text-xs font-extrabold">{level.level}</b>
          </Ring>
        </span>
      </Link>
      <HideAmountsButton />
    </div>
  );
}
