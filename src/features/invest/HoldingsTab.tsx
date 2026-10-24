import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Donut, DonutLegend } from '@/components/charts/Donut';
import { BADGE } from '@/components/charts/labelLayout';
import { Button } from '@/components/ui/Button';
import { CompanyLogo, LogoDisc } from '@/components/ui/CompanyLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { HelpTip } from '@/components/ui/HelpTip';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { Slice } from '@/domain/charts';
import type { Holding } from '@/domain/entities';
import {
  allocation,
  costPerShare,
  holdingPrice,
  TYPE_LABELS,
  type HoldingRow,
} from '@/domain/portfolio';
import { GlassTile, PlainSection, ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { formatPercent, sharesText } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useInvestMoney, useInvestPortfolio } from '@/store/useInvest';
import { arrow, tone } from './gain';
import { HoldingDialog } from './HoldingDialog';
import { ProfitAndLoss } from './ProfitAndLoss';
import { SoldList } from './SoldList';
import { useSliceColors } from './useSliceColors';

/** Stocks, then ETFs, then the rest: the order of the pie's choices and of the rows. */
const TYPES: Array<Holding['type']> = ['stock', 'etf', 'other'];

/** What the pie shows: all the holdings, or those of one type. */
type PieChoice = 'all' | Holding['type'];

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
    <li>
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
 * One pie of these holdings (by holding, the biggest five and the rest as Other), 200px wide with a
 * glass pill just outside each slice: the holding's logo as a round badge (its ticker on the slice's
 * colour until the logo loads), then its share. A slice takes its company's colour, sampled from the
 * logo, where that holds on the page; the legend is full width under the pie, every row starting
 * with its logo and showing its share. Other's mark is a grey +N, N holdings folded in.
 */
function PieBlock({ rows, label }: { rows: HoldingRow[]; label: string }) {
  const { formatConverted: money } = useInvestMoney();
  const [selected, setSelected] = useState<number | null>(null);
  const slices = useMemo(() => allocation(rows), [rows]);
  const whole = (minor: number) => money(minor, { whole: true });
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  const holdings = new Map(rows.map((r) => [r.holding.id, r.holding]));
  const { colors, report } = useSliceColors(slices, (key) => holdings.get(key)?.symbol);
  const folded =
    rows.filter((r) => r.value !== null).length - slices.filter((s) => s.key !== 'other').length;
  // The badge (on the pie) reports its logo's colour for the slice to take; the legend's logo does not.
  const logo = (slice: Slice, i: number, size: number, badge = false) => {
    const holding = holdings.get(slice.key);
    return holding ? (
      <CompanyLogo
        symbol={holding.symbol}
        name={holding.name}
        color={colors[i]!}
        size={size}
        badge={badge}
        onColor={badge ? (color) => report(slice.key, color) : undefined}
      />
    ) : (
      <LogoDisc color={colors[i]!} size={size} logo="other" badge={badge}>
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
          size={200}
          thickness={22}
          colors={colors}
          labelStyle="badge"
          outsideLabels={slices.map((slice, i) => ({
            key: slice.key,
            logo: logo(slice, i, BADGE.disc, true),
            text: `${Math.round((slice.amount / total) * 100)}%`,
          }))}
          formatAmount={(minor) => money(minor)}
          idle={{ value: whole(total), label }}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
      <div className="px-1">
        <DonutLegend
          slices={slices}
          showPercent
          logos={Object.fromEntries(slices.map((slice, i) => [slice.key, logo(slice, i, 24)]))}
          formatAmount={whole}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
    </div>
  );
}

/**
 * What the person holds: the portfolio's value and how it moved, and what the investments have made
 * in all, each in a glass tile; the pie of the holdings (All, or just Stocks, ETFs or Other, the
 * choice kept in `?pie=`) standing on the page with its Allocation control and its legend, no tile
 * behind them; then the holdings by type as plain rows, each opening its own page, and what was
 * sold. `refresh` fetches prices for a new holding.
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
        <div className="pt-[22px]">
          <GlassTile>
            <EmptyState
              title={sales ? 'No holdings right now' : 'No investments yet'}
              action={
                <Button onClick={() => setAdding(true)}>
                  {sales ? 'Add a holding' : 'Add your first holding'}
                </Button>
              }
            />
          </GlassTile>
        </div>
      ) : (
        <PlainSection
          title="Portfolio value"
          help={<HelpTip pageId="investments" label="portfolio value" />}
          action={
            <Button size="sm" aria-label="Add a holding" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Add
            </Button>
          }
        >
          <GlassTile>
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
          </GlassTile>
        </PlainSection>
      )}

      {(rows.length > 0 || sales) && <ProfitAndLoss />}

      {priced.length > 0 && (
        <div className="pt-[22px]">
          <SegmentedControl<PieChoice>
            label="Allocation"
            tone="glass"
            stretch
            value={choice?.type ?? 'all'}
            options={[
              { value: 'all', label: 'All' },
              ...priced.map((g) => ({ value: g.type, label: g.label })),
            ]}
            onChange={(value) => pick(value === 'all' ? null : value)}
            className="mb-4"
          />
          {/* Keyed by the choice, so a slice picked on one pie is not still picked on the next. */}
          <PieBlock
            key={choice?.type ?? 'all'}
            rows={choice ? choice.rows : rows}
            label={choice ? choice.label : 'All holdings'}
          />
        </div>
      )}

      {(rows.length > 0 || sales) && (
        <div className="pt-[22px]">
          {byType.map((g) => (
            <div key={g.type} className="mt-5 first:mt-0">
              <h3 className="text-muted mx-1 text-[13px] font-bold">{g.label}</h3>
              <ul aria-label={g.label} className={cn('px-1', ROWS)}>
                {g.rows.map((row) => (
                  <HoldingItem key={row.holding.id} row={row} />
                ))}
              </ul>
            </div>
          ))}
          {noRate > 0 && (
            <p className="text-muted mx-1 mt-3 text-sm font-semibold">
              {`${noRate} holding${noRate === 1 ? ' has' : 's have'} no exchange rate yet`}
            </p>
          )}
          {best && worst && (
            <p className="text-muted mx-1 mt-3 text-[13.5px] font-bold tabular-nums">
              {`Best: ${best.holding.symbol} ${formatPercent(best.gainPct!, true)} · Worst: ${worst.holding.symbol} ${formatPercent(worst.gainPct!, true)}`}
            </p>
          )}
          <SoldList />
        </div>
      )}
      <p className="text-muted mx-1 pt-5 text-[12.5px] font-bold">
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
