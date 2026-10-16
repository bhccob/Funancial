import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDividends,
  fetchFx,
  fetchHistory,
  fetchNews,
  fetchProfile,
  fetchQuotes,
  fetchSearch,
  MarketError,
  marketConfigured,
} from './market';

const fetchMock = vi.fn();

function answer(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_FUNANCIAL_API_URL', 'https://prices.example');
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'secret');
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('market client', () => {
  it('is configured by a token alone', () => {
    expect(marketConfigured()).toBe(true);
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
    expect(marketConfigured()).toBe(false);
  });

  it('asks each route with the token, an upper-case query and a timeout', async () => {
    answer({ quotes: [], missing: [] });
    await fetchQuotes(['ko', 'sap.de']);
    answer({});
    await fetchProfile('ko');
    answer({});
    await fetchDividends('ko');
    answer({ items: [] });
    await fetchNews(['ko', 'msft']);
    answer({});
    await fetchFx('USD', 'EUR');
    answer({ results: [] });
    await fetchSearch('vusa etf');
    answer({ symbol: 'VUSA.AS', currency: 'EUR', points: [] });
    await fetchHistory('vusa.as', '2025-03-03');

    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls.map(([url]) => url)).toEqual([
      'https://prices.example/api/quote?symbols=KO%2CSAP.DE',
      'https://prices.example/api/profile?symbol=KO',
      'https://prices.example/api/dividends?symbol=KO',
      'https://prices.example/api/news?symbols=KO%2CMSFT',
      'https://prices.example/api/fx?from=USD&to=EUR',
      'https://prices.example/api/search?q=vusa+etf',
      'https://prices.example/api/history?symbol=VUSA.AS&from=2025-03-03',
    ]);
    for (const [, init] of calls) {
      expect(init.headers).toEqual({ 'X-Funancial-Token': 'secret' });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("asks the app's own origin when no address is set", async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_URL', '');
    answer({});
    await fetchFx('USD', 'EUR');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/fx?from=USD&to=EUR');
  });

  it('returns what the service answered', async () => {
    const body = {
      symbol: 'KO',
      name: 'Coca-Cola',
      type: 'stock',
      exchange: 'NYQ',
      currency: 'USD',
      sector: null,
    };
    answer(body);
    await expect(fetchProfile('KO')).resolves.toEqual(body);
  });

  it('returns the search results as the service sent them', async () => {
    const body = {
      results: [
        { symbol: 'VUSA.AS', name: 'Vanguard S&P 500', exchange: 'Amsterdam', type: 'etf' },
      ],
    };
    answer(body);
    await expect(fetchSearch('vusa')).resolves.toEqual(body);
  });

  it('returns the price history as the service sent it', async () => {
    const body = {
      symbol: 'VUSA.AS',
      currency: 'EUR',
      points: [{ date: '2025-03-03', close: 99.5 }],
    };
    answer(body);
    await expect(fetchHistory('VUSA.AS', '2025-03-03')).resolves.toEqual(body);
  });

  it('sends 26 symbols as two requests and joins the answers', async () => {
    const symbols = Array.from({ length: 26 }, (_, i) => `S${i}`);
    answer({ quotes: [{ symbol: 'S0' }], missing: ['S1'] });
    answer({ quotes: [{ symbol: 'S25' }], missing: [] });
    const result = await fetchQuotes(symbols);
    const asked = (fetchMock.mock.calls as Array<[string]>).map(([url]) =>
      new URL(url).searchParams.get('symbols')!.split(','),
    );
    expect(asked.map((s) => s.length)).toEqual([25, 1]);
    expect(result).toEqual({ quotes: [{ symbol: 'S0' }, { symbol: 'S25' }], missing: ['S1'] });
  });

  it('asks nothing for no symbols', async () => {
    await expect(fetchQuotes([])).resolves.toEqual({ quotes: [], missing: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no connection', () => fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))],
    ['a timeout', () => fetchMock.mockRejectedValueOnce(new DOMException('', 'TimeoutError'))],
    ['an error status', () => answer({ error: 'upstream' }, 502)],
    ['a refused token', () => answer({ error: 'unauthorized' }, 401)],
    ['an answer that is not JSON', () => fetchMock.mockResolvedValueOnce(new Response('<html>'))],
  ])('says it could not reach the service on %s', async (_what, fail) => {
    fail();
    const error = await fetchFx('USD', 'EUR').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MarketError);
    expect((error as Error).message).toBe("Couldn't reach the price service.");
  });
});
