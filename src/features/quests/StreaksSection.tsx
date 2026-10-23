import { CalendarCheck, Coins, Flame, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { StreakView } from '@/domain/game/streaks';
import type { StreakKind } from '@/domain/game/types';
import { IconRow, ROW_SUB, ROW_TITLE } from '@/features/shared/IconRow';
import { PlainSection, ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';

const ICONS: Record<StreakKind, LucideIcon> = {
  logging: Flame,
  'no-overspend': ShieldCheck,
  checkin: CalendarCheck,
  dividend: Coins,
};

/** What a streak that is not running says instead of a count, or `null` when it has one. */
function hintOf(streak: StreakView): string | null {
  if (!streak.active) {
    return streak.kind === 'dividend'
      ? 'Add a holding to start this streak.'
      : 'Set a limit to start this streak.';
  }
  if (streak.count > 0) return null;
  // A limit that is over stays over until its week or month resets, so today cannot start it.
  if (streak.kind === 'no-overspend' && !streak.doneThisPeriod) {
    return 'Over a limit right now. The streak starts again when it resets.';
  }
  return 'Start a new streak today.';
}

function StreakRow({ streak }: { streak: StreakView }) {
  const hint = hintOf(streak);

  return (
    <li>
      <IconRow
        icon={ICONS[streak.kind]}
        end={
          hint === null && (
            <p className="shrink-0 text-[15px] font-extrabold tabular-nums">
              {`${streak.count} ${streak.unit}${streak.count === 1 ? '' : 's'}`}
            </p>
          )
        }
      >
        <p className={ROW_TITLE}>{streak.title}</p>
        {hint !== null && <p className={ROW_SUB}>{hint}</p>}
        {streak.tokens !== null && (
          <p className={cn(ROW_SUB, 'flex items-center gap-3')}>
            <span>{`Freezes: ${streak.tokens}`}</span>
            <Link
              to="/shop?tab=freezes"
              className="text-accent-text -my-3 inline-flex min-h-11 items-center font-bold underline underline-offset-4"
            >
              Get freezes
            </Link>
          </p>
        )}
      </IconRow>
    </li>
  );
}

/** Daily logging, no overspending, the weekly check-in and dividends: how long each has been kept. */
export function StreaksSection({ streaks }: { streaks: readonly StreakView[] }) {
  return (
    <PlainSection title="Streaks">
      <ul className={cn('px-1', ROWS)}>
        {streaks.map((streak) => (
          <StreakRow key={streak.kind} streak={streak} />
        ))}
      </ul>
    </PlainSection>
  );
}
