import { Coins } from 'lucide-react';
import { MenuGroups } from '@/app/MenuGroups';
import { HeadBlock } from '@/components/ui/HeadBlock';
import { Pill } from '@/components/ui/Pill';
import { Rise } from '@/components/ui/Rise';
import { Avatar } from '@/features/game/Avatar';
import { LevelProgress } from '@/features/game/LevelProgress';
import { useApp } from '@/store/AppStoreProvider';
import { useGameView } from '@/store/useGame';

/**
 * The person: who they are in the game on the theme's block, then the rest of the app's pages in two
 * tiles. It is the last tab, and the avatar on Home opens it too.
 */
export function ProfileScreen() {
  const { level, totals, cosmetics } = useGameView();
  const name = useApp((s) => s.data.tables.profile[0]?.name);
  const coins = Math.max(0, totals.coins);

  return (
    <>
      {/* The block must be the first thing on the page, so it can run up behind the status bar. */}
      <Rise index={0}>
        <HeadBlock>
          <div className="max-w-3xl">
            <h1 className="text-page">Profile</h1>
            <div className="mt-5 flex items-center gap-3.5">
              <Avatar item={cosmetics.avatar} frame={cosmetics.frame} size={64} tone="hero" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-section truncate">{name || 'You'}</p>
                <p className="text-muted text-small truncate">{level.tier}</p>
              </div>
              <Pill tone="hero">{`Level ${level.level}`}</Pill>
            </div>
            <div className="mt-5">
              <LevelProgress level={level} tone="hero" />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Pill tone="hero">
                <Coins aria-hidden="true" className="size-4" />
                {`${coins.toLocaleString()} ${coins === 1 ? 'coin' : 'coins'}`}
              </Pill>
              <Pill tone="hero" to="/shop">
                Shop
              </Pill>
            </div>
          </div>
        </HeadBlock>
      </Rise>
      <div className="max-w-3xl">
        <MenuGroups riseFrom={1} />
      </div>
    </>
  );
}
