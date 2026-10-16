import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Holding } from '@/domain/entities';
import { portfolio, type Portfolio } from '@/domain/portfolio';
import { usePlatform } from '@/platform/PlatformProvider';
import { market } from '@/services/market';
import { useApp, useAppStore } from './AppStoreProvider';
import { createInvestActions, type InvestActions, type RefreshResult } from './investActions';
import { useCurrency } from './useFinance';

/** Prices newer than this are not fetched again when the screen opens or the app comes back. */
const PRICES_FRESH_MS = 15 * 60_000;

export type MarketStatus = 'idle' | 'refreshing' | RefreshResult;

export function useInvestActions(): InvestActions {
  const store = useAppStore();
  return useMemo(() => createInvestActions(store, market), [store]);
}

export function usePortfolio(): Portfolio {
  const data = useApp((s) => s.data);
  const currency = useCurrency();
  return useMemo(() => portfolio(data, currency), [data, currency]);
}

/** True without any quote, or when the newest one is older than `PRICES_FRESH_MS`. */
function pricesStale(holdings: Holding[]): boolean {
  const newest = Math.max(0, ...holdings.map((h) => (h.quote ? Date.parse(h.quote.asOf) : 0)));
  return Date.now() - newest > PRICES_FRESH_MS;
}

/**
 * Refreshes prices when the screen opens and each time the app comes back, if the newest quote is
 * stale. `refresh` always asks, and a refresh already under way is shared, not repeated.
 */
export function useMarketRefresh(): { status: MarketStatus; refresh: () => Promise<void> } {
  const store = useAppStore();
  const platform = usePlatform();
  const actions = useInvestActions();
  const [status, setStatus] = useState<MarketStatus>('idle');
  const running = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    running.current ??= (async () => {
      setStatus('refreshing');
      setStatus(await actions.refreshMarket());
    })().finally(() => {
      running.current = null;
    });
    return running.current;
  }, [actions]);

  useEffect(() => {
    const refreshIfStale = () => {
      if (pricesStale(store.getState().data.tables.holding)) void refresh();
    };
    refreshIfStale();
    return platform.onResume(refreshIfStale);
  }, [platform, store, refresh]);

  return { status, refresh };
}
