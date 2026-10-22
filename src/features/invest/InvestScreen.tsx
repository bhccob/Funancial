import { RefreshCw } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { marketConfigured } from '@/services/market';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency } from '@/store/useFinance';
import { useInvestMoney, useMarketRefresh } from '@/store/useInvest';
import { DividendsTab } from './DividendsTab';
import { HoldingsTab } from './HoldingsTab';
import { InvestCurrencySheet } from './InvestCurrencySheet';
import { NewsTab } from './NewsTab';

const TABS = [
  { id: 'holdings', label: 'Holdings' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'news', label: 'News' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const NOT_CONFIGURED = 'Live prices need the price service. Showing your last prices.';
const UNREACHABLE = "Couldn't reach the price service. Showing your last prices.";

/**
 * Invest: holdings, dividends and news under one title, the tab kept in `?tab=`. The tabs are one
 * glass track with the chosen tab lifted onto it, as a SegmentedControl on glass draws its options.
 */
export function InvestScreen() {
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'holdings';
  const { status, refresh } = useMarketRefresh();
  const holdings = useApp((s) => s.data.tables.holding);
  const profile = useCurrency();
  const stored = useApp((s) => s.data.tables.settings[0]?.investCurrency);
  const chosen = stored ?? profile;
  const { currency } = useInvestMoney();
  const [picking, setPicking] = useState(false);
  const ids = useId();

  const newest = Math.max(0, ...holdings.map((h) => (h.quote ? Date.parse(h.quote.asOf) : 0)));
  // Said only where there are prices to be old or missing.
  const note =
    holdings.length === 0
      ? null
      : !marketConfigured()
        ? NOT_CONFIGURED
        : status === 'failed'
          ? UNREACHABLE
          : null;
  const lines = [
    newest > 0 && `as of ${formatDateTime(new Date(newest).toISOString())}`,
    note,
    // A currency was chosen but there is no rate to convert at yet.
    chosen !== currency && `Showing ${profile} until a ${chosen} rate loads.`,
  ].filter((line): line is string => Boolean(line));

  function choose(id: TabId) {
    // Same screen: the page stays where it is.
    setParams(id === 'holdings' ? {} : { tab: id }, { replace: true, preventScrollReset: true });
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[e.key];
    if (!step) return;
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + step + TABS.length) % TABS.length]!;
    choose(next.id);
    document.getElementById(`${ids}-${next.id}`)?.focus();
  }

  return (
    <div>
      <PageHeader
        title="Invest"
        // Without the price service no rate can load, so there is nothing to choose; a currency
        // already chosen keeps its chip, as the way back.
        action={
          (marketConfigured() || stored) && (
            <Button
              size="sm"
              variant="glass"
              aria-haspopup="dialog"
              onClick={() => setPicking(true)}
            >
              <span>
                {`Shown in ${currency} `}
                <span aria-hidden>▾</span>
              </span>
            </Button>
          )
        }
      />
      {/* Under the header, not in it, so a long line never pushes the currency off the title's row. */}
      <div className="text-muted -mt-1 text-sm font-semibold">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <Button
          size="sm"
          variant="glass"
          className="mt-1"
          disabled={status === 'refreshing'}
          onClick={() => void refresh()}
        >
          <RefreshCw
            aria-hidden
            className={cn('size-4', status === 'refreshing' && 'motion-safe:animate-spin')}
          />
          Refresh
        </Button>
      </div>

      <InvestCurrencySheet open={picking} onClose={() => setPicking(false)} />

      <div
        role="tablist"
        aria-label="Invest"
        onKeyDown={onKeyDown}
        className="glass mt-3 flex gap-0.5 rounded-full p-1"
      >
        {TABS.map(({ id, label }) => {
          const on = id === tab;
          return (
            <button
              key={id}
              id={`${ids}-${id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${ids}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(id)}
              className={cn(
                'press min-h-11 min-w-11 flex-1 rounded-full px-3 text-[14px] font-extrabold select-none',
                'motion-safe:ease-glass motion-safe:transition-[transform,color,background-color] motion-safe:duration-(--duration-press)',
                // The same lifted pill as a SegmentedControl on glass.
                on ? 'bg-surface text-text shadow-[0_2px_8px_-4px_rgb(0_0_0/0.3)]' : 'text-muted',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-${tab}`}>
        {tab === 'holdings' ? (
          <HoldingsTab refresh={refresh} />
        ) : tab === 'dividends' ? (
          <DividendsTab />
        ) : (
          <NewsTab />
        )}
      </div>
    </div>
  );
}
