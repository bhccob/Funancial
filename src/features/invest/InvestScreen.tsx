import { RefreshCw } from 'lucide-react';
import { useId, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { marketConfigured } from '@/services/market';
import { useApp } from '@/store/AppStoreProvider';
import { useMarketRefresh } from '@/store/useInvest';
import { DividendsTab } from './DividendsTab';
import { HoldingsTab } from './HoldingsTab';
import { NewsTab } from './NewsTab';

const TABS = [
  { id: 'holdings', label: 'Holdings' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'news', label: 'News' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const NOT_CONFIGURED = 'Live prices need the price service. Showing your last prices.';
const UNREACHABLE = "Couldn't reach the price service. Showing your last prices.";

/** Invest: holdings, dividends and news under one title, the tab kept in `?tab=`. */
export function InvestScreen() {
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'holdings';
  const { status, refresh } = useMarketRefresh();
  const holdings = useApp((s) => s.data.tables.holding);
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
  ].filter((line): line is string => Boolean(line));

  function choose(id: TabId) {
    setParams(id === 'holdings' ? {} : { tab: id }, { replace: true });
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
        action={
          <Button
            size="sm"
            variant="secondary"
            disabled={status === 'refreshing'}
            onClick={() => void refresh()}
          >
            <RefreshCw
              aria-hidden
              className={cn('size-4', status === 'refreshing' && 'motion-safe:animate-spin')}
            />
            Refresh
          </Button>
        }
      >
        {lines.length > 0 && lines.map((line) => <p key={line}>{line}</p>)}
      </PageHeader>

      <div
        role="tablist"
        aria-label="Invest"
        onKeyDown={onKeyDown}
        className="border-border mt-3 flex gap-6 border-b"
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
                '-mb-px min-h-11 min-w-11 border-b-2 px-0.5 text-[15px] font-extrabold',
                on ? 'border-text text-text' : 'text-muted border-transparent',
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
