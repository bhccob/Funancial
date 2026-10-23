import {
  Briefcase,
  ChartPie,
  Coins,
  HandCoins,
  Lock,
  PiggyBank,
  Receipt,
  Scissors,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { IconChip } from '@/components/ui/IconChip';
import { localDay } from '@/domain/game/activity';
import type { BadgeView } from '@/domain/game/badges';
import type { BadgeId } from '@/domain/game/types';
import { ROW_SUB, ROW_TITLE } from '@/features/shared/IconRow';
import { PlainSection, ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { frameRing } from '@/features/game/frameRing';

/** Each badge's icon: on this page, and on Profile's row of them. */
export const BADGE_ICONS: Record<BadgeId, LucideIcon> = {
  'first-expense': Receipt,
  'subscription-slayer': Scissors,
  'limit-keeper': Target,
  'first-etf': ChartPie,
  'portfolio-pro': Briefcase,
  'first-dividend': Coins,
  'dividend-collector': HandCoins,
  'passive-income-pro': PiggyBank,
};

/**
 * A badge as a plain row. An earned badge's chip is in the accent, and wears the person's frame: the
 * ring goes on a plain round wrapper, not on the chip, since the ring and the glass are both
 * box-shadows and the later one would undo the other. A locked one is muted and says how to earn it.
 */
function BadgeRow({ badge, frame }: { badge: BadgeView; frame: string }) {
  const earnedAt = badge.earnedAt;
  const earned = earnedAt !== null;

  return (
    // IconRow's row, with the chip inside its frame.
    <li className="flex min-h-[54px] items-center gap-3 py-2">
      <span
        aria-hidden="true"
        className={cn('flex shrink-0 rounded-full', earned && frameRing(frame))}
      >
        <IconChip icon={BADGE_ICONS[badge.id]} className={earned ? 'text-accent' : 'text-muted'} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={ROW_TITLE}>{badge.name}</p>
        {earned ? (
          <p className={ROW_SUB}>{`Earned ${formatDate(localDay(earnedAt))}`}</p>
        ) : (
          <p className={cn(ROW_SUB, 'flex items-start gap-1.5')}>
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
    <PlainSection title="Badges">
      <ul className={cn('px-1', ROWS)}>
        {badges.map((badge) => (
          <BadgeRow key={badge.id} badge={badge} frame={frame} />
        ))}
      </ul>
    </PlainSection>
  );
}
