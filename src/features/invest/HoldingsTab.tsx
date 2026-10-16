import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Donut, DonutLegend } from '@/components/charts/Donut';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Section } from '@/components/ui/Section';
import type { Holding } from '@/domain/entities';
import { allocation, holdingPrice, type HoldingRow } from '@/domain/portfolio';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';
import { useMoney } from '@/store/useFinance';
import { usePortfolio } from '@/store/useInvest';
import { HoldingDialog } from './HoldingDialog';

type By = 'holding' | 'type' | 'sector';

const GROUPS: Array<{ id: By; label: string }> = [
  { id: 'holding', label: 'By holding' },
  { id: 'type', label: 'By type' },
  { id: 'sector', label: 'By sector' },
];

const shareCount = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const sharesText = (n: number) => `${shareCount.format(n)} ${n === 1 ? 'share' : 'shares'}`;

const tone = (n: number) => (n < 0 ? 'text-danger' : 'text-accent-text');
const arrow = (n: number) => (n < 0 ? '▼' : '▲');

function HoldingItem({ row, onOpen }: { row: HoldingRow; onOpen(): void }) {
  const money = useMoney();
  const { holding, value, gainPct } = row;
  return (
    <li className="border-border border-t first:border-t-0">
      <button
        type="button"
        onClick={onOpen}
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
      </button>
    </li>
  );
}

/**
 * What the person holds: the portfolio's value and how it moved, its split by holding, type or
 * sector, and a row per holding that opens the editor. `refresh` fetches prices for a new holding.
 */
export function HoldingsTab({ refresh }: { refresh(): Promise<void> }) {
  const money = useMoney();
  const portfolio = usePortfolio();
  const [by, setBy] = useState<By>('holding');
  const [selected, setSelected] = useState<number | null>(null);
  // undefined = dialog closed, null = adding a new holding.
  const [editing, setEditing] = useState<Holding | null | undefined>(undefined);

  const { rows, value, dayChange, gainPct, best, worst } = portfolio;
  const slices = useMemo(() => allocation(rows, by), [rows, by]);
  const whole = (minor: number) => money(minor, { whole: true });
  // A day's move is only known for holdings with a quote that carries the previous close.
  const hasDay = rows.some((r) => r.dayChange !== null);
  // A holding with no price at all says "Not priced yet" on its row; only one with a price but no rate is counted here.
  const noRate = rows.filter((r) => r.value === null && holdingPrice(r.holding) !== null).length;

  const change = (n: number, text: string) => (
    <span className={tone(n)}>{`${arrow(n)} ${text}`}</span>
  );

  return (
    <>
      {rows.length === 0 ? (
        <Section>
          <EmptyState
            title="No investments yet"
            action={<Button onClick={() => setEditing(null)}>Add your first holding</Button>}
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
            {slices.length > 0 && (
              <>
                <div role="group" aria-label="Group by" className="mt-5 flex flex-wrap gap-2">
                  {GROUPS.map(({ id, label }) => {
                    const on = id === by;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setBy(id);
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
                <div className="mt-5 flex items-center gap-[18px]">
                  <Donut
                    slices={slices}
                    size={150}
                    thickness={18}
                    formatAmount={(minor) => money(minor)}
                    idle={{ value: whole(value), label: GROUPS.find((g) => g.id === by)!.label }}
                    selected={selected}
                    onSelect={setSelected}
                  />
                  <DonutLegend
                    slices={slices}
                    formatAmount={whole}
                    selected={selected}
                    onSelect={setSelected}
                  />
                </div>
              </>
            )}
          </Section>

          <Section>
            <ul aria-label="Holdings">
              {rows.map((row) => (
                <HoldingItem
                  key={row.holding.id}
                  row={row}
                  onOpen={() => setEditing(row.holding)}
                />
              ))}
            </ul>
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
              onClick={() => setEditing(null)}
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
        holding={editing}
        onClose={() => setEditing(undefined)}
        onAdded={() => void refresh()}
      />
    </>
  );
}
