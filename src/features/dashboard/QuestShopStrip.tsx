import { ChevronRight, Coins, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';

export interface QuestShopStripProps {
  /** `questProgress` of the quests open now: how many are done out of how many are open. */
  progress: { done: number; open: number };
  coins: number;
  className?: string;
}

/**
 * One slim glass strip under Home's Coming up, split in two. On the left the quests: "Quests 2/3"
 * with a bar of that fraction, "All done" when every one is, or "Quests" alone, with no bar, when
 * none is open; it opens the Quests screen. On the right the coins and "Shop", opening the Shop.
 * Each half is a link at least 44px tall.
 *
 * The bar is a mark, so its fill is the ink, which holds 3:1 on the glass in every theme; the track
 * behind it is only a hint (about 1.1:1 on the light page) and nothing relies on it: the words say
 * the same as the bar.
 */
export function QuestShopStrip({ progress, coins, className }: QuestShopStripProps) {
  const { done, open } = progress;
  const allDone = open > 0 && done >= open;
  const percent = open > 0 ? Math.min(100, Math.round((done / open) * 100)) : 0;
  return (
    <div
      data-testid="quest-shop-strip"
      className={cn(
        'glass flex divide-x divide-black/7 rounded-[18px] dark:divide-white/8',
        className,
      )}
    >
      <Link
        to="/quests"
        className="press flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-l-[18px] px-3 py-2.5"
      >
        <Trophy aria-hidden="true" className="size-[17px] flex-none" />
        <span className="min-w-0 flex-1">
          {open === 0 ? (
            <b className="block truncate text-[13px] font-extrabold">Quests</b>
          ) : allDone ? (
            <b className="block truncate text-[13px] font-extrabold">
              <span className="sr-only">Quests:</span> All done
            </b>
          ) : (
            <b className="block truncate text-[13px] font-extrabold">{`Quests ${done}/${open}`}</b>
          )}
          {open > 0 && (
            <span aria-hidden="true" className="bg-text/15 mt-1 block h-[5px] rounded-full">
              <i
                data-testid="quests-bar-fill"
                className="bg-text block h-full rounded-full"
                style={{ width: `${percent}%` }}
              />
            </span>
          )}
        </span>
      </Link>
      <Link
        to="/shop"
        className="press flex min-h-11 max-w-[65%] flex-none items-center gap-2.5 rounded-r-[18px] px-3 py-2.5"
      >
        <Coins aria-hidden="true" className="size-[17px] flex-none" />
        <span className="min-w-0 truncate">
          <b className="text-[13px] font-extrabold">{coins}</b>{' '}
          <small className="text-muted text-[11.5px] font-bold">
            {`${coins === 1 ? 'coin' : 'coins'} · Shop`}
          </small>
        </span>
        <ChevronRight aria-hidden="true" className="size-[15px] flex-none" />
      </Link>
    </div>
  );
}
