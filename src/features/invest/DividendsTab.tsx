import { useId, useMemo, useState, type ReactNode } from 'react';
import { DayBars } from '@/components/charts/DayBars';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Section } from '@/components/ui/Section';
import { addDays } from '@/domain/dates';
import {
  dividendTotals,
  duePayouts,
  expectedPayouts,
  monthlyIncome,
  projectedAnnual,
  topPayers,
  type ExpectedPayout,
} from '@/domain/dividends';
import { dividendStreak } from '@/domain/game/streaks';
import { cn } from '@/lib/cn';
import { formatDay, formatMonthShort, formatMonthYear, formatPercent } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency, useMoney, useToday } from '@/store/useFinance';
import { useGameContext } from '@/store/useGame';
import { useInvestActions, usePortfolio } from '@/store/useInvest';
import { ConfirmDividendDialog } from './ConfirmDividendDialog';

type Dir = 'next' | 'past';

const PERIODS: Array<{ id: Dir; label: string }> = [
  { id: 'next', label: 'Next 12 months' },
  { id: 'past', label: 'Last 12 months' },
];

const UNKNOWN = '—';
/** A date, with "~" in front when it is a guess rather than one the price service gave. */
const day = (date: string, known: boolean) => `${known ? '' : '~'}${formatDay(date)}`;

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted text-[13px] font-bold">{label}</dt>
      <dd className="mt-0.5 text-[22px] leading-tight font-extrabold tracking-[-0.02em] tabular-nums">
        {children}
      </dd>
    </div>
  );
}

/** A title and a muted line on the left, an amount on the right, and optionally actions below. */
function Row({
  title,
  titleId,
  sub,
  amount,
  children,
}: {
  title: string;
  titleId?: string;
  sub?: string;
  amount: string;
  children?: ReactNode;
}) {
  return (
    <li className="border-border border-t py-2.5 first:border-t-0">
      <div className="flex min-h-11 items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span id={titleId} className="truncate text-[15px] font-extrabold">
            {title}
          </span>
          {sub && <span className="text-muted text-[13px] font-semibold">{sub}</span>}
        </span>
        <span className="flex-none text-[15px] font-extrabold tabular-nums">{amount}</span>
      </div>
      {children}
    </li>
  );
}

function DueRow({
  payout,
  onConfirm,
  onSkip,
}: {
  payout: ExpectedPayout;
  onConfirm(): void;
  onSkip(): void;
}) {
  const money = useMoney();
  const titleId = useId();
  return (
    <Row
      titleId={titleId}
      title={`${payout.holding.symbol} · paid ${day(payout.payDate, payout.payDateKnown)}`}
      amount={payout.net === null ? UNKNOWN : money(payout.net)}
    >
      <div className="mt-1 flex flex-wrap gap-2">
        {/* The buttons are the same on every row, so the row's title says which payout. */}
        <Button size="sm" aria-describedby={titleId} onClick={onConfirm}>
          Confirm
        </Button>
        <Button size="sm" variant="secondary" aria-describedby={titleId} onClick={onSkip}>
          Didn't get it
        </Button>
      </div>
    </Row>
  );
}

/**
 * Dividends: what came in and what is expected, a bar per month, the payouts waiting to be
 * confirmed, those coming in the next 60 days, the holdings that pay the most, and the streak of
 * months with a dividend.
 */
