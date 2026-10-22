import { Coins, Flame } from 'lucide-react';
import { Link } from 'react-router';
import { PROFILE } from '@/app/menu';
import { Ring } from '@/components/charts/Ring';
import type { LocalDate } from '@/domain/dates';
import type { GameView } from '@/domain/game/engine';
import { Avatar } from '@/features/game/Avatar';
import { formatDay } from '@/lib/format';

export interface HomeTopLineProps {
  name: string | undefined;
  today: LocalDate;
  game: Pick<GameView, 'level' | 'totals' | 'streaks' | 'cosmetics'>;
}

/** A whole number in the reader's locale: "23,300" (coins). */
const num = (n: number) => n.toLocaleString();

/**
 * The avatar and "Hi, Sam · Oct 15" on the left; on the right one link to the quests holding the
 * logging streak and the coins. The avatar opens Profile: a ring of the progress through the level
 * around it, and the level on a chip at its corner.
 */
export function HomeTopLine({ name, today, game }: HomeTopLineProps) {
  const { level, totals, streaks, cosmetics } = game;
  const streak = streaks.find((s) => s.kind === 'logging')?.count ?? 0;
  const coins = Math.max(0, totals.coins);

  return (
    <div className="mb-[26px] flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          to={PROFILE.path}
          aria-label={`${PROFILE.label}, level ${level.level}`}
          className="press relative flex size-11 shrink-0 items-center justify-center"
        >
          {/* The link's label already says the level. */}
          <span aria-hidden="true" className="flex">
            <Ring
              value={level.progress * 100}
              size={44}
              thickness={3}
              color="var(--color-xp)"
              label={`Level ${level.level}`}
            >
              <Avatar item={cosmetics.avatar} frame={cosmetics.frame} size={36} />
            </Ring>
          </span>
          <b
            aria-hidden="true"
            className="bg-xp-text text-xp-contrast ring-bg absolute -right-1 -bottom-[3px] rounded-full px-[5px] py-[1.5px] text-[9.5px] leading-none font-extrabold tabular-nums ring-2"
          >
            {level.level}
          </b>
        </Link>
        {/* One line that ends in an ellipsis, so the date is cut before the name; the date does not
            show below 400px, where it never fits beside the avatar and the streak without
            squeezing the name. */}
        <p className="min-w-0 truncate text-[15px] font-extrabold">
          <span>{name ? `Hi, ${name}` : 'Hi there'}</span>
          <span className="text-muted hidden pl-1 font-bold min-[400px]:inline">
            · {formatDay(today)}
          </span>
        </p>
      </div>
      <Link
        to="/quests"
        aria-label={`${streak}-day streak, ${num(coins)} ${coins === 1 ? 'coin' : 'coins'}. Open quests`}
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
      </Link>
    </div>
  );
}
