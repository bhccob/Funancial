import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { HelpTip } from '@/components/ui/HelpTip';
import { PageHeader } from '@/components/ui/PageHeader';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Section } from '@/components/ui/Section';
import { categoryLabel } from '@/domain/budget';
import type { BuyDecision, Facts } from '@/domain/entities';
import { localDay } from '@/domain/game/activity';
import { formatDay } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { usePlatform } from '@/platform/PlatformProvider';
import { useReminderSettings } from '@/features/shared/reminders';
import { RATE_RANGE, remindDay, type BuyPrefill } from '@/store/buyActions';
import { useApp } from '@/store/AppStoreProvider';
import { useBuyActions, useDecision } from '@/store/useBuy';
import { useMoney, useToday } from '@/store/useFinance';
import { BuyMeter } from './BuyMeter';
import { statusLine, VERDICT_LABEL } from './text';

const RATINGS = ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }));
const months = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** The facts the rules found, as a name and a value each, with the ones that are not known left out. */
function factLines({ ask, facts }: BuyDecision, money: (minor: number) => string) {
  const lines: Array<[name: string, value: string]> = [];
  const limit = (name: string, line: Facts['categoryAfter']) => {
    if (line === null) return;
    const over = line.spentAfter - line.limit;
    lines.push([
      `${name} limit after`,
      `${line.pct}%${over > 0 ? ` · over by ${money(over)}` : ''}`,
    ]);
  };
  limit(categoryLabel(ask.category), facts.categoryAfter);
  limit('Overall', facts.overallAfter);
  lines.push(['Available after', money(facts.availableAfter)]);
  const { emergencyBefore, emergencyAfter, goalDelay } = facts;
  if (emergencyBefore !== null && emergencyAfter !== null) {
    lines.push([
      'Emergency fund',
      `${months.format(emergencyBefore)} → ${months.format(emergencyAfter)} months`,
    ]);
  }
  if (goalDelay) {
    const { name, days } = goalDelay;
    lines.push([`${name} goal`, `+${days} ${days === 1 ? 'day' : 'days'} later`]);
  }
  return lines;
}

/**
 * The answer to one ask: the buy meter, the verdict, the facts behind it, why it was held at Wait,
 * the person's own notes, and the choice (remind me, bought it, skip it) with where it stands. A
 * decision that is gone (deleted, or a bad link) sends the person back to the list.
 */
export function AnswerScreen() {
  const { id = '' } = useParams();
  const decision = useDecision(id);
  const actions = useBuyActions();
  const navigate = useNavigate();
  const money = useMoney();
  const today = useToday();
  const run = useAction();
  const reminders = useReminderSettings();
  const { notifier } = usePlatform();
  const demo = useApp((s) => s.namespace === 'demo');
  const [busy, setBusy] = useState(false);
  // The decision a re-check is replacing: once it is gone the screen waits for the new one, not the list.
  const [replacing, setReplacing] = useState<string | null>(null);

  if (!decision) return replacing === id ? null : <Navigate to="/buy" replace />;

  const { ask, facts, guards, notes, status } = decision;
  const decided = statusLine(decision);
  // The promised reminder never comes on demo money or the web, nor with the master switch or this
  // rule off. Only in that last case does Settings have a switch to point to.
  const switchable = !!notifier && !demo;
  const wontRemind =
    status === 'waiting' && (!switchable || !reminders.enabled || !reminders.buyIt);

  async function decide(fn: () => Promise<unknown>) {
    setBusy(true);
    const done = await run(fn);
    setBusy(false);
    return done;
  }

  async function bought() {
    const result: { prefill?: BuyPrefill } = {};
    const done = await decide(async () => {
      result.prefill = await actions.bought(id);
    });
    if (done) void navigate('/add', { state: { prefill: result.prefill } });
  }

  async function recheck() {
    const result: { id?: string } = {};
    setReplacing(id);
    const done = await decide(async () => {
      result.id = await actions.recheck(id);
    });
    if (done) void navigate(`/buy/${result.id}`, { replace: true });
    else setReplacing(null);
  }

  return (
    <div className="max-w-xl">
      <Link
        to="/buy"
        aria-label="Back to Buy it?"
        className="text-muted -mb-1 inline-flex min-h-11 items-center text-[15px] font-extrabold"
      >
        ‹ Buy it?
      </Link>
      <PageHeader title={ask.item}>
        <p>
          {ask.quantity === 1
            ? money(facts.total)
            : `${ask.quantity} × ${money(ask.price)} = ${money(facts.total)}`}
        </p>
        <p>{`Asked ${formatDay(localDay(decision.createdAt))}`}</p>
      </PageHeader>

      <Section>
        <div className="mb-3 flex items-center justify-center gap-3">
          <span className="text-muted text-sm font-bold">Buy meter</span>
          <HelpTip pageId="buy-it" label="the buy meter" />
        </div>
        <BuyMeter meter={decision.meter} />
        <p className="mt-5 text-center">
          <span className="text-[26px] leading-tight font-extrabold tracking-[-0.02em]">
            {VERDICT_LABEL[decision.verdict]}
          </span>{' '}
          <span className="text-muted text-sm font-bold">· confidence {decision.confidence}</span>
        </p>

        <ul aria-label="The facts" className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4">
          {factLines(decision, money).map(([key, value]) => (
            <li key={key}>
              <p className="text-muted text-[13px] font-bold">{key}</p>
              <p className="text-[15px] font-extrabold tabular-nums">{value}</p>
            </li>
          ))}
        </ul>

        {guards.capAtWait && (
          <Banner tone="warning" className="mt-6">
            {guards.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </Banner>
        )}

        {notes.length > 0 && (
          <ul className="mt-6 flex flex-col gap-1">
            {notes.map((note, i) => (
              <li key={i} className="text-muted text-sm font-semibold">
                {note}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section>
        <div aria-live="polite">
          {decided && <p className="text-[17px] font-extrabold">{decided}</p>}
          {wontRemind && (
            <p className="text-muted text-sm font-semibold">
              {demo ? (
                "Reminders don't come on demo money."
              ) : !notifier ? (
                'Reminders only come on the phone.'
              ) : (
                <>
                  Reminders are off. Turn them on in{' '}
                  <Link
                    to="/settings"
                    className="text-accent-text -my-1 inline-flex min-h-11 items-center font-bold underline underline-offset-4"
                  >
                    Settings
                  </Link>
                  .
                </>
              )}
            </p>
          )}
        </div>
        {(status === 'open' || status === 'waiting') && (
          <div className={decided ? 'mt-4 flex flex-wrap gap-2' : 'flex flex-wrap gap-2'}>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void decide(() => actions.wait(decision.id))}
            >
              Remind me {formatDay(remindDay(facts.resetsOn, today))}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void bought()}>
              I bought it
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void decide(() => actions.skip(decision.id))}
            >
              Skip it
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void recheck()}>
              Check again
            </Button>
          </div>
        )}
        {status === 'bought' && (
          <div className="mt-4 flex flex-col gap-2">
            <RadioGroup
              variant="underline"
              legend="Was it worth it?"
              value={decision.usage === null ? '' : String(decision.usage)}
              options={RATINGS}
              // A single digit is about 12px wide: the option is widened to a touch target.
              optionClassName="min-w-11 justify-center"
              onChange={(v) => void run(() => actions.rate(decision.id, Number(v)))}
            />
            <p className="text-muted text-sm font-semibold">{RATE_RANGE}</p>
          </div>
        )}
      </Section>

      <p className="text-muted pt-2 text-[13px] font-semibold">Not financial advice</p>
    </div>
  );
}
