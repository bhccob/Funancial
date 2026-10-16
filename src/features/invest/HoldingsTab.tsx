import { Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Donut, DonutLegend } from '@/components/charts/Donut';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Section } from '@/components/ui/Section';
import type { Holding } from '@/domain/entities';
import { allocation, holdingPrice, TYPE_LABELS, type HoldingRow } from '@/domain/portfolio';
import { cn } from '@/lib/cn';
import { formatPercent, formatShares } from '@/lib/format';
import { useMoney } from '@/store/useFinance';
import { usePortfolio } from '@/store/useInvest';
import { HoldingDialog } from './HoldingDialog';

/** Stocks, then ETFs, then the rest: the order of the pies and of the rows. */
const TYPES: Array<Holding['type']> = ['stock', 'etf', 'other'];

const VIEWS = [
  { id: 'split', label: 'Split' },
  { id: 'together', label: 'Together' },
] as const;

const sharesText = (n: number) => `${formatShares(n)} ${n === 1 ? 'share' : 'shares'}`;

const tone = (n: number) => (n < 0 ? 'text-danger' : 'text-accent-text');
const arrow = (n: number) => (n < 0 ? '▼' : '▲');

function HoldingItem({ row }: { row: HoldingRow }) {
  const money = useMoney();
  const { holding, value, gainPct } = row;
  return (
    <li className="border-border border-t first:border-t-0">
      <Link
        to={`/invest/holding/${holding.id}`}
        className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-extrabold">
            {holding.symbol} · {holding.name}
          </span>
          <span className="text-muted text-[13px] font-semibold">{sharesText(holding.shares)}</span>
        </span>
        {value === null ? (
          <span className="text-muted text-[13px] font-bold">
            {holdingPrice(holding) === null ? 'Not priced yet' : 'No exchange rate yet'}
          </span>
        ) : (
          <span className="flex flex-none flex-col items-end tabular-nums">
            <span className="text-[15px] font-extrabold">{money(value)}</span>
            {gainPct !== null && (
              <span className={cn('text-[13px] font-extrabold', tone(gainPct))}>
                {`${arrow(gainPct)} ${formatPercent(gainPct)}`}
              </span>
            )}
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * One pie of these holdings (by holding, the biggest five and the rest as Other) with its legend,
 * both showing each share. With a `summary` it has a heading over it: the type and what it adds up to.
 */
function PieBlock({
  rows,
  label,
  summary,
}: {
  rows: HoldingRow[];
  label: string;
  summary?: string;
}) {
  const money = useMoney();
  const headingId = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const slices = useMemo(() => allocation(rows, 'holding'), [rows]);
  const whole = (minor: number) => money(minor, { whole: true });
  const total = slices.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div
      role="group"
      aria-labelledby={summary ? headingId : undefined}
      aria-label={summary ? undefined : label}
      className="mt-6"
    >
      {summary && (
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h3 id={headingId} className="text-[15px] font-extrabold">
            {label}
          </h3>
          <span className="text-muted text-[13px] font-bold tabular-nums">{summary}</span>
        </div>
      )}
      <div className="flex items-center gap-3.5">
        <Donut
          slices={slices}
          size={120}
          thickness={14}
          showPercent
          formatAmount={(minor) => money(minor)}
          idle={{ value: whole(total), label }}
          selected={selected}
          onSelect={setSelected}
        />
        <DonutLegend
          slices={slices}
          showPercent
          formatAmount={whole}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
    </div>
  );
}

/**
 * What the person holds: the portfolio's value and how it moved, its pies (one each for stocks and
 * ETFs, or all together, the choice kept in `?pies=`), and the holdings by type, each opening its
 * own page. `refresh` fetches prices for a new holding.
 */
export function HoldingsTab({ refresh }: { refresh(): Promise<void> }) {
  const money = useMoney();
  const portfolio = usePortfolio();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);

  const { rows, value, dayChange, gainPct, best, worst } = portfolio;
  const together = params.get('pies') === 'together';
  const whole = (minor: number) => money(minor, { whole: true });
  const byType = TYPES.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    rows: rows.filter((r) => r.holding.type === type),
  })).filter((g) => g.rows.length > 0);
  // A type that has nothing priced has no pie; its holdings still list below, saying what is missing.
  const pies = byType
    .filter((g) => g.rows.some((r) => r.value !== null))
    .map((g) => ({ ...g, value: g.rows.reduce((sum, r) => sum + (r.value ?? 0), 0) }));
  // A day's move is only known for holdings with a quote that carries the previous close.
  const hasDay = rows.some((r) => r.dayChange !== null);
  // A holding with no price at all says "Not priced yet" on its row; only one with a price but no rate is counted here.
  const noRate = rows.filter((r) => r.value === null && holdingPrice(r.holding) !== null).length;

  const change = (n: number, text: string) => (
    <span className={tone(n)}>{`${arrow(n)} ${text}`}</span>
  );

  function choose(id: (typeof VIEWS)[number]['id']) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id === 'together') next.set('pies', 'together');
        else next.delete('pies');
        return next;
      },
      { replace: true },
    );
  }

  return (
    <>
      {rows.length === 0 ? (
        <Section>
          <EmptyState
            title="No investments yet"
            action={<Button onClick={() => setAdding(true)}>Add your first holding</Button>}
          />
        </Section>
      ) : (
        <>
          <Section title="Portfolio value">
            <p className="text-[34px] leading-tight font-extrabold tracking-[-0.035em] tabular-nums">
              {money(value)}
            </p>
            {(hasDay || gainPct !== null) && (
              <p className="mt-1 text-[13.5px] font-extrabold tabular-nums">
                {hasDay && change(dayChange, `${money(Math.abs(dayChange))} today`)}
                {hasDay && gainPct !== null && <span className="text-muted"> · </span>}
                {gainPct !== null && change(gainPct, `${formatPercent(gainPct)} all time`)}
              </p>
            )}
            {pies.length > 0 && (
              <>
                <div role="group" aria-label="Pie view" className="mt-5 flex flex-wrap gap-2">
                  {VIEWS.map(({ id, label }) => {
                    const on = (id === 'together') === together;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => choose(id)}
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
                {together ? (
                  <PieBlock rows={rows} label="All holdings" />
                ) : (
                  pies.map((pie) => (
                    <PieBlock
                      key={pie.type}
                      rows={pie.rows}
                      label={pie.label}
                      summary={`${whole(pie.value)} · ${value > 0 ? Math.round((pie.value * 100) / value) : 0}%`}
                    />
                  ))
                )}
              </>
            )}
          </Section>

          <Section>
            {byType.map((g) => (
              <div key={g.type} className="mt-5 first:mt-0">
                <h3 className="text-muted text-[13px] font-bold">{g.label}</h3>
                <ul aria-label={g.label}>
                  {g.rows.map((row) => (
                    <HoldingItem key={row.holding.id} row={row} />
                  ))}
                </ul>
              </div>
            ))}
            {noRate > 0 && (
              <p className="text-muted mt-3 text-sm font-semibold">
                {`${noRate} holding${noRate === 1 ? ' has' : 's have'} no exchange rate yet`}
              </p>
            )}
            {best && worst && (
              <p className="text-muted mt-3 text-[13.5px] font-bold tabular-nums">
                {`Best: ${best.holding.symbol} ${formatPercent(best.gainPct!, true)} · Worst: ${worst.holding.symbol} ${formatPercent(worst.gainPct!, true)}`}
              </p>
            )}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-2 -mb-1 inline-flex min-h-11 items-center gap-2 text-[15px] font-extrabold"
            >
              <Plus aria-hidden="true" className="size-[18px]" />
              Add a holding
            </button>
          </Section>
        </>
      )}
      <p className="text-muted pt-1 text-[12.5px] font-bold">
        Prices delayed · not financial advice
      </p>

      <HoldingDialog
        holding={adding ? null : undefined}
        onClose={() => setAdding(false)}
        onAdded={() => void refresh()}
      />
    </>
  );
}
