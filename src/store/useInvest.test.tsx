import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { emptySnapshot } from '@/domain/snapshot';
import { PlatformProvider } from '@/platform/PlatformProvider';
import { market, MarketError, type Market } from '@/services/market';
import { createStubStore } from '@/test/appStoreStub';
import { fakeAppLifecycle } from '@/test/fakeAppLifecycle';
import { makeHolding, makeProfile } from '@/test/fixtures';
import { AppStoreProvider } from './AppStoreProvider';
import { useInvestActions, useMarketRefresh, usePortfolio } from './useInvest';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const quote = (asOf: string) => ({ price: 100, previousClose: 98, fxRate: 1, asOf });

function setup(holdings = [makeHolding({ currency: 'EUR', quote: quote(minutesAgo(20)) })]) {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ currency: 'EUR' })];
  data.tables.holding = holdings;
  const store = createStubStore({ data });
  const native = fakeAppLifecycle();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PlatformProvider platform={native.platform}>
      <AppStoreProvider store={store}>{children}</AppStoreProvider>
    </PlatformProvider>
  );
  return { store, native, wrapper };
}

const answerWith = () =>
  Promise.resolve({
    quotes: [
      {
        symbol: 'KO',
        name: 'Coca-Cola',
        price: 101,
        previousClose: 100,
        currency: 'EUR',
        type: 'stock' as const,
        exchange: null,
        asOf: NOW.toISOString(),
      },
    ],
    missing: [],
  });

let fetchQuotes: MockInstance<Market['fetchQuotes']>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'test-token');
  fetchQuotes = vi.spyOn(market, 'fetchQuotes').mockImplementation(answerWith);
  vi.spyOn(market, 'fetchDividends').mockRejectedValue(new MarketError());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('usePortfolio', () => {
  it('keeps its value until the data changes', () => {
    const { store, wrapper } = setup();
    const { result, rerender } = renderHook(() => usePortfolio(), { wrapper });
    const first = result.current;
    expect(first.rows).toHaveLength(1);
    rerender();
    expect(result.current).toBe(first);
    act(() => store.setState({ data: { ...store.getState().data } }));
    expect(result.current).not.toBe(first);
  });
});

describe('useInvestActions', () => {
  it('stays the same object across renders', () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(() => useInvestActions(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('useMarketRefresh', () => {
  it('refreshes on mount when the newest price is older than 15 minutes', async () => {
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useMarketRefresh(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(fetchQuotes).toHaveBeenCalledOnce();
    expect(store.getState().putMany).toHaveBeenCalledOnce();
  });

  it('leaves fresh prices alone on mount', () => {
    const { wrapper } = setup([makeHolding({ quote: quote(minutesAgo(10)) })]);
    const { result } = renderHook(() => useMarketRefresh(), { wrapper });
    expect(fetchQuotes).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('judges by the newest quote of all the holdings', () => {
    const { wrapper } = setup([
      makeHolding({ symbol: 'KO', quote: quote(minutesAgo(600)) }),
      makeHolding({ symbol: 'SAP', quote: quote(minutesAgo(5)) }),
    ]);
    renderHook(() => useMarketRefresh(), { wrapper });
    expect(fetchQuotes).not.toHaveBeenCalled();
  });

  it('refreshes when the app comes back with stale prices, and not with fresh ones', async () => {
    const { store, native, wrapper } = setup([makeHolding({ quote: quote(minutesAgo(10)) })]);
    const { result } = renderHook(() => useMarketRefresh(), { wrapper });
    native.resume();
    expect(fetchQuotes).not.toHaveBeenCalled();

    vi.setSystemTime(new Date(NOW.getTime() + 6 * 60_000));
    native.resume();
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(fetchQuotes).toHaveBeenCalledOnce();
    expect(store.getState().putMany).toHaveBeenCalledOnce();
  });

  it('stops listening for the app coming back when it unmounts', () => {
    const { native, wrapper } = setup([makeHolding({ quote: quote(minutesAgo(10)) })]);
    const { unmount } = renderHook(() => useMarketRefresh(), { wrapper });
    const comeBack = native.queue('resume');
    unmount();
    vi.setSystemTime(new Date(NOW.getTime() + 6 * 60_000));
    comeBack();
    expect(fetchQuotes).not.toHaveBeenCalled();
  });

  it('refreshes on request even when prices are fresh, and shares a refresh under way', async () => {
    const { wrapper } = setup([makeHolding({ quote: quote(minutesAgo(1)) })]);
    const { result } = renderHook(() => useMarketRefresh(), { wrapper });
    await act(async () => {
      await Promise.all([result.current.refresh(), result.current.refresh()]);
    });
    expect(fetchQuotes).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('ok');
    await act(() => result.current.refresh());
    expect(fetchQuotes).toHaveBeenCalledTimes(2);
  });

  it('says so when there is no token, and asks nothing', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
    const { wrapper } = setup();
    const { result } = renderHook(() => useMarketRefresh(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('not configured'));
    expect(fetchQuotes).not.toHaveBeenCalled();
  });

  it('says so when the service cannot be reached, and settles', async () => {
    fetchQuotes.mockRejectedValue(new MarketError());
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useMarketRefresh(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(store.getState().putMany).not.toHaveBeenCalled();
  });
});