export function DividendsTab() {
  const money = useMoney();
  const data = useApp((s) => s.data);
  const currency = useCurrency();
  const today = useToday();
  const game = useGameContext();
  const { value } = usePortfolio();
  const { skipDividend } = useInvestActions();
  const run = useAction();
  const [dir, setDir] = useState<Dir>('next');
  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<ExpectedPayout | null>(null);

  const view = useMemo(() => {
    const due = duePayouts(data, currency, today);
    const coming = expectedPayouts(data, currency, addDays(today, 1), addDays(today, 60), today);
    const ahead = expectedPayouts(data, currency, today, addDays(today, 364), today);
    return {
      due,
      coming,
      totals: dividendTotals(data, today),
      projected: projectedAnnual(data, currency, today),
      payers: topPayers(data, currency, today),
      // Nothing recorded and nothing expected: no holding pays dividends.
      empty: data.tables.dividend.length === 0 && due.length === 0 && ahead.length === 0,
    };
  }, [data, currency, today]);
  const streak = useMemo(() => dividendStreak(data, game), [data, game]);
  const months = useMemo(
    () =>
      monthlyIncome(data, currency, today, dir).map(({ month, amount }) => ({
        month,
        label: formatMonthShort(`${month}-01`),
        amount,
        // The current month leads the bars, as today does on the week's.
        isToday: month === today.slice(0, 7),
      })),
    [data, currency, today, dir],
  );

  if (view.empty) {
    return (
      <Section>
        <EmptyState title="No dividends yet. Holdings that pay dividends show up here." />
      </Section>
    );
  }

  const { due, coming, totals, projected, payers } = view;
  const picked = selected === null ? undefined : months[selected];

  return (
    <>
      <Section>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Figure label="This month">{money(totals.month)}</Figure>
          <Figure label="This year">{money(totals.year)}</Figure>
          <Figure label="Next 12 months">{`~${money(projected, { whole: true })}`}</Figure>
          <Figure label="Yield">
            {value > 0 ? formatPercent((projected * 100) / value) : UNKNOWN}
          </Figure>
        </dl>

        <div role="group" aria-label="Months shown" className="mt-6 flex flex-wrap gap-2">
          {PERIODS.map(({ id, label }) => {
            const on = id === dir;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setDir(id);
                  setSelected(null);
                }}
                className={cn(
                  'h-11 rounded-full px-4 text-sm font-bold motion-safe:transition-colors',
                  on ? 'bg-primary text-primary-contrast' : 'bg-surface-2 text-text',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="mt-5">
          <DayBars
            days={months}
            selected={selected}
            onSelect={setSelected}
            formatAmount={(minor) => money(minor)}
          />
        </div>
        <p aria-live="polite" className="text-muted mt-3.5 text-sm font-bold">
          {picked ? (
            <>
              <b className="text-text">{formatMonthYear(picked.month)}</b> ·{' '}
              <b className="text-text">{money(picked.amount)}</b>
            </>
          ) : dir === 'next' ? (
            'Expected after tax · tap a month'
          ) : (
            'Received · tap a month'
          )}
        </p>
      </Section>

      {due.length > 0 && (
        <Section title="Due">
          <ul>
            {due.map((p) => (
              <DueRow
                key={`${p.holding.id}:${p.payDate}`}
                payout={p}
                onConfirm={() => setConfirming(p)}
                onSkip={() =>
                  void run(() => skipDividend(p), { success: 'Marked as not received.' })
                }
              />
            ))}
          </ul>
        </Section>
      )}

      {coming.length > 0 && (
        <Section title="Coming up">
          <ul>
            {coming.map((p) => {
              const tax =
                p.holding.withholdingPct > 0
                  ? `after ${p.holding.withholdingPct}% tax`
                  : 'before tax';
              return (
                <Row
                  key={`${p.holding.id}:${p.payDate}`}
                  title={`${p.holding.symbol} · pays ${day(p.payDate, p.payDateKnown)}`}
                  sub={p.exDate ? `ex-date ${day(p.exDate, p.exDateKnown)} · ${tax}` : tax}
                  amount={p.net === null ? UNKNOWN : money(p.net)}
                />
              );
            })}
          </ul>
        </Section>
      )}

      {payers.length > 0 && (
        <Section title="Top payers">
          <ul>
            {payers.map(({ holding, annual }) => (
              <Row
                key={holding.id}
                title={`${holding.symbol} · ${holding.name}`}
                amount={`${money(annual)} a year`}
              />
            ))}
          </ul>
        </Section>
      )}

      {streak.active && (
        <Section title="Dividend streak">
          {streak.count > 0 ? (
            <p className="text-[15px] font-extrabold tabular-nums">
              {`${streak.count} ${streak.unit}${streak.count === 1 ? '' : 's'}`}
            </p>
          ) : (
            <p className="text-muted text-sm font-semibold">Start a new streak today.</p>
          )}
        </Section>
      )}

      <ConfirmDividendDialog payout={confirming} onClose={() => setConfirming(null)} />
    </>
  );
}
