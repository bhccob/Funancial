import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Settings } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { emptySnapshot } from '@/domain/snapshot';
import { PlatformProvider } from '@/platform/PlatformProvider';
import { market, MarketError, type Market } from '@/services/market';
import { createStubStore } from '@/test/appStoreStub';
import { fakeAppLifecycle } from '@/test/fakeAppLifecycle';
import { makeHolding, makeProfile, makeSettings } from '@/test/fixtures';
import { AppStoreProvider } from './AppStoreProvider';
import { useAmountsHidden } from './useAmountsHidden';
import {
  useInvestActions,
  useInvestMoney,
  useInvestPortfolio,
  useMarketRefresh,
  usePortfolio,
} from './useInvest';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const quote = (asOf: string) => ({ price: 100, previousClose: 98, fxRate: 1, asOf });

function setup(
  holdings = [makeHolding({ currency: 'EUR', quote: quote(minutesAgo(20)) })],
  settings: Partial<Settings> | null = null,
) {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ currency: 'EUR' })];
  data.tables.holding = holdings;
  if (settings) data.tables.settings = [makeSettings(settings)];
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
  useAmountsHidden.setState({ hidden: false });
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

const dollars = { currency: 'USD', rate: 1.1, asOf: minutesAgo(5) };

describe('useInvestMoney', () => {
  const render = (settings: Partial<Settings> | null) => {
    const { wrapper } = setup(undefined, settings);
    return renderHook(() => useInvestMoney(), { wrapper });
  };

  it('writes profile-currency minor units in the currency chosen, converted at its rate', () => {
    const { result } = render({ investCurrency: 'USD', investFx: dollars });
    expect(result.current.currency).toBe('USD');
    expect(result.current.format(100_00)).toBe(formatMoney(110_00, 'USD'));
    expect(result.current.format(-100_00)).toBe(formatMoney(-110_00, 'USD'));
    expect(result.current.format(1_234_00, { whole: true })).toBe(
      formatMoney(1_357_40, 'USD', undefined, { whole: true }),
    );
    expect(result.current.format(10_00, { signDisplay: 'always' })).toBe(
      formatMoney(11_00, 'USD', undefined, { signDisplay: 'always' }),
    );
  });

  it('follows the decimals of the currency chosen', () => {
    const { result } = render({
      investCurrency: 'JPY',
      investFx: { currency: 'JPY', rate: 160, asOf: dollars.asOf },
    });
    expect(result.current.currency).toBe('JPY');
    expect(result.current.format(12_34)).toBe(formatMoney(1974, 'JPY'));
  });

  it('writes the profile currency, and says so, until the chosen currency has a rate', () => {
    for (const investFx of [null, { ...dollars, currency: 'GBP' }]) {
      const { result } = render({ investCurrency: 'USD', investFx });
      expect(result.current.currency).toBe('EUR');
      expect(result.current.format(100_00)).toBe(formatMoney(100_00, 'EUR'));
    }
  });

  it('writes the profile currency when none was chosen, or the profile currency itself', () => {
    for (const settings of [null, {}, { investCurrency: 'EUR' }, { investFx: dollars }]) {
      const { result } = render(settings);
      expect(result.current.currency).toBe('EUR');
      expect(result.current.format(100_00)).toBe(formatMoney(100_00, 'EUR'));
    }
  });

  it('rounds a fractional amount once, as a chart hands it over', () => {
    const { result } = render(null);
    expect(result.current.format(10_00.6)).toBe(formatMoney(10_01, 'EUR'));
    const dollar = render({ investCurrency: 'USD', investFx: dollars });
    expect(dollar.result.current.format(10_00.5)).toBe(formatMoney(11_01, 'USD'));
  });

  it('converts minor units on their own, for amounts to be added up before they are shown', () => {
    const { result } = render({ investCurrency: 'USD', investFx: dollars });
    expect(result.current.convert(100_00)).toBe(110_00);
    expect(result.current.convert(-100_00)).toBe(-110_00);
    // Written without converting again.
    expect(result.current.formatConverted(110_00)).toBe(formatMoney(110_00, 'USD'));
    expect(result.current.formatConverted(1_234_00, { whole: true })).toBe(
      formatMoney(1_234_00, 'USD', undefined, { whole: true }),
    );
    // Writing a converted amount is the same as converting and writing in one go.
    expect(result.current.formatConverted(result.current.convert(7_77))).toBe(
      result.current.format(7_77),
    );
  });

  it('converts and rounds an exact half by one rule, with a rate and without', () => {
    const rated = render({
      investCurrency: 'USD',
      investFx: { ...dollars, rate: 1.5 },
    });
    // The rule is Math.round: -22.5 is -22 and 22.5 is 23.
    expect(rated.result.current.convert(15)).toBe(Math.round(22.5));
    expect(rated.result.current.convert(-15)).toBe(Math.round(-22.5));
    expect(rated.result.current.format(-15)).toBe(formatMoney(-22, 'USD'));

    const plain = render(null);
    expect(plain.result.current.convert(-2.5)).toBe(Math.round(-2.5));
    expect(plain.result.current.convert(2.5)).toBe(Math.round(2.5));
    expect(plain.result.current.format(-2.5)).toBe(formatMoney(-2, 'EUR'));
  });

  it('writes every amount as four bullets while amounts are hidden, converted or not', () => {
    const { result } = render({ investCurrency: 'USD', investFx: dollars });
    act(() => useAmountsHidden.setState({ hidden: true }));
    expect(result.current.format(100_00)).toBe('••••');
    expect(result.current.format(100_00, { whole: true })).toBe('••••');
    expect(result.current.formatConverted(110_00)).toBe('••••');
    // Converting is arithmetic, not display: the sums it feeds are unchanged.
    expect(result.current.convert(100_00)).toBe(110_00);
    act(() => useAmountsHidden.setState({ hidden: false }));
    expect(result.current.format(100_00)).toBe(formatMoney(110_00, 'USD'));
  });

  it('keeps its value until what it depends on changes', () => {
    const { wrapper } = setup(undefined, { investCurrency: 'USD', investFx: dollars });
    const { result, rerender } = renderHook(() => useInvestMoney(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
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

  it('asks again when a currency is chosen for Invest but has no rate, whatever the age of the prices', async () => {
    const fetchFx = vi
      .spyOn(market, 'fetchFx')
      .mockResolvedValue({ from: 'EUR', to: 'USD', rate: 1.1, asOf: NOW.toISOString() });
    const { wrapper } = setup([makeHolding({ quote: quote(minutesAgo(1)) })], {
      investCurrency: 'USD',
    });
    const { result } = renderHook(() => useMarketRefresh(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(fetchFx).toHaveBeenCalledWith('EUR', 'USD');
  });

  it('leaves fresh prices alone when the rate for the chosen currency is there', () => {
    const { wrapper } = setup([makeHolding({ quote: quote(minutesAgo(1)) })], {
      investCurrency: 'USD',
      investFx: dollars,
    });
    renderHook(() => useMarketRefresh(), { wrapper });
    expect(fetchQuotes).not.toHaveBeenCalled();
  });

  it('asks again when a quoted holding in another currency has no rate, whatever the age of the prices', async () => {
    const lost = { ...quote(minutesAgo(1)), fxRate: null };
    const { wrapper } = setup([makeHolding({ currency: 'USD', quote: lost })]);
    const { result } = renderHook(() => useMarketRefresh(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(fetchQuotes).toHaveBeenCalledOnce();
  });

  it('leaves fresh prices alone when the foreign holding has its rate, or no quote to convert', () => {
    const { wrapper } = setup([
      makeHolding({
        symbol: 'KO',
        currency: 'USD',
        quote: { ...quote(minutesAgo(1)), fxRate: 0.9 },
      }),
      makeHolding({ symbol: 'SAP', currency: 'USD', manualPrice: 5, quote: null }),
      makeHolding({ symbol: 'NESN', currency: 'EUR', quote: quote(minutesAgo(1)) }),
    ]);
    renderHook(() => useMarketRefresh(), { wrapper });
    expect(fetchQuotes).not.toHaveBeenCalled();
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

describe('useInvestPortfolio', () => {
  /** Two holdings each worth EUR 600.04 and costing EUR 500.05. */
  const twins = ['A', 'B'].map((id) =>
    makeHolding({
      id,
      symbol: id,
      currency: 'EUR',
      shares: 1,
      costBasis: 500_05,
      quote: { price: 600.04, previousClose: 590.01, fxRate: 1, asOf: minutesAgo(1) },
    }),
  );

  it('shows rows converted once, with totals that are the sums of those rows', () => {
    const { wrapper } = setup(twins, { investCurrency: 'USD', investFx: dollars });
    const { result } = renderHook(() => useInvestPortfolio(), { wrapper });
    const { rows, value, cost, gain, dayChange } = result.current;
    expect(rows.map((r) => r.value)).toEqual([66_004, 66_004]);
    expect(value).toBe(132_008);
    expect(cost).toBe(110_012);
    expect(gain).toBe(value - cost);
    expect(dayChange).toBe(2_206);
  });

  it('is the portfolio itself, in the profile currency, until the rate has loaded', () => {
    const { wrapper } = setup(twins, { investCurrency: 'USD', investFx: null });
    const { result } = renderHook(() => ({ shown: useInvestPortfolio(), own: usePortfolio() }), {
      wrapper,
    });
    expect(result.current.shown).toEqual(result.current.own);
  });

  it('keeps its value until the data or the rate changes', () => {
    const { wrapper } = setup(twins, { investCurrency: 'USD', investFx: dollars });
    const { result, rerender } = renderHook(() => useInvestPortfolio(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
