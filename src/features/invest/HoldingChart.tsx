import { useEffect, useState } from 'react';
import { PriceLine } from '@/components/charts/PriceLine';
import type { LocalDate } from '@/domain/dates';
import { addMonths } from '@/domain/dividends';
import type { Holding } from '@/domain/entities';
import { minorDigits } from '@/domain/money';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { marketConfigured, type HistoryResponse } from '@/services/market';
import { useCurrency } from '@/store/useFinance';
import { useInvestMoney } from '@/store/useInvest';
import { loadHistory } from './historyCache';

const RANGES = [
  { label: 'Since you bought', months: null },
  { label: '1Y', months: 12 },
  { label: '6M', months: 6 },
  { label: '1M', months: 1 },
] as const;

const NEEDS_SERVICE = 'The chart needs the price service.';
const FAILED = "Couldn't load the chart right now.";
const NOT_ENOUGH = 'Not enough price history yet.';

/**
 * A holding's price over a range, in the currency Invest is shown in, with a dashed line at what
 * was paid per share. `rate` turns the holding's currency into the profile's; without one there is
 * no chart.
 */
export function HoldingChart({
  holding,
  rate,
  today,
}: {
  holding: Holding;
  rate: number | null;
  today: LocalDate;
}) {
  const { format: money } = useInvestMoney();
  const currency = useCurrency();
  const configured = marketConfigured();
  const [range, setRange] = useState(0);
  // `history` null: the request failed. Keyed, so an answer for another range is not read as this one's.
  const [result, setResult] = useState<{ key: string; history: HistoryResponse | null } | null>(
    null,
  );

  const months = RANGES[range]!.months;
  // The price service takes a day to start from; a range never reaches back before the purchase.
  const reach = months === null ? holding.purchaseDate : addMonths(today, -months);
  const from = reach < holding.purchaseDate ? holding.purchaseDate : reach;
  const key = `${holding.symbol} ${from}`;
  // Bought today: there is a single close at most, so the service is not asked.
  const tooSoon = from >= today;
  const asks = configured && rate !== null && !tooSoon;

  useEffect(() => {
    if (!asks) return;
    let current = true;
    loadHistory(holding.symbol, from).then(
      (history) => current && setResult({ key, history }),
      () => current && setResult({ key, history: null }),
    );
    return () => {
      current = false;
    };
  }, [asks, holding.symbol, from, key]);

  if (rate === null) return null;

  const loaded = result?.key === key ? result : null;
  // Closes in another currency than the holding's would be converted at the wrong rate.
  const history = loaded?.history?.currency === holding.currency ? loaded.history : null;

  let body;
  if (!configured) body = <p className="text-muted font-semibold">{NEEDS_SERVICE}</p>;
  else if (tooSoon || (history && history.points.length < 2))
    body = <p className="text-muted font-semibold">{NOT_ENOUGH}</p>;
  else if (!loaded) body = <p className="text-muted font-semibold">Loading chart…</p>;
  else if (!history) body = <p className="text-muted font-semibold">{FAILED}</p>;
  else {
    // shortcut: every close is shown at today's exchange rate, not the rate of its day, so a
    // holding in another currency has its currency's moves left out; upgrade by fetching a rate
    // history if the gap matters.
    const scale = rate * 10 ** minorDigits(currency);
    const points = history.points.map((p) => ({ date: p.date, value: p.close * scale }));
    const [first, last] = [points[0]!, points.at(-1)!];
    // Not rounded here: the formatter rounds once, after converting to the currency Invest shows.
    const price = (value: number) => money(value);
    body = (
      <PriceLine
        points={points}
        paid={holding.costBasis / holding.shares}
        // The shorter ranges fit their own closes; the paid line shows when it falls among them.
        scaleToPaid={range === 0}
        formatValue={price}
        formatDate={formatDate}
        label={`From ${price(first.value)} on ${formatDate(first.date)} to ${price(last.value)} ${
          last.date === today ? 'today' : `on ${formatDate(last.date)}`
        }`}
      />
    );
  }

  return (
    <>
      {configured && (
        <div role="group" aria-label="Chart range" className="mt-5 flex flex-wrap gap-2">
          {RANGES.map(({ label }, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={i === range}
              onClick={() => setRange(i)}
              className={cn(
                'h-11 rounded-full px-4 text-sm font-bold motion-safe:transition-colors',
                i === range ? 'bg-primary text-primary-contrast' : 'bg-surface-2 text-text',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {/* As tall as the chart, so the page does not jump while another range loads. */}
      <div className={cn('mt-4', asks && 'min-h-46')}>{body}</div>
    </>
  );
}
