import { CalendarCheck, Coins, Flame, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Section } from '@/components/ui/Section';
import type { StreakView } from '@/domain/game/streaks';
import type { StreakKind } from '@/domain/game/types';

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
  const Icon = ICONS[streak.kind];
  const hint = hintOf(streak);

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Icon aria-hidden="true" className="text-muted size-4 shrink-0" />
          {streak.title}
        </p>
        {hint === null && (
          <p className="shrink-0 text-sm font-extrabold tabular-nums">
            {`${streak.count} ${streak.unit}${streak.count === 1 ? '' : 's'}`}
          </p>
        )}
      </div>
      {hint !== null && <p className="text-muted mt-1 text-[12.5px]">{hint}</p>}
      {streak.tokens !== null && (
        <p className="text-muted mt-1 flex items-center gap-3 text-[12.5px]">
          <span>{`Freezes: ${streak.tokens}`}</span>
          <Link
            to="/shop"
            className="text-accent-text font-semibold underline-offset-4 hover:underline"
          >
            Get freezes
          </Link>
        </p>
      )}
    </li>
  );
}

/** Daily logging, no overspending, the weekly check-in and dividends: how long each has been kept. */
export function StreaksSection({ streaks }: { streaks: readonly StreakView[] }) {
  return (
    <Section title="Streaks">
      <ul className="divide-border -my-3 divide-y">
        {streaks.map((streak) => (
          <StreakRow key={streak.kind} streak={streak} />
        ))}
      </ul>
    </Section>
  );
}
