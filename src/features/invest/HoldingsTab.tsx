import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { sliceColors } from '@/components/charts/colors';
import { Donut, DonutLegend } from '@/components/charts/Donut';
import { Button } from '@/components/ui/Button';
import { CompanyLogo, LogoDisc } from '@/components/ui/CompanyLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { HelpTip } from '@/components/ui/HelpTip';
import { Section } from '@/components/ui/Section';
import { underlineTab } from '@/components/ui/underlineTab';
import type { Slice } from '@/domain/charts';
import type { Holding } from '@/domain/entities';
import {
  allocation,
  costPerShare,
  holdingPrice,
  TYPE_LABELS,
  type HoldingRow,
} from '@/domain/portfolio';
import { cn } from '@/lib/cn';
import { formatPercent, sharesText } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useInvestMoney, useInvestPortfolio } from '@/store/useInvest';
import { arrow, tone } from './gain';
import { HoldingDialog } from './HoldingDialog';
import { ProfitAndLoss } from './ProfitAndLoss';
import { SoldList } from './SoldList';

/** Stocks, then ETFs, then the rest: the order of the pie's choices and of the rows. */
const TYPES: Array<Holding['type']> = ['stock', 'etf', 'other'];

/** What `?pie=` says for each type; All has none. */
const PIE_PARAMS: Record<Holding['type'], string> = {
  stock: 'stocks',
  etf: 'etfs',
  other: 'other',
};

function HoldingItem({ row }: { row: HoldingRow }) {
  const { format, formatConverted: money } = useInvestMoney();
  const { holding, value, gainPct } = row;
  return (
    <li className="border-border border-t first:border-t-0">
      <Link
        to={`/invest/holding/${holding.id}`}
        className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left"
      >
        <CompanyLogo
          symbol={holding.symbol}
          name={holding.name}
          color="var(--color-border-strong)"
          size={28}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-extrabold">
            {holding.symbol} · {holding.name}
          </span>
          <span className="text-muted text-[13px] font-semibold">
            {`${sharesText(holding.shares)} · break-even ${format(costPerShare(holding))}`}
          </span>
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
 * One pie of these holdings (by holding, the biggest five and the rest as Other), 220px wide with
 * each holding's logo and share just outside its slice, and its legend full width under it, every
 * row starting with its logo and showing its share. Other's logo is a grey +N, N holdings folded in.
 */
function PieBlock({ rows, label }: { rows: HoldingRow[]; label: string }) {
  const { formatConverted: money } = useInvestMoney();
  const [selected, setSelected] = useState<number | null>(null);
  const slices = useMemo(() => allocation(rows), [rows]);
  const whole = (minor: number) => money(minor, { whole: true });
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  const colors = sliceColors(slices);
  const holdings = new Map(rows.map((r) => [r.holding.id, r.holding]));
  const folded =
    rows.filter((r) => r.value !== null).length - slices.filter((s) => s.key !== 'other').length;
  const logo = (slice: Slice, i: number, size: number) => {
    const holding = holdings.get(slice.key);
    return holding ? (
      <CompanyLogo symbol={holding.symbol} name={holding.name} color={colors[i]!} size={size} />
    ) : (
      <LogoDisc color={colors[i]!} size={size} logo="other">
        {`+${folded}`}
      </LogoDisc>
    );
  };

  return (
    <div role="group" aria-label={label}>
      <div className="flex justify-center">
        <Donut
          label="Value by holding"
          slices={slices}
          size={220}
          thickness={22}
          outsideLabels={slices.map((slice, i) => ({
            key: slice.key,
            logo: logo(slice, i, 20),
            text: `${Math.round((slice.amount / total) * 100)}%`,
          }))}
          formatAmount={(minor) => money(minor)}
          idle={{ value: whole(total), label }}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
      <DonutLegend
        slices={slices}
        showPercent
        logos={Object.fromEntries(slices.map((slice, i) => [slice.key, logo(slice, i, 24)]))}
        formatAmount={whole}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}

/**
 * What the person holds: the portfolio's value and how it moved, what the investments have made in
 * all, one pie of the holdings (All, or just Stocks, ETFs or Other, the choice kept in `?pie=`), the
 * holdings by type, each opening its own page, and what was sold. `refresh` fetches prices for a
 * new holding.
 */
export function HoldingsTab({ refresh }: { refresh(): Promise<void> }) {
  // The portfolio is converted row by row, so what is written here adds up on the screen.
  const { formatConverted: money } = useInvestMoney();
  const portfolio = useInvestPortfolio();
  const sales = useApp((s) => s.data.tables.sale.length > 0);
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);

  const { rows, value, dayChange, gainPct, best, worst } = portfolio;
  const byType = TYPES.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    rows: rows.filter((r) => r.holding.type === type),
  })).filter((g) => g.rows.length > 0);
  // A type that has nothing priced has no choice; its holdings still list below, saying what is missing.
  const priced = byType.filter((g) => g.rows.some((r) => r.value !== null));
  const choice = priced.find((g) => PIE_PARAMS[g.type] === params.get('pie'));
  // A day's move is only known for holdings with a quote that carries the previous close.
  const hasDay = rows.some((r) => r.dayChange !== null);
  // A holding with no price at all says "Not priced yet" on its row; only one with a price but no rate is counted here.
  const noRate = rows.filter((r) => r.value === null && holdingPrice(r.holding) !== null).length;

  const change = (n: number, text: string) => (
    <span className={tone(n)}>{`${arrow(n)} ${text}`}</span>
  );

  function pick(type: Holding['type'] | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (type) next.set('pie', PIE_PARAMS[type]);
        else next.delete('pie');
        return next;
      },
      // Same screen: the page stays where it is, so the pie that changes stays in view.
      { replace: true, preventScrollReset: true },
    );
  }

  return (
    <>
      {rows.length === 0 ? (
        <Section>
          <EmptyState
            title={sales ? 'No holdings right now' : 'No investments yet'}
            action={
              <Button onClick={() => setAdding(true)}>
                {sales ? 'Add a holding' : 'Add your first holding'}
              </Button>
            }
          />
        </Section>
      ) : (
        <Section
          title="Portfolio value"
          help={<HelpTip pageId="investments" label="portfolio value" />}
          action={
            <Button
              size="sm"
              aria-label="Add a holding"
              className="-my-3"
              onClick={() => setAdding(true)}
            >
              <Plus aria-hidden="true" className="size-4" />
              Add
            </Button>
          }
        >
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
        </Section>
      )}

      {(rows.length > 0 || sales) && <ProfitAndLoss />}

      {priced.length > 0 && (
        <Section>
          <div role="group" aria-label="Allocation" className="-mt-2 mb-2 flex flex-wrap gap-x-5">
            {[{ type: null, label: 'All' }, ...priced].map((g) => {
              const on = g.type === (choice?.type ?? null);
              return (
                <button
                  key={g.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(g.type)}
                  className={underlineTab(on)}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
          {/* Keyed by the choice, so a slice picked on one pie is not still picked on the next. */}
          <PieBlock
            key={choice?.type ?? 'all'}
            rows={choice ? choice.rows : rows}
            label={choice ? choice.label : 'All holdings'}
          />
        </Section>
      )}

      {(rows.length > 0 || sales) && (
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
          <SoldList />
        </Section>
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
