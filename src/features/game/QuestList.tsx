import {
  CalendarCheck,
  Check,
  Coins,
  ListChecks,
  Receipt,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { QuestView } from '@/domain/game/quests';
import type { QuestId } from '@/domain/game/types';
import { useAction } from '@/lib/useAction';
import { useGameActions } from '@/store/useGame';
import { WeeklyCheckInDialog } from './WeeklyCheckInDialog';

const ICONS: Record<QuestId, LucideIcon> = {
  'log-today': Receipt,
  'week-limits': Target,
  'week-checkin': CalendarCheck,
  'month-salary': Wallet,
  'month-audit': ListChecks,
  'month-dividends': Coins,
};

const CADENCE_ORDER: Record<QuestView['cadence'], number> = { daily: 0, weekly: 1, monthly: 2 };

/** Quests still to do first, then daily before weekly before monthly; ties keep the game's order. */
function inOrder(quests: readonly QuestView[]): QuestView[] {
  return [...quests].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) || CADENCE_ORDER[a.cadence] - CADENCE_ORDER[b.cadence],
  );
}

function QuestRow({ quest, onCheckIn }: { quest: QuestView; onCheckIn(): void }) {
  const { checkInNoSpend } = useGameActions();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const Icon = ICONS[quest.id];
  const max = Math.max(1, quest.target);
  const now = quest.done ? max : Math.min(quest.current, max);

  async function nothingSpent() {
    setBusy(true);
    await run(() => checkInNoSpend());
    setBusy(false);
  }

  return (
    <li className="flex items-start gap-3 py-3">
      <span className="bg-surface-2 grid size-9 shrink-0 place-items-center rounded-xl">
        <Icon aria-hidden="true" className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{quest.title}</p>
        <p className="text-muted text-[12.5px]">{quest.detail}</p>
        <div
          role="progressbar"
          aria-label={quest.title}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={now}
          aria-valuetext={quest.detail}
          className="bg-track mt-2 h-1 overflow-hidden rounded-full"
        >
          <div
            className="bg-xp h-full rounded-full motion-safe:transition-[width]"
            style={{ width: `${(now / max) * 100}%` }}
          />
        </div>
        {quest.action === 'no-spend' && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-2.5"
            disabled={busy}
            onClick={() => void nothingSpent()}
          >
            Nothing spent
          </Button>
        )}
        {quest.action === 'checkin' && (
          <Button size="sm" variant="secondary" className="mt-2.5" onClick={onCheckIn}>
            Check in
          </Button>
        )}
      </div>
      {quest.done ? (
        <span className="text-muted flex shrink-0 items-center gap-1 text-xs font-bold">
          <Check aria-hidden="true" className="size-3.5" />
          Done
        </span>
      ) : (
        <span className="text-xp-text shrink-0 text-xs font-extrabold tabular-nums">
          +{quest.reward.xp} XP
        </span>
      )}
    </li>
  );
}

/**
 * One row per quest: what it is, how far along, and what it pays. A quest that can be done on the
 * spot has its button. `limit` keeps the first few in order.
 */
export function QuestList({ quests, limit }: { quests: readonly QuestView[]; limit?: number }) {
  const [checkingIn, setCheckingIn] = useState(false);
  const shown = inOrder(quests).slice(0, limit);

  return (
    <>
      <ul className="divide-border divide-y">
        {shown.map((quest) => (
          <QuestRow key={quest.id} quest={quest} onCheckIn={() => setCheckingIn(true)} />
        ))}
      </ul>
      <WeeklyCheckInDialog open={checkingIn} onClose={() => setCheckingIn(false)} />
    </>
  );
}
