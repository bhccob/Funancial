import { Section } from '@/components/ui/Section';
import { BADGES } from '@/domain/game/badges';
import { CHALLENGES } from '@/domain/game/challenges';
import { QUEST_TITLES } from '@/domain/game/quests';
import {
  BADGE_REWARDS,
  CHALLENGE_REWARDS,
  LOG_CAP_PER_DAY,
  LOG_XP,
  QUEST_REWARDS,
  STREAK_MILESTONES,
} from '@/domain/game/rules';
import type { StreakView } from '@/domain/game/streaks';
import type { QuestId } from '@/domain/game/types';
import { Group } from './Group';
import { rewardText } from './rewardText';

/** Every quest, in the order of the day, week and month. */
const QUEST_ORDER: readonly QuestId[] = [
  'log-today',
  'week-limits',
  'week-checkin',
  'month-salary',
  'month-audit',
  'month-dividends',
];

/** "Daily logging" becomes "Daily logging streak"; "Dividend streak" already says it. */
const streakGroupTitle = (title: string) => (title.endsWith('streak') ? title : `${title} streak`);

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
 * What earns XP and coins, written out from the game's own rules: every quest, whether or not it
 * applies to the person yet, and every streak milestone, badge and challenge.
 */
export function HowToEarn({ streaks }: { streaks: readonly StreakView[] }) {
  return (
    <Section title="How to earn">
      <div className="flex flex-col gap-5">
        <Group title="Logging">
          <Rows
            lines={[
              `Log an expense, income or dividend — +${LOG_XP} XP (up to ${LOG_CAP_PER_DAY} a day)`,
            ]}
          />
        </Group>
        <Group title="Quests">
          <Rows
            lines={QUEST_ORDER.map(
              (id) => `${QUEST_TITLES[id]} — ${rewardText(QUEST_REWARDS[id])}`,
            )}
          />
        </Group>
        {streaks.map((streak) => (
          <Group key={streak.kind} title={streakGroupTitle(streak.title)}>
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
