import { Coins } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import type { GameView } from '@/domain/game/engine';
import type { QuestView } from '@/domain/game/quests';
import { Avatar } from '@/features/game/Avatar';
import { LevelProgress } from '@/features/game/LevelProgress';
import { QuestList } from '@/features/game/QuestList';
import { GlassTile, PlainSection } from '@/features/shared/PlainSection';
import { useGameView } from '@/store/useGame';
import { BadgesSection } from './BadgesSection';
import { ChallengesSection } from './ChallengesSection';
import { HowToEarn } from './HowToEarn';
import { Group } from './Group';
import { StreaksSection } from './StreaksSection';
import { XpHistory } from './XpHistory';

const QUEST_GROUPS: readonly { cadence: QuestView['cadence']; title: string }[] = [
  { cadence: 'daily', title: 'Today' },
  { cadence: 'weekly', title: 'This week' },
  { cadence: 'monthly', title: 'This month' },
];

/**
 * The person's level, as one glass tile: avatar, tier, coins and the way to the shop, over the way to
 * the next level. It is the page's one summary; everything under it is plain rows.
 */
function LevelHeader({ game }: { game: GameView }) {
  const { level, totals, cosmetics } = game;
  const coins = Math.max(0, totals.coins);
  return (
    <Section>
      <GlassTile>
        <div className="flex items-center gap-3">
          <Avatar item={cosmetics.avatar} frame={cosmetics.frame} size={48} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="bg-xp-text text-xp-contrast rounded-[8px] px-2 py-0.5 text-xs font-extrabold tabular-nums">
                {`LV ${level.level}`}
              </span>
              <span className="text-[15px] font-extrabold">{level.tier}</span>
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
              <Coins aria-hidden="true" className="size-4" />
              {`${coins} ${coins === 1 ? 'coin' : 'coins'}`}
            </span>
          </div>
          <ButtonLink to="/shop" size="sm" variant="secondary" className="shrink-0">
            Shop
          </ButtonLink>
        </div>
        <div className="mt-4">
          <LevelProgress level={level} />
        </div>
      </GlassTile>
    </Section>
  );
}

/** Quests & Achievements: where the person stands in the game, and how to move on. */
export function QuestsScreen() {
  const game = useGameView();

  return (
    <div className="max-w-3xl">
      {/* Quests is a row of Profile's menu: where Back goes when the app has no history to go back through. */}
      <PageHeader title="Quests" back backTo="/profile" />
      <LevelHeader game={game} />
      <StreaksSection streaks={game.streaks} />
      <PlainSection title="Quests">
        <div className="flex flex-col gap-5">
          {QUEST_GROUPS.map(({ cadence, title }) => {
            const quests = game.quests.filter((q) => q.cadence === cadence);
            return quests.length > 0 ? (
              <Group key={cadence} title={title}>
                <QuestList quests={quests} />
              </Group>
            ) : null;
          })}
        </div>
      </PlainSection>
      <ChallengesSection challenges={game.challenges} />
      <BadgesSection badges={game.badges} frame={game.cosmetics.frame} />
      <HowToEarn streaks={game.streaks} />
      <XpHistory history={game.history} />
    </div>
  );
}
