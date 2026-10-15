import { Section } from '@/components/ui/Section';
import { BADGES } from '@/domain/game/badges';
import { CHALLENGES } from '@/domain/game/challenges';
import type { QuestView } from '@/domain/game/quests';
import {
  BADGE_REWARDS,
  CHALLENGE_REWARDS,
  LOG_CAP_PER_DAY,
  LOG_XP,
  QUEST_REWARDS,
  STREAK_MILESTONES,
} from '@/domain/game/rules';
import type { StreakView } from '@/domain/game/streaks';
import { Group } from './Group';
import { rewardText } from './rewardText';

function Rows({ lines }: { lines: readonly string[] }) {
  return (
    <ul className="divide-border divide-y">
      {lines.map((line) => (
        <li key={line} className="py-2 text-sm font-semibold">
          {line}
        </li>
      ))}
    </ul>
  );
}

/**
 * What earns XP and coins, written out from the game's own rules. Quests come from the ones that
 * apply to the person now, so each keeps its title.
 */
export function HowToEarn({
  quests,
  streaks,
}: {
  quests: readonly QuestView[];
  streaks: readonly StreakView[];
}) {
  return (
    <Section title="How to earn">
      <div className="flex flex-col gap-5">
        <Group title="Logging">
          <Rows
            lines={[`Log an expense or income — +${LOG_XP} XP (up to ${LOG_CAP_PER_DAY} a day)`]}
          />
        </Group>
        <Group title="Quests">
          <Rows lines={quests.map((q) => `${q.title} — ${rewardText(QUEST_REWARDS[q.id])}`)} />
        </Group>
        {streaks.map((streak) => (
          <Group key={streak.kind} title={`${streak.title} streak`}>
            <Rows
              lines={STREAK_MILESTONES[streak.kind].map(
                (m) => `${m.at}-${streak.unit} streak — ${rewardText(m)}`,
              )}
            />
          </Group>
        ))}
        <Group title="Badges">
          <Rows lines={BADGES.map((b) => `${b.name} — ${rewardText(BADGE_REWARDS[b.id])}`)} />
        </Group>
        <Group title="Challenges">
          <Rows
            lines={CHALLENGES.map((c) => `${c.title} — ${rewardText(CHALLENGE_REWARDS[c.kind])}`)}
          />
        </Group>
      </div>
    </Section>
  );
}
