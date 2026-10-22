import { useId, useMemo, useState } from 'react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { spendSeries, type SpendRange } from '@/domain/cardSpend';
import type { Account } from '@/domain/entities';
import { cn } from '@/lib/cn';
import { formatDay, formatMonthYear } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { useMoney, useToday } from '@/store/useFinance';

const RANGES: { value: SpendRange; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

/** What the change is measured against, after the percent. */
const AGAINST: Record<SpendRange, string> = {
  day: 'vs the 14 days before',
  month: 'vs last month',
  year: 'vs last year',
};

/** The bars' name for a screen reader, which reads each bar's period and amount. */
const BARS: Record<SpendRange, string> = {
  day: 'Spent per day',
  month: 'Spent per month',
  year: 'Spent per year',
};

/** A bar's period, as a screen reader says it: "Oct 14", "October 2026", "2026". */
function periodName(range: SpendRange, key: string): string {
  if (range === 'day') return formatDay(key);
  if (range === 'month') return formatMonthYear(key);
  return key;
}

/** +3.04%, −12.50% (a true minus), 0.00%: the change to two decimals, as spendSeries rounds it. */
function signedPercent(change: number): string {
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';
  return `${sign}${Math.abs(change).toFixed(2)}%`;
}

/**
 * The tallest bar's share of the box, so the tag over it stays inside: the bars are drawn from the
 * bottom, and the tag sits 5px above the tallest.
 */
const TALLEST = 76;
const SHORTEST_PX = 4;

/**
 * What one account spent, in a glass box: the headline for the range (the last 14 days, this month
 * or this year so far) with how it compares, a Day / Month / Year switch, and the bars, oldest first,
 * the highest in the accent with its amount over it. Spending going up reads in the danger color and
 * going down in the success color. While amounts are hidden the bars are all as short as can be, as
 * their lengths would give the amounts away.
 */
export function SpendChart({ account }: { account: Account }) {
  const data = useApp((s) => s.data);
  const today = useToday();
  const money = useMoney();
  const hidden = useAmountsHidden((s) => s.hidden);
  const [range, setRange] = useState<SpendRange>('month');
  const headingId = useId();
  const series = useMemo(
    () => spendSeries(data, account.id, range, today),
    [data, account.id, range, today],
  );
  const highest = Math.max(0, ...series.bars.map((b) => b.amount));
  const top = hidden || highest === 0 ? -1 : series.bars.findIndex((b) => b.amount === highest);
  const last = series.bars.length - 1;

  return (
    <section aria-labelledby={headingId} className="glass rounded-[24px] p-4">
      <h2 id={headingId} className="sr-only">
        Spending
      </h2>
      <div className="flex flex-wrap items-end justify-between gap-2.5">
        <div className="min-w-0">
          <p className="text-muted text-[12px] font-bold">{series.label}</p>
          <p
            data-testid="spend-total"
            className="text-[24px] leading-tight font-extrabold tracking-[-0.03em] whitespace-nowrap tabular-nums"
          >
            {money(series.total)}
          </p>
          {series.change !== null && (
            <p data-testid="spend-change" className="text-[12px] font-extrabold">
              <span
                className={cn(
                  series.change > 0
                    ? 'text-danger'
                    : series.change < 0
                      ? 'text-success'
                      : 'text-muted',
                )}
              >
                {signedPercent(series.change)}
              </span>{' '}
              <span className="text-muted font-bold">{AGAINST[range]}</span>
            </p>
          )}
        </div>
        <SegmentedControl<SpendRange>
          label="Period"
          tone="glass"
          // On the right, under the headline when the two don't fit side by side.
          className="ml-auto"
          value={range}
          options={RANGES}
          onChange={setRange}
        />
      </div>
      <ul aria-label={BARS[range]} className="mt-3.5 flex h-[100px] items-end gap-[5px]">
        {series.bars.map((bar, i) => {
          const share = hidden || highest === 0 ? 0 : (bar.amount / highest) * TALLEST;
          return (
            <li key={bar.key} className="flex h-full min-w-0 flex-1 items-end">
              <span
                aria-hidden="true"
                style={{ height: `max(${SHORTEST_PX}px, ${share}%)` }}
                className={cn(
                  'relative block w-full rounded-md',
                  i === top ? 'bg-accent' : 'bg-muted/75',
                )}
              >
                {i === top && (
                  <span
                    data-testid="spend-top"
                    className={cn(
                      'bg-primary text-primary-contrast absolute bottom-[calc(100%+5px)] rounded-md px-1.5 py-0.5 text-[10px] font-extrabold whitespace-nowrap',
                      i === 0 ? 'left-0' : i === last ? 'right-0' : 'left-1/2 -translate-x-1/2',
                    )}
                  >
                    {money(bar.amount, { whole: true })}
                  </span>
                )}
              </span>
              <span className="sr-only">{`${periodName(range, bar.key)}: ${money(bar.amount)}`}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
