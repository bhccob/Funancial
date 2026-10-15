import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Section } from '@/components/ui/Section';
import type { ChallengeKind } from '@/domain/entities';
import {
  CHALLENGES,
  startRequirement,
  type ChallengeOutcome,
  type ChallengeView,
} from '@/domain/game/challenges';
import { CHALLENGE_REWARDS } from '@/domain/game/rules';
import { cn } from '@/lib/cn';
import { daysUntil } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useMoney, useToday } from '@/store/useFinance';
import { useGameActions, useGameContext } from '@/store/useGame';
import { Group } from './Group';
import { rewardText } from './rewardText';

/** How many finished challenges the screen keeps showing. */
const FINISHED_SHOWN = 5;

type Finished = ChallengeView & { outcome: Exclude<ChallengeOutcome, 'active'> };
const isFinished = (view: ChallengeView): view is Finished => view.outcome !== 'active';

const FINISHED_LABEL: Record<Finished['outcome'], string> = {
  won: 'Won',
  lost: 'Missed',
  abandoned: 'Given up',
};

function ActiveRow({ view, onGiveUp }: { view: ChallengeView; onGiveUp(): void }) {
  const money = useMoney();
  const today = useToday();
  const max = Math.max(1, view.target);
  const now = Math.min(view.current, max);
  // The last day counts: on it, one day is left.
  const daysLeft = Math.max(0, daysUntil(today, view.challenge.end) + 1);
  // The emergency sprint counts money, in minor units; the others count days or subscriptions.
  const progress =
    view.challenge.kind === 'emergency-sprint'
      ? `${money(view.current)} / ${money(view.target)}`
      : `${view.current} / ${view.target}`;

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{view.title}</p>
          <p className="text-muted text-[12.5px]">{view.detail}</p>
        </div>
        <p className="text-muted shrink-0 text-xs font-semibold">
          {`${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={view.title}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={now}
          aria-valuetext={view.detail}
          className="bg-track h-1 min-w-0 flex-1 overflow-hidden rounded-full"
        >
          <div
            className="bg-xp h-full rounded-full motion-safe:transition-[width]"
            style={{ width: `${(now / max) * 100}%` }}
          />
        </div>
        <span className="text-muted shrink-0 text-xs font-semibold tabular-nums">{progress}</span>
      </div>
      <Button size="sm" variant="ghost" className="mt-2 -ml-3" onClick={onGiveUp}>
        Give up
      </Button>
    </li>
  );
}

type Available = { kind: ChallengeKind; title: string; description: string; reason: string | null };

function AvailableRow({ challenge }: { challenge: Available }) {
  const { startChallenge } = useGameActions();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const reasonId = useId();
  const { kind, reason } = challenge;

  async function start() {
    setBusy(true);
    await run(() => startChallenge(kind));
    setBusy(false);
  }

  return (
    <li className="py-3">
      <p className="text-sm font-semibold">{challenge.title}</p>
      <p className="text-muted text-[12.5px]">{challenge.description}</p>
      <p className="text-xp-text mt-1 text-xs font-extrabold tabular-nums">
        {rewardText(CHALLENGE_REWARDS[kind])}
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="mt-2.5"
        disabled={busy || reason !== null}
        aria-describedby={reason === null ? undefined : reasonId}
        onClick={() => void start()}
      >
        Start
      </Button>
      {reason !== null && (
        <p id={reasonId} className="text-muted mt-1.5 text-[12.5px]">
          {reason}
        </p>
      )}
    </li>
  );
}

function FinishedRow({ view }: { view: Finished }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{view.title}</p>
        <p className="text-muted text-[12.5px]">{view.detail}</p>
      </div>
      <span
        className={cn(
          'shrink-0 text-xs font-extrabold',
          view.outcome === 'won' ? 'text-xp-text' : 'text-muted',
        )}
      >
        {FINISHED_LABEL[view.outcome]}
      </span>
    </li>
  );
}

/** Asks before a challenge is dropped. The button stays off while the change is being saved. */
function GiveUpDialog({ view, onClose }: { view: ChallengeView | null; onClose(): void }) {
  const { abandonChallenge } = useGameActions();
  const run = useAction();
  const [busy, setBusy] = useState(false);

  async function giveUp() {
    if (view === null) return;
    setBusy(true);
    const done = await run(() => abandonChallenge(view.challenge.id));
    setBusy(false);
    if (done) onClose();
  }

  return (
    <Dialog
      open={view !== null}
      title={view === null ? 'Give up?' : `Give up ${view.title}?`}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep going
          </Button>
          <Button disabled={busy} onClick={() => void giveUp()}>
            Give up
          </Button>
        </>
      }
    />
  );
}

/**
 * The challenges running, the ones that can be started (with why one cannot) and the last few that
 * ended. A running challenge is not offered again.
 */
export function ChallengesSection({ challenges }: { challenges: readonly ChallengeView[] }) {
  const data = useApp((s) => s.data);
  const ctx = useGameContext();
  const [giving, setGiving] = useState<ChallengeView | null>(null);

  const active = challenges.filter((v) => v.outcome === 'active');
  const finished = challenges.filter(isFinished).slice(0, FINISHED_SHOWN);
  const available = useMemo<Available[]>(() => {
    const running = new Set(
      challenges.filter((v) => v.outcome === 'active').map((v) => v.challenge.kind),
    );
    return CHALLENGES.filter((c) => !running.has(c.kind)).map((c) => ({
      ...c,
      reason: startRequirement(c.kind, data, ctx),
    }));
  }, [challenges, data, ctx]);

  return (
    <Section title="Challenges">
      <div className="flex flex-col gap-5">
        {active.length > 0 && (
          <Group title="Active">
            <ul className="divide-border divide-y">
              {active.map((view) => (
                <ActiveRow key={view.challenge.id} view={view} onGiveUp={() => setGiving(view)} />
              ))}
            </ul>
          </Group>
        )}
        {available.length > 0 && (
          <Group title="Available">
            <ul className="divide-border divide-y">
              {available.map((challenge) => (
                <AvailableRow key={challenge.kind} challenge={challenge} />
              ))}
            </ul>
          </Group>
        )}
        {finished.length > 0 && (
          <Group title="Finished">
            <ul className="divide-border divide-y">
              {finished.map((view) => (
                <FinishedRow key={view.challenge.id} view={view} />
              ))}
            </ul>
          </Group>
        )}
      </div>
      <GiveUpDialog view={giving} onClose={() => setGiving(null)} />
    </Section>
  );
}
