import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Holding } from '@/domain/entities';
import { convertMinor, formatMoney, type MoneyFormatOptions } from '@/domain/money';
import { investRate, portfolio, type Portfolio } from '@/domain/portfolio';
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

/**
 * What Invest shows money in. `format` takes minor units of the profile currency and writes them in
 * `currency`: the one chosen for Invest, converted at its rate. Without a rate yet it writes the
 * profile currency, and `currency` says so. Either way the amount is rounded once, so a chart's
 * fractional minor units can be passed as they are.
 */
export function useInvestMoney(): {
  currency: string;
  format(minorInProfile: number, opts?: MoneyFormatOptions): string;
} {
  const profile = useCurrency();
  const settings = useApp((s) => s.data.tables.settings[0]);
  const rate = investRate(settings, profile);
  const currency = (rate !== null && settings?.investCurrency) || profile;
  return useMemo(
    () => ({
      currency,
      format: (minor, opts) =>
        formatMoney(
          rate === null ? Math.round(minor) : convertMinor(minor, profile, currency, rate),
          currency,
          undefined,
          opts,
        ),
    }),
    [profile, currency, rate],
  );
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
      const { data } = store.getState();
      const home = data.tables.profile[0]?.currency ?? 'USD';
      const settings = data.tables.settings[0];
      // A chosen currency with no rate is worth asking for again, whatever the age of the prices.
      const noRate =
        !!settings?.investCurrency &&
        settings.investCurrency !== home &&
        investRate(settings, home) === null;
      if (noRate || pricesStale(data.tables.holding)) void refresh();
    };
    refreshIfStale();
    return platform.onResume(refreshIfStale);
  }, [platform, store, refresh]);

  return { status, refresh };
}
