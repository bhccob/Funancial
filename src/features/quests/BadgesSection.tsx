import { Lock, Receipt, Scissors, Snowflake, Target, type LucideIcon } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { localDay } from '@/domain/game/activity';
import type { BadgeView } from '@/domain/game/badges';
import type { BadgeId } from '@/domain/game/types';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { frameRing } from '@/features/game/frameRing';

const ICONS: Record<BadgeId, LucideIcon> = {
  'first-expense': Receipt,
  'subscription-slayer': Scissors,
  'limit-keeper': Target,
  'freeze-master': Snowflake,
};

function BadgeTile({ badge, frame }: { badge: BadgeView; frame: string }) {
  const Icon = ICONS[badge.id];
  const earnedAt = badge.earnedAt;

  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'bg-surface-2 grid size-11 shrink-0 place-items-center rounded-full',
          earnedAt === null ? 'text-muted' : 'text-xp-text',
          earnedAt !== null && frameRing(frame),
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{badge.name}</p>
        {earnedAt !== null ? (
          <p className="text-muted text-[12.5px]">{`Earned ${formatDate(localDay(earnedAt))}`}</p>
        ) : (
          <p className="text-muted flex items-start gap-1.5 text-[12.5px]">
            <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {badge.description}
          </p>
        )}
      </div>
    </li>
  );
}

/** Every badge: the ones earned wear the person's frame, the ones still to earn say how. */
export function BadgesSection({ badges, frame }: { badges: readonly BadgeView[]; frame: string }) {
  return (
    <Section title="Badges">
      <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {badges.map((badge) => (
          <BadgeTile key={badge.id} badge={badge} frame={frame} />
        ))}
      </ul>
    </Section>
  );
}
