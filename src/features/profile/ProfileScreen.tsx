import { Settings } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { MenuGroups } from '@/app/MenuGroups';
import { HeadBlock } from '@/components/ui/HeadBlock';
import { Rise } from '@/components/ui/Rise';
import { Avatar } from '@/features/game/Avatar';
import { LevelProgress } from '@/features/game/LevelProgress';
import { BADGE_ICONS } from '@/features/quests/BadgesSection';
import { PlainSection, SectionPillLink } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { useApp } from '@/store/AppStoreProvider';
import { useGameView } from '@/store/useGame';
import { BorderSheet } from './BorderSheet';

/** How many badges the row under the stats shows. */
const BADGES_SHOWN = 5;

/**
 * The person, as in the glass wireframe: on the theme's block the settings gear, the avatar in its
 * border with a Lv badge (a tap opens the border sheet), the name, the tier and the way to the next
 * level. A card of the streak, badges and coins hangs over the block's edge, then a row of badges,
 * then the rest of the app's pages as plain rows. It is the last tab, and the avatar on Home opens it
 * too.
 */
export function ProfileScreen() {
  const { level, totals, cosmetics, streaks, badges } = useGameView();
  const name = useApp((s) => s.data.tables.profile[0]?.name);
  const [choosing, setChoosing] = useState(false);
  const coins = Math.max(0, totals.coins);
  const streak = streaks.find((s) => s.kind === 'logging')?.count ?? 0;
  const earned = badges.filter((b) => b.earnedAt !== null);
  // The ones earned come first; the rest follow in the catalogue's order.
  const shown = [...earned, ...badges.filter((b) => b.earnedAt === null)].slice(0, BADGES_SHOWN);

  const stats = [
    { value: streak.toLocaleString(), label: 'day streak' },
    { value: `${earned.length}/${badges.length}`, label: 'badges' },
    { value: coins.toLocaleString(), label: 'coins' },
  ];

  return (
    <>
      {/* The block must be the first thing on the page, so it can run up behind the status bar. */}
      <Rise index={0}>
        <HeadBlock>
          <div className="mx-auto max-w-3xl">
            {/* The wireframe draws no title: it is the page's name for a screen reader. */}
            <h1 className="sr-only">Profile</h1>
            <div className="flex justify-end">
              <Link
                to="/settings"
                aria-label="Settings"
                className="glass-head press grid size-11 place-items-center rounded-full"
              >
                <Settings aria-hidden="true" className="size-[19px]" />
              </Link>
            </div>
            <div className="mt-1 flex flex-col items-center text-center">
              <button
                type="button"
                aria-label={`Lv ${level.level}, choose your border`}
                onClick={() => setChoosing(true)}
                // The focus ring sits out past the widest border (Prism's), so it clears it.
                className="press relative rounded-full focus-visible:outline-offset-[8px]"
              >
                <Avatar item={cosmetics.avatar} frame={cosmetics.frame} size={92} tone="hero" />
                <span className="btn-head-flat absolute -bottom-[9px] left-1/2 -translate-x-1/2 rounded-full px-[9px] py-0.5 text-[11px] font-extrabold whitespace-nowrap">
                  {`Lv ${level.level}`}
                </span>
              </button>
              <p className="mt-[18px] max-w-full truncate text-[22px] leading-tight font-extrabold">
                {name || 'You'}
              </p>
              <p className="text-[13px] font-bold">{level.tier}</p>
              <div className="mt-3.5 w-full">
                <LevelProgress level={level} tone="hero" />
              </div>
            </div>
          </div>
        </HeadBlock>
      </Rise>

      <div className="mx-auto max-w-3xl">
        <Rise index={1}>
          {/* Over the block's edge on the thick glass; it is not a control, so it has no focus ring. */}
          <ul
            aria-label="Your game"
            className="glass-strong text-text relative -mt-[30px] grid grid-cols-3 rounded-[22px] py-3 text-center"
          >
            {stats.map(({ value, label }, i) => (
              <li
                key={label}
                className={cn('min-w-0', i > 0 && 'border-l border-black/7 dark:border-white/8')}
              >
                <b className="block text-[18px] font-extrabold tabular-nums">{value}</b>
                <small className="text-[11px] font-bold">{label}</small>
              </li>
            ))}
          </ul>
        </Rise>
        <Rise index={2}>
          <PlainSection
            title="Badges"
            action={
              <SectionPillLink to="/quests" aria-label="All badges">
                All
              </SectionPillLink>
            }
          >
            <ul aria-label="Badges" className="flex gap-2.5 px-1">
              {shown.map((badge) => {
                const Icon = BADGE_ICONS[badge.id];
                const got = badge.earnedAt !== null;
                return (
                  <li
                    key={badge.id}
                    className={cn(
                      'glass grid size-[50px] shrink-0 place-items-center rounded-full',
                      got ? 'text-accent' : 'text-muted',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-[22px]" />
                    <span className="sr-only">
                      {got ? badge.name : `${badge.name} (not earned yet)`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </PlainSection>
        </Rise>
        <MenuGroups riseFrom={3} />
        <Rise index={5}>
          <p className="text-muted mx-1 mt-3.5 text-[12px] leading-[1.45] font-semibold">
            Goals are in the Spending tab · Income stats are in History · Bills &amp; cards and
            Loans are on the Cards tab.
          </p>
        </Rise>
      </div>
      <BorderSheet open={choosing} onClose={() => setChoosing(false)} />
    </>
  );
}
