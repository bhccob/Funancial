import { Bell } from 'lucide-react';
import { Link } from 'react-router';
import { PROFILE } from '@/app/menu';
import { Ring } from '@/components/charts/Ring';
import type { GameView } from '@/domain/game/engine';
import { Avatar } from '@/features/game/Avatar';
import { useCurrency } from '@/store/useFinance';
import { useInboxItems } from '@/store/useInbox';

export interface HomeTopLineProps {
  name: string | undefined;
  game: Pick<GameView, 'level' | 'cosmetics'>;
}

/**
 * The ring round the avatar is 44px, its 3px arc 19px to 22px from the middle. The avatar is 30px,
 * so the widest border it can wear, Prism's (a 2px rainbow and a 1px glass edge outside the
 * avatar), ends at 18px and leaves a pixel clear of the ring; at 36px it would run into it.
 */
const RING = 44;
const AVATAR = 30;

/**
 * Home's top line, on the theme's block: the avatar in the border it wears, in a ring of the progress
 * through its level (it opens Profile), "Hi, Sam", and on the right the profile's currency on a
 * small glass pill (only shown for now; picking one comes later) and the bell, which opens the inbox
 * and has a dot while something in it is unread.
 */
export function HomeTopLine({ name, game }: HomeTopLineProps) {
  const { level, cosmetics } = game;
  const currency = useCurrency();
  const unread = useInboxItems().filter((i) => !i.read).length;

  return (
    <div className="flex items-center gap-2.5 pt-1.5">
      <Link
        to={PROFILE.path}
        aria-label={`${PROFILE.label}, level ${level.level}`}
        className="press flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        {/* The link's label already says the level. */}
        <span aria-hidden="true" className="flex">
          <Ring
            value={level.progress * 100}
            size={RING}
            thickness={3}
            color="var(--color-hero-xp)"
            track="var(--hg-bg)"
            label={`Level ${level.level}`}
          >
            <Avatar item={cosmetics.avatar} frame={cosmetics.frame} size={AVATAR} tone="hero" />
          </Ring>
        </span>
      </Link>
      <p className="min-w-0 flex-1 truncate text-[16px] leading-tight font-extrabold">
        {name ? `Hi, ${name}` : 'Hi there'}
      </p>
      <div className="flex shrink-0 items-center gap-0.5">
        <span className="glass-head inline-flex min-h-[30px] items-center rounded-full px-2.5 text-[12px] font-bold">
          {currency}
        </span>
        <Link
          to="/inbox"
          aria-label={unread > 0 ? `Inbox, ${unread} new` : 'Inbox'}
          className="press relative grid size-11 place-items-center rounded-full"
        >
          <Bell aria-hidden="true" className="size-[19px]" />
          {/* In the ink, the one mark that holds 3:1 on every block; it sits where the bell is open. */}
          {unread > 0 && (
            <span
              data-testid="unread-dot"
              aria-hidden="true"
              className="bg-head-ink absolute top-[11px] right-[11px] size-2 rounded-full"
            />
          )}
        </Link>
      </div>
    </div>
  );
}
