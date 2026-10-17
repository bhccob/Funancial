import { lookup } from 'node:dns/promises';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { GET as dividendsGET } from '../dividends.js';
import { GET as extractGET } from '../extract.js';
import { GET as fxGET } from '../fx.js';
import { GET as historyGET } from '../history.js';
import { GET as newsGET } from '../news.js';
import { GET as profileGET } from '../profile.js';
import { GET as quoteGET, OPTIONS as quoteOPTIONS } from '../quote.js';
import { GET as searchGET } from '../search.js';
import { parseSymbols } from './http.js';
import { BlockedUrlError, checkedLookup } from './safeFetch.js';
import * as yahoo from './yahoo.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

// safeFetch connects with node:http(s). Both are one mock here, which is told which module it is;
// an Agent made by either remembers it, as the real ones refuse the other module's requests.
const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('node:http', () => ({
  request: (...args: unknown[]) => requestMock('http:', ...args),
  Agent: class {
    via = 'http:';
  },
}));
vi.mock('node:https', () => ({
  request: (...args: unknown[]) => requestMock('https:', ...args),
  Agent: class {
    via = 'https:';
  },
}));

vi.mock('./yahoo.js', async (orig) => ({
  ...(await orig<typeof import('./yahoo.js')>()),
  getQuotes: vi.fn(),
  getProfile: vi.fn(),
  getDividends: vi.fn(),
  getNews: vi.fn(),
  getFxRate: vi.fn(),
  search: vi.fn(),
  history: vi.fn(),
}));

const TOKEN = 'test-token';
const ORIGIN = 'http://localhost:5173';

function request(path: string, headers: Record<string, string> = { 'X-Funancial-Token': TOKEN }) {
  return new Request(`http://localhost${path}`, { headers });
}

const aapl = {
  symbol: 'AAPL',
  shortName: 'Apple Inc.',
  regularMarketPrice: 342,
  regularMarketPreviousClose: 342.96,
  currency: 'USD',
  quoteType: 'EQUITY',
  fullExchangeName: 'NasdaqGS',
  regularMarketTime: new Date('2026-10-15T20:00:01.000Z'),
};

beforeEach(() => {
  vi.resetAllMocks();
  process.env.FUNANCIAL_ACCESS_TOKEN = TOKEN;
  delete process.env.FUNANCIAL_APP_ORIGIN;
});

afterEach(() => {
  delete process.env.FUNANCIAL_ACCESS_TOKEN;
  delete process.env.FUNANCIAL_APP_ORIGIN;
});

describe('price service', () => {
  it('rejects a missing or wrong token with 401 no-store', async () => {
    const bad: Array<Record<string, string>> = [
      {},
      { 'X-Funancial-Token': 'nope' },
      { 'X-Funancial-Token': '' },
    ];
    for (const headers of bad) {
      const res = await quoteGET(request('/api/quote?symbols=AAPL', headers));
      expect(res.status).toBe(401);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
    expect(yahoo.getQuotes).not.toHaveBeenCalled();
  });

  it('answers the preflight without a token, for an allowed origin only', () => {
    const preflight = (origin: string) =>
      quoteOPTIONS(
        new Request('http://localhost/api/quote', {
          method: 'OPTIONS',
          headers: { Origin: origin },
        }),
      );

    const ok = preflight(ORIGIN);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(ok.headers.get('Access-Control-Allow-Headers')).toBe(
      'X-Funancial-Token, Authorization, Content-Type',
    );
    expect(ok.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
    // Browsers cap it, but without it every request from the phone pays a preflight first.
    expect(ok.headers.get('Access-Control-Max-Age')).toBe('86400');

    for (const origin of ['capacitor://localhost', 'https://localhost']) {
      expect(preflight(origin).headers.get('Access-Control-Allow-Origin')).toBe(origin);
    }

    const evil = preflight('https://evil.example');
    expect(evil.status).toBe(204);
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull();

    process.env.FUNANCIAL_APP_ORIGIN = 'https://funancial.example';
    expect(preflight('https://funancial.example').headers.get('Access-Control-Allow-Origin')).toBe(
      'https://funancial.example',
    );
  });

  it('says not configured when FUNANCIAL_ACCESS_TOKEN is unset', async () => {
    delete process.env.FUNANCIAL_ACCESS_TOKEN;
    const cases: Array<Record<string, string>> = [
      {},
      { 'X-Funancial-Token': '' },
      { 'X-Funancial-Token': TOKEN },
    ];
    for (const headers of cases) {
      const res = await quoteGET(request('/api/quote?symbols=AAPL', headers));
      expect(res.status).toBe(500);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'not configured' });
    }
  });

  it('rejects bad symbols and more than 25 with 400', async () => {
    const symbols = (n: number) => Array.from({ length: n }, (_, i) => `S${i}`).join(',');
    const bad: Array<[(req: Request) => Promise<Response>, string]> = [
      [quoteGET, '/api/quote'],
      [quoteGET, '/api/quote?symbols='],
      [quoteGET, '/api/quote?symbols=AAPL,'],
      [quoteGET, '/api/quote?symbols=AAPL%20MSFT'],
      [quoteGET, '/api/quote?symbols=AAPL;DROP'],
      [quoteGET, '/api/quote?symbols=ABCDEFGHIJKLMNOP'],
      [quoteGET, `/api/quote?symbols=${symbols(26)}`],
      [profileGET, '/api/profile?symbol=AAPL,KO'],
      [dividendsGET, '/api/dividends?symbol=%24'],
      [newsGET, '/api/news?symbols=a/b'],
      [fxGET, '/api/fx?from=usd&to=EUR'],
      [fxGET, '/api/fx?from=USD'],
    ];
    for (const [get, path] of bad) {
      const res = await get(request(path));
      expect(res.status, path).toBe(400);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'bad request' });
    }
    expect(yahoo.getQuotes).not.toHaveBeenCalled();

    expect(parseSymbols('A,B.AS,^GSPC,EURUSD=X,BTC-USD')).toHaveLength(5);
    expect(parseSymbols(symbols(25))).toHaveLength(25);
  });

  it('returns quotes with the 60s cache header and lists missing symbols', async () => {
    vi.mocked(yahoo.getQuotes).mockResolvedValue([
      aapl,
      {
        symbol: 'LLOY.L',
        longName: 'Lloyds Banking Group plc',
        regularMarketPrice: 105.85,
        currency: 'GBp',
        quoteType: 'EQUITY',
        regularMarketTime: new Date('2026-10-15T15:35:28.000Z'),
      },
      { ...aapl, symbol: 'GHOST', regularMarketPrice: undefined },
    ]);
    const res = await quoteGET(
      request('/api/quote?symbols=AAPL,LLOY.L,NOPE,GHOST', {
        'X-Funancial-Token': TOKEN,
        Origin: ORIGIN,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('s-maxage=60, stale-while-revalidate=60');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(yahoo.getQuotes).toHaveBeenCalledWith(['AAPL', 'LLOY.L', 'NOPE', 'GHOST']);
    expect(await res.json()).toEqual({
      quotes: [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 342,
          previousClose: 342.96,
          currency: 'USD',
          type: 'stock',
          exchange: 'NasdaqGS',
          asOf: '2026-10-15T20:00:01.000Z',
        },
        {
          symbol: 'LLOY.L',
          name: 'Lloyds Banking Group plc',
          price: 1.0585,
          previousClose: null,
          currency: 'GBP',
          type: 'stock',
          exchange: null,
          asOf: '2026-10-15T15:35:28.000Z',
        },
      ],
      missing: ['NOPE', 'GHOST'],
    });
  });

  it('normalises GBp, ZAc and ILA prices', () => {
    expect(yahoo.normalise(1234, 'GBp')).toEqual({ price: 12.34, currency: 'GBP' });
    expect(yahoo.normalise(1234, 'ZAc')).toEqual({ price: 12.34, currency: 'ZAR' });
    expect(yahoo.normalise(1234, 'ILA')).toEqual({ price: 12.34, currency: 'ILS' });
    expect(yahoo.normalise(1234, 'USD')).toEqual({ price: 1234, currency: 'USD' });
  });

  it('returns 502 without details when Yahoo throws', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(yahoo.getQuotes).mockRejectedValue(new Error('crumb exploded at /secret/path'));
    const res = await quoteGET(request('/api/quote?symbols=AAPL'));
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toBe('{"error":"upstream"}');
    log.mockRestore();
  });

  it('serves the profile, with no sector for an ETF', async () => {
    vi.mocked(yahoo.getProfile).mockResolvedValue({
      shortName: 'Vanguard FTSE All-World UCITS E',
      longName: 'Vanguard FTSE All-World UCITS ETF',
      quoteType: 'ETF',
      exchangeName: 'Amsterdam',
      currency: 'EUR',
      sector: 'Should be ignored',
    });
    const res = await profileGET(request('/api/profile?symbol=VWRL.AS'));
    expect(res.headers.get('Cache-Control')).toBe('s-maxage=86400');
    expect(await res.json()).toEqual({
      symbol: 'VWRL.AS',
      name: 'Vanguard FTSE All-World UCITS ETF',
      type: 'etf',
      exchange: 'Amsterdam',
      currency: 'EUR',
      sector: null,
    });
  });

  it('serves dividends as days, oldest first, with the next dates', async () => {
    vi.mocked(yahoo.getDividends).mockResolvedValue({
      currency: 'GBp',
      history: [
        { date: new Date('2026-08-06T07:00:00.000Z'), amount: 1.5 },
        { date: new Date('2026-04-09T07:00:00.000Z'), amount: 2.5 },
      ],
      exDividendDate: new Date('2026-08-06T00:00:00.000Z'),
    });
    const res = await dividendsGET(request('/api/dividends?symbol=LLOY.L'));
    expect(res.headers.get('Cache-Control')).toBe('s-maxage=21600');
    expect(await res.json()).toEqual({
      symbol: 'LLOY.L',
      currency: 'GBP',
      history: [
        { date: '2026-04-09', amount: 0.025 },
        { date: '2026-08-06', amount: 0.015 },
      ],
      next: { exDate: '2026-08-06', payDate: null, amount: 0.015 },
    });

    vi.mocked(yahoo.getDividends).mockResolvedValue({ currency: 'EUR', history: [] });
    const none = await dividendsGET(request('/api/dividends?symbol=VWRL.AS'));
    expect(await none.json()).toEqual({
      symbol: 'VWRL.AS',
      currency: 'EUR',
      history: [],
      next: { exDate: null, payDate: null, amount: null },
    });
  });

  it('keeps only http(s) news links, newest first, 10 per symbol', async () => {
    const item = (n: number, link: string) => ({
      title: `Story ${n}`,
      publisher: 'Wire',
      link,
      providerPublishTime: new Date(Date.UTC(2026, 9, 1, 0, n)),
    });
    const aaplNews = [
      ...Array.from({ length: 12 }, (_, i) => item(i, `https://news.example/a/${i}`)),
      item(50, 'javascript:alert(1)'),
      item(51, 'ftp://news.example/old'),
      item(52, 'not a url'),
    ];
    const koNews = [item(3, 'https://news.example/a/3'), item(100, 'http://news.example/ko')];
    vi.mocked(yahoo.getNews).mockImplementation(async (s) => (s === 'AAPL' ? aaplNews : koNews));

    const res = await newsGET(request('/api/news?symbols=AAPL,KO'));
    expect(res.headers.get('Cache-Control')).toBe('s-maxage=3600');
    const { items } = (await res.json()) as {
      items: Array<{ symbol: string; title: string; url: string; publishedAt: string }>;
    };

    // AAPL keeps its 10 newest valid links (Story 2..11); the one it shares with KO counts once.
    expect(items.map((i) => i.title)).toEqual([
      'Story 100',
      ...Array.from({ length: 10 }, (_, i) => `Story ${11 - i}`),
    ]);
    expect(items[0]).toEqual({
      symbol: 'KO',
      title: 'Story 100',
      publisher: 'Wire',
      url: 'http://news.example/ko',
      publishedAt: '2026-10-01T01:40:00.000Z',
    });
    expect(items.filter((i) => i.symbol === 'AAPL')).toHaveLength(10);
    expect(items.every((i) => /^https?:\/\//.test(i.url))).toBe(true);
  });

  it('returns rate 1 for the same currency without calling Yahoo', async () => {
    const same = await fxGET(request('/api/fx?from=EUR&to=EUR'));
    expect(same.headers.get('Cache-Control')).toBe('s-maxage=3600');
    expect(await same.json()).toMatchObject({ from: 'EUR', to: 'EUR', rate: 1 });
    expect(yahoo.getFxRate).not.toHaveBeenCalled();

    vi.mocked(yahoo.getFxRate).mockResolvedValue({
      rate: 0.89,
      asOf: new Date('2026-10-16T07:01:29.000Z'),
    });
    const res = await fxGET(request('/api/fx?from=USD&to=EUR'));
    expect(yahoo.getFxRate).toHaveBeenCalledWith('USD', 'EUR');
    expect(await res.json()).toEqual({
      from: 'USD',
      to: 'EUR',
      rate: 0.89,
      asOf: '2026-10-16T07:01:29.000Z',
    });
  });

  describe('symbol search', () => {
    const hit = (symbol: string, quoteType: string, extra: Record<string, unknown> = {}) => ({
      symbol,
      quoteType,
      longname: `${symbol} long`,
      shortname: `${symbol} short`,
      exchDisp: 'Amsterdam',
      exchange: 'AMS',
      ...extra,
    });

    it('wants the token', async () => {
      const res = await searchGET(request('/api/search?q=vusa', {}));
      expect(res.status).toBe(401);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(yahoo.search).not.toHaveBeenCalled();
    });

    it("takes letters, numbers, spaces and . & ' - up to 40, and nothing else", async () => {
      const bad = [
        '',
        '%20%20',
        'a'.repeat(41),
        'vusa;drop',
        'a/b',
        'a,b',
        'x%00',
        '%3Cb%3E',
        'a_b',
      ];
      for (const q of bad) {
        const res = await searchGET(request(`/api/search?q=${q}`));
        expect(res.status, q).toBe(400);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(await res.json()).toEqual({ error: 'bad request' });
      }
      expect((await searchGET(request('/api/search'))).status).toBe(400);
      expect(yahoo.search).not.toHaveBeenCalled();

      vi.mocked(yahoo.search).mockResolvedValue([]);
      const good = ['a'.repeat(40), 'AT%26T', "L'Or%C3%A9al", 'S%C3%BCdzucker', 'Coca-Cola', 'a.b'];
      for (const q of good) {
        expect((await searchGET(request(`/api/search?q=${q}`))).status, q).toBe(200);
      }
    });

    it('trims the query before it asks Yahoo', async () => {
      vi.mocked(yahoo.search).mockResolvedValue([]);
      await searchGET(request('/api/search?q=%20vusa%20'));
      expect(yahoo.search).toHaveBeenCalledWith('vusa');
    });

    it('keeps stocks and ETFs with a usable symbol, in Yahoo order, and drops the rest', async () => {
      vi.mocked(yahoo.search).mockResolvedValue([
        hit('VUSA.AS', 'ETF'),
        hit('VUSD.L', 'MUTUALFUND'),
        hit('VUSA-USD', 'CRYPTOCURRENCY'),
        hit('^VUSA', 'INDEX'),
        hit('VUS.L', 'EQUITY'),
        hit('BAD SYMBOL', 'EQUITY'),
        hit('WAYTOOLONGSYMBOL1', 'ETF'),
        { index: 'other', name: 'Not Yahoo', permalink: 'x', isYahooFinance: false },
      ]);
      const res = await searchGET(request('/api/search?q=vusa'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        results: [
          { symbol: 'VUSA.AS', name: 'VUSA.AS long', exchange: 'Amsterdam', type: 'etf' },
          { symbol: 'VUS.L', name: 'VUS.L long', exchange: 'Amsterdam', type: 'stock' },
        ],
      });
    });

    it('drops a repeated symbol, keeping the first, before it takes the 8', async () => {
      vi.mocked(yahoo.search).mockResolvedValue([
        hit('VUSA.AS', 'ETF'),
        hit('VUSA.AS', 'EQUITY', { exchDisp: 'Again' }),
        ...Array.from({ length: 8 }, (_, i) => hit(`S${i}`, 'EQUITY')),
      ]);
      const res = await searchGET(request('/api/search?q=vusa'));
      const { results } = (await res.json()) as {
        results: Array<{ symbol: string; exchange: string; type: string }>;
      };
      expect(results.map((r) => r.symbol)).toEqual([
        'VUSA.AS',
        'S0',
        'S1',
        'S2',
        'S3',
        'S4',
        'S5',
        'S6',
      ]);
      expect(results[0]).toMatchObject({ exchange: 'Amsterdam', type: 'etf' });
    });

    it('returns at most 8', async () => {
      vi.mocked(yahoo.search).mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => hit(`S${i}`, 'EQUITY')),
      );
      const res = await searchGET(request('/api/search?q=s'));
      const { results } = (await res.json()) as { results: Array<{ symbol: string }> };
      expect(results.map((r) => r.symbol)).toEqual([
        'S0',
        'S1',
        'S2',
        'S3',
        'S4',
        'S5',
        'S6',
        'S7',
      ]);
    });

    it('names a result by long name, short name, then symbol; the exchange by display name, code, then null', async () => {
      vi.mocked(yahoo.search).mockResolvedValue([
        { symbol: 'A', quoteType: 'EQUITY', shortname: 'Short A', exchange: 'NMS' },
        { symbol: 'B', quoteType: 'ETF' },
      ]);
      const res = await searchGET(request('/api/search?q=a'));
      expect(await res.json()).toEqual({
        results: [
          { symbol: 'A', name: 'Short A', exchange: 'NMS', type: 'stock' },
          { symbol: 'B', name: 'B', exchange: null, type: 'etf' },
        ],
      });
    });

    it('caches a day, and says nothing of Yahoo when it throws', async () => {
      vi.mocked(yahoo.search).mockResolvedValue([]);
      const ok = await searchGET(request('/api/search?q=vusa'));
      expect(ok.headers.get('Cache-Control')).toBe('s-maxage=86400');
      expect(await ok.json()).toEqual({ results: [] });

      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(yahoo.search).mockRejectedValue(new Error('crumb exploded at /secret/path'));
      const res = await searchGET(request('/api/search?q=vusa'));
      expect(res.status).toBe(502);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.text()).toBe('{"error":"upstream"}');
      log.mockRestore();
    });
  });

  describe('price history', () => {
    const NOW = new Date('2026-10-16T12:00:00.000Z');
    const quotes = (...rows: Array<[string, number | null]>) =>
      rows.map(([date, close]) => ({ date: new Date(`${date}T08:00:00.000Z`), close }));

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it('wants the token', async () => {
      const res = await historyGET(request('/api/history?symbol=AAPL&from=2026-01-05', {}));
      expect(res.status).toBe(401);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(yahoo.history).not.toHaveBeenCalled();
    });

    it('refuses a bad symbol, and a missing, malformed, impossible, early or future date', async () => {
      const bad = [
        '/api/history?from=2026-01-05',
        '/api/history?symbol=AAPL,KO&from=2026-01-05',
        '/api/history?symbol=a%20b&from=2026-01-05',
        '/api/history?symbol=AAPL',
        '/api/history?symbol=AAPL&from=',
        '/api/history?symbol=AAPL&from=2026-1-5',
        '/api/history?symbol=AAPL&from=05-01-2026',
        '/api/history?symbol=AAPL&from=2026-02-30',
        '/api/history?symbol=AAPL&from=2026-13-01',
        '/api/history?symbol=AAPL&from=1969-12-31',
        '/api/history?symbol=AAPL&from=0001-01-01',
        '/api/history?symbol=AAPL&from=2026-10-17',
        '/api/history?symbol=AAPL&from=2099-01-01',
      ];
      for (const path of bad) {
        const res = await historyGET(request(path));
        expect(res.status, path).toBe(400);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(await res.json()).toEqual({ error: 'bad request' });
      }
      expect(yahoo.history).not.toHaveBeenCalled();

      // Today and the first day of 1970 are allowed.
      vi.mocked(yahoo.history).mockResolvedValue({
        currency: 'USD',
        timeZone: 'America/New_York',
        quotes: [],
      });
      for (const from of ['2026-10-16', '1970-01-01']) {
        expect((await historyGET(request(`/api/history?symbol=AAPL&from=${from}`))).status).toBe(
          200,
        );
      }
    });

    it('asks daily up to 92 days back, weekly up to 2 years, then monthly', async () => {
      vi.mocked(yahoo.history).mockResolvedValue({
        currency: 'USD',
        timeZone: 'America/New_York',
        quotes: [],
      });
      const interval = async (from: string) => {
        vi.mocked(yahoo.history).mockClear();
        await historyGET(request(`/api/history?symbol=AAPL&from=${from}`));
        return vi.mocked(yahoo.history).mock.calls[0]![2];
      };
      expect(await interval('2026-10-16')).toBe('1d');
      expect(await interval('2026-07-16')).toBe('1d'); // 92 days ago
      expect(await interval('2026-07-15')).toBe('1wk'); // 93 days ago
      expect(await interval('2024-10-16')).toBe('1wk'); // 2 years ago
      expect(await interval('2024-10-15')).toBe('1mo');
      expect(await interval('1970-01-01')).toBe('1mo');

      // From the start of the day it was asked for, as Yahoo reads a date.
      expect(yahoo.history).toHaveBeenCalledWith(
        'AAPL',
        new Date('1970-01-01T00:00:00.000Z'),
        '1mo',
      );
    });

    it('serves closes as days, oldest first, skipping a null close, with an hour of cache', async () => {
      vi.mocked(yahoo.history).mockResolvedValue({
        currency: 'EUR',
        timeZone: 'Europe/Amsterdam',
        quotes: quotes(['2026-03-05', 101.5], ['2026-03-03', 100], ['2026-03-04', null]),
      });
      const res = await historyGET(
        request('/api/history?symbol=VUSA.AS&from=2026-03-03', {
          'X-Funancial-Token': TOKEN,
          Origin: ORIGIN,
        }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('s-maxage=3600');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
      expect(await res.json()).toEqual({
        symbol: 'VUSA.AS',
        currency: 'EUR',
        points: [
          { date: '2026-03-03', close: 100 },
          { date: '2026-03-05', close: 101.5 },
        ],
      });
    });

    it('turns pence into pounds, as the quote route does', async () => {
      vi.mocked(yahoo.history).mockResolvedValue({
        currency: 'GBp',
        timeZone: 'Europe/London',
        quotes: quotes(['2026-03-03', 10585]),
      });
      const res = await historyGET(request('/api/history?symbol=LLOY.L&from=2026-03-03'));
      expect(await res.json()).toEqual({
        symbol: 'LLOY.L',
        currency: 'GBP',
        points: [{ date: '2026-03-03', close: 105.85 }],
      });
    });

    it('dates a bar by the clock of its exchange, so a weekly bar keeps its Monday', async () => {
      vi.mocked(yahoo.history).mockResolvedValue({
        currency: 'EUR',
        timeZone: 'Europe/Amsterdam',
        quotes: [
          // Amsterdam midnight on Monday Mar 3 (winter) and on Monday Jun 2 (summer), in UTC.
          { date: new Date('2025-03-02T23:00:00.000Z'), close: 1 },
          { date: new Date('2025-06-01T22:00:00.000Z'), close: 2 },
        ],
      });
      const res = await historyGET(request('/api/history?symbol=VUSA.AS&from=2025-03-03'));
      const { points } = (await res.json()) as { points: Array<{ date: string }> };
      expect(points.map((p) => p.date)).toEqual(['2025-03-03', '2025-06-02']);
    });

    it('answers a history with no closes as no points', async () => {
      vi.mocked(yahoo.history).mockResolvedValue({
        currency: 'USD',
        timeZone: 'America/New_York',
        quotes: [],
      });
      const res = await historyGET(request('/api/history?symbol=AAPL&from=2026-10-16'));
      expect(await res.json()).toEqual({ symbol: 'AAPL', currency: 'USD', points: [] });
    });

    it('returns 502 without details when Yahoo throws', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(yahoo.history).mockRejectedValue(new Error('crumb exploded at /secret/path'));
      const res = await historyGET(request('/api/history?symbol=AAPL&from=2026-03-03'));
      expect(res.status).toBe(502);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.text()).toBe('{"error":"upstream"}');
      log.mockRestore();
    });
  });

  describe('product link extract', () => {
    type Found = { address: string; family: number };
    const dns = vi.mocked(lookup) as unknown as Mock<
      (host: string, options: { all: true }) => Promise<Found[]>
    >;
    // The "network": what the page at a URL answers, as a Response, and the options it was asked with.
    const serve = vi.fn<(href: string, options: RequestOptions) => Response | Promise<Response>>();
    // What `checkedLookup` handed each socket: [error, addresses or address, family].
    const handed: unknown[][] = [];
    const PUBLIC: Found[] = [{ address: '93.184.216.34', family: 4 }];
    const HTML = { 'Content-Type': 'text/html; charset=utf-8' };
    const page = (body: BodyInit | null, headers: Record<string, string> = HTML) =>
      new Response(body, { headers });
    const redirect = (to: string, status = 302) =>
      new Response(null, { status, headers: { Location: to } });
    const extract = (url: string, headers?: Record<string, string>) =>
      extractGET(request(`/api/extract?url=${encodeURIComponent(url)}`, headers));
    const fetched = () => serve.mock.calls.map(([href]) => href);

    // A stand-in for node:http's request. Like the real one it asks the `lookup` option for the
    // address to connect to (unless the host is a literal address), honours `signal`, never
    // follows a redirect, and answers with a stream carrying statusCode and headers.
    function fakeRequest(
      via: string,
      url: URL,
      options: RequestOptions,
      onResponse: (res: IncomingMessage) => void,
    ) {
      // As the real ones do, node:http takes only http: and node:https only https:.
      if (url.protocol !== via) throw new TypeError(`Protocol "${url.protocol}" not supported`);
      const agent = options.agent as { via: string } | undefined;
      if (agent && agent.via !== via)
        throw new TypeError(`Protocol "${via}" not supported by agent`);
      const req = new EventEmitter();
      let failed = false;
      const fail = (err: unknown) => {
        if (failed) return;
        failed = true;
        queueMicrotask(() => req.emit('error', err));
      };
      let body: Readable | undefined;
      const abort = () => {
        fail(
          Object.assign(new Error('The operation was aborted'), {
            name: 'AbortError',
            code: 'ABORT_ERR',
            cause: options.signal?.reason,
          }),
        );
        // A body being read fails too, with a reset.
        body?.destroy(Object.assign(new Error('aborted'), { code: 'ECONNRESET' }));
      };
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener('abort', abort, { once: true });

      const connect = async () => {
        try {
          const host = url.hostname.replace(/^\[|\]$/g, '');
          if (!isIP(host)) {
            await new Promise<void>((resolve, reject) => {
              (options.lookup as LookupFunction)(host, { all: true }, (err, ...answer) => {
                handed.push([err, ...answer]);
                if (err) reject(err);
                else resolve();
              });
            });
          }
          const res = await serve(url.href, options);
          if (failed) return;
          body = res.body ? Readable.fromWeb(res.body as WebReadableStream) : Readable.from([]);
          onResponse(
            Object.assign(body, {
              statusCode: res.status,
              headers: Object.fromEntries(res.headers),
            }) as unknown as IncomingMessage,
          );
        } catch (err) {
          fail(err);
        }
      };
      return Object.assign(req, {
        end() {
          setImmediate(connect);
          return req;
        },
      });
    }
    const ld = (data: unknown) =>
      `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
    const read = async (body: string) => {
      serve.mockImplementation(async () => page(body));
      const res = await extract('https://shop.example/p');
      expect(res.status).toBe(200);
      return res.json();
    };
    const upstreamFailure = async (res: Response) => {
      expect(res.status).toBe(502);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.text()).toBe('{"error":"upstream"}');
    };

    beforeEach(() => {
      dns.mockResolvedValue(PUBLIC);
      requestMock.mockImplementation(fakeRequest);
      handed.length = 0;
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const refused = async (url: string) => {
      const res = await extract(url);
      expect(res.status, url).toBe(400);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'bad request' });
    };

    it('wants the token', async () => {
      const res = await extract('https://shop.example/p', {});
      expect(res.status).toBe(401);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(dns).not.toHaveBeenCalled();
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('refuses a missing, malformed or non-http(s) link without looking it up', async () => {
      const bad = [
        '',
        'not a url',
        '/relative/path',
        'ftp://shop.example/p',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'data:text/html,<title>x</title>',
        'gopher://shop.example/',
        'https://user:secret@shop.example/p',
      ];
      for (const url of bad) await refused(url);
      expect((await extractGET(request('/api/extract'))).status).toBe(400);
      expect(dns).not.toHaveBeenCalled();
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('refuses localhost and private, loopback, link-local, ULA and unspecified addresses', async () => {
      const hosts = [
        'localhost',
        'LOCALHOST',
        'localhost.',
        'foo.localhost',
        'a.b.localhost.',
        '0.0.0.0',
        '0.1.2.3',
        '10.0.0.1',
        '10.255.255.255',
        '100.64.0.1',
        '100.127.255.255',
        '127.0.0.1',
        '127.255.255.254',
        '169.254.169.254',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.0.1',
        '192.168.255.255',
        '224.0.0.1',
        '239.255.255.255',
        '255.255.255.255',
        // The URL parser turns these spellings into 127.0.0.1 before they reach the check.
        '127.1',
        '2130706433',
        '0x7f.0.0.1',
        '0177.0.0.1',
        '[::]',
        '[::1]',
        '[fc00::1]',
        '[fd12:3456:789a::1]',
        '[fdff:ffff::1]',
        '[fe80::1]',
        '[febf::1]',
        '[ff02::1]',
        '[::ffff:127.0.0.1]',
        '[::ffff:10.1.2.3]',
        '[::ffff:a9fe:a9fe]',
        '[::ffff:c0a8:1]',
        // More spellings of loopback: another number base, a short form, a trailing dot, percent
        // escapes, fullwidth digits and an IPv4-compatible IPv6 address.
        '0x7f000001',
        '017700000001',
        '127.0.1',
        '127.0.0.1.',
        '%31%32%37.0.0.1',
        '１２７.０.０.１',
        '[::127.0.0.1]',
        // A zone id is not a valid host at all.
        '[fe80::1%25eth0]',
        // Benchmarking and IETF protocol ranges, and the IPv6 ranges that carry an IPv4 address.
        '192.0.0.1',
        '192.0.0.255',
        '198.18.0.1',
        '198.19.255.255',
        '[::ffff:c612:1]',
        '[::ffff:c000:1]',
        '[64:ff9b::7f00:1]',
        '[64:ff9b::a00:1]',
        '[64:ff9b:1::1]',
        '[64:ff9b:1:ffff::1]',
        '[2002::1]',
        '[2002:7f00:1::1]',
        '[2002:ffff:ffff::1]',
        '[fec0::1]',
        '[feff::1]',
        // Mapped IPv4 as a whole (public ones too), Teredo and the discard-only prefix.
        '[::ffff:808:808]',
        '[::ffff:0:1]',
        '[::ffff:ffff:ffff]',
        '[2001::1]',
        '[2001:0:4136:e378:8000:63bf:3fff:fdd2]',
        '[2001:0:ffff:ffff:ffff:ffff:ffff:ffff]',
        '[100::1]',
        '[100::ffff:ffff:ffff:ffff]',
      ];
      for (const host of hosts) {
        await refused(`http://${host}/`);
        await refused(`https://${host}:8443/admin?x=1`);
      }
      // Refused before any connection, and without a lookup either.
      expect(requestMock).not.toHaveBeenCalled();
      expect(dns).not.toHaveBeenCalled();
    });

    it('lets public literal addresses next to the private ranges through', async () => {
      serve.mockImplementation(async () => page('<title>x</title>'));
      const hosts = [
        '8.8.8.8',
        '11.0.0.1',
        '100.63.255.255',
        '100.128.0.1',
        '126.255.255.255',
        '128.0.0.1',
        '169.253.0.1',
        '172.15.255.255',
        '172.32.0.1',
        '192.167.255.255',
        '192.169.0.1',
        '223.255.255.255',
        '191.255.255.255',
        '192.0.1.1',
        '198.17.255.255',
        '198.20.0.1',
        '[2606:4700::1111]',
        '[2001:1::1]',
        '[2001:4860:4860::8888]',
        '[100:0:0:1::1]',
        '[64:ff9a::1]',
        '[64:ff9b:2::1]',
        '[2003::1]',
        '[fbff::1]',
      ];
      for (const host of hosts) {
        expect((await extract(`https://${host}/p`)).status, host).toBe(200);
      }
      expect(serve).toHaveBeenCalledTimes(hosts.length);
    });

    it('refuses a hostname when any address it resolves to is private', async () => {
      const answers: string[][] = [
        ['127.0.0.1'],
        ['10.1.2.3'],
        ['172.16.5.5'],
        ['192.168.1.20'],
        ['169.254.169.254'],
        ['100.100.100.200'],
        ['0.0.0.0'],
        ['::1'],
        ['::'],
        ['fc00::5'],
        ['fd00:ec2::254'],
        ['fe80::1'],
        ['::ffff:127.0.0.1'],
        ['::ffff:192.168.0.9'],
        ['::ffff:8.8.8.8'],
        ['2001:0:4136:e378:8000:63bf:3fff:fdd2'],
        ['100::2'],
        // One public answer does not excuse a private one beside it, in either order.
        ['93.184.216.34', '10.0.0.1'],
        ['10.0.0.1', '93.184.216.34'],
        ['93.184.216.34', '2606:2800:220:1::1', '::1'],
        // Nothing resolved, or something that is not an address, is no answer to trust.
        [],
        ['not-an-ip'],
      ];
      for (const addresses of answers) {
        dns.mockResolvedValue(
          addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
        );
        await refused('https://evil.example/p');
      }
      expect(dns).toHaveBeenCalledWith('evil.example', { all: true });
      expect(serve).not.toHaveBeenCalled();
    });

    it('lets a hostname that resolves only to public addresses through', async () => {
      dns.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1::1', family: 6 },
      ]);
      serve.mockImplementation(async () => page('<title>Chair</title>'));
      const res = await extract('https://shop.example/chair?id=7');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: 'Chair', price: null, currency: null });
      expect(dns).toHaveBeenCalledWith('shop.example', { all: true });
      expect(fetched()).toEqual(['https://shop.example/chair?id=7']);
      // Sent through the checked lookup, naming what it takes and no encoding but identity.
      expect(serve.mock.calls[0]![1]).toMatchObject({
        lookup: checkedLookup,
        headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
      });
    });

    it('refuses a redirect to a private address, a private hostname or a non-http scheme', async () => {
      dns.mockImplementation(async (host) =>
        host === 'internal.example' ? [{ address: '10.0.0.5', family: 4 }] : PUBLIC,
      );
      const targets = [
        'http://127.0.0.1/admin',
        'http://169.254.169.254/latest/meta-data/',
        'http://localhost:8080/',
        'http://[::1]/',
        'http://[::ffff:7f00:1]/',
        'http://[fd00::1]/',
        'http://192.168.0.1/',
        'https://internal.example/secret',
        'ftp://shop.example/file',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'https://user:secret@shop.example/',
      ];
      for (const to of targets) {
        for (const status of [301, 302, 303, 307, 308]) {
          serve.mockReset();
          serve.mockImplementation(async () => redirect(to, status));
          await refused('https://shop.example/short');
          // The public first hop was fetched; the target never was.
          expect(fetched(), to).toEqual(['https://shop.example/short']);
        }
      }
    });

    it('re-checks every hop, resolves relative redirects and allows three', async () => {
      dns.mockImplementation(async (host) =>
        host === 'internal.example' ? [{ address: '10.0.0.5', family: 4 }] : PUBLIC,
      );
      const hops: Record<string, () => Response> = {
        'https://a.example/1': () => redirect('/2'),
        'https://a.example/2': () => redirect('https://b.example/3?x=1'),
        'https://b.example/3?x=1': () => redirect('//c.example/4'),
        'https://c.example/4': () => page('<title>Landed</title>'),
      };
      serve.mockImplementation(async (url) => hops[String(url)]!());
      const res = await extract('https://a.example/1');
      expect(await res.json()).toEqual({ name: 'Landed', price: null, currency: null });
      expect(fetched()).toEqual(Object.keys(hops));
      for (const [, options] of serve.mock.calls) expect(options.lookup).toBe(checkedLookup);
      expect(dns.mock.calls.map(([host]) => host)).toEqual([
        'a.example',
        'a.example',
        'b.example',
        'c.example',
      ]);

      // A public first hop that bounces to a private hostname is stopped at that hop.
      serve.mockReset();
      serve.mockImplementation(async () => redirect('https://internal.example/'));
      await refused('https://a.example/1');
      expect(fetched()).toEqual(['https://a.example/1']);
    });

    it('gives up on a fourth redirect, and on a loop, as an upstream failure', async () => {
      serve.mockImplementation(async (url) => redirect(`${String(url)}x`));
      await upstreamFailure(await extract('https://a.example/'));
      // The first request plus three redirects.
      expect(serve).toHaveBeenCalledTimes(4);
    });

    it('follows a redirect that switches protocol, using the matching module and agent per hop', async () => {
      const hops: Record<string, () => Response> = {
        'http://a.example/1': () => redirect('https://a.example/2'),
        'https://a.example/2': () => redirect('http://b.example/3'),
        'http://b.example/3': () => redirect('https://c.example/4'),
        'https://c.example/4': () => page('<title>Landed</title>'),
      };
      serve.mockImplementation(async (url) => hops[String(url)]!());
      const res = await extract('http://a.example/1');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: 'Landed', price: null, currency: null });
      expect(fetched()).toEqual(Object.keys(hops));
      expect(requestMock.mock.calls.map(([via]) => via)).toEqual([
        'http:',
        'https:',
        'http:',
        'https:',
      ]);
    });

    it('connects through an Agent of its own for each protocol, not the global agents', async () => {
      // The global agents share a socket pool and, under NODE_USE_ENV_PROXY, route through a proxy
      // that checkedLookup would never see; a fresh Agent does neither.
      serve.mockImplementation(async () => page('<title>x</title>'));
      for (const url of ['https://a.example/', 'http://a.example/', 'https://b.example/']) {
        expect((await extract(url)).status).toBe(200);
      }
      const [first, second, third] = serve.mock.calls.map(([, options]) => options.agent);
      expect(first).toMatchObject({ via: 'https:' });
      expect(second).toMatchObject({ via: 'http:' });
      expect(third).toBe(first);
    });

    it('treats a redirect with no Location as a failure', async () => {
      serve.mockImplementation(async () => new Response(null, { status: 302 }));
      await upstreamFailure(await extract('https://a.example/'));
    });

    it('reads a page of exactly 2 MiB whole, and only the first 2 MiB of a bigger one', async () => {
      const cap = 2 * 1024 * 1024;
      const head = '<title>Big</title>';
      const tag = '<meta property="og:price:amount" content="7">';
      const room = cap - head.length - tag.length;
      const want = { name: 'Big', price: 7, currency: null };

      serve.mockImplementation(async () => page(head + ' '.repeat(room) + tag));
      expect(await (await extract('https://shop.example/p')).json()).toEqual(want);

      // One byte further and the tag is cut off at the cap: the page is read, not refused.
      serve.mockImplementation(async () => page(head + ' '.repeat(room + 1) + tag));
      const cut = await extract('https://shop.example/p');
      expect(cut.status).toBe(200);
      expect(await cut.json()).toEqual({ name: 'Big', price: null, currency: null });

      // Whatever follows the cap is never read.
      serve.mockImplementation(async () => page(head + ' '.repeat(cap) + tag));
      expect(await (await extract('https://shop.example/p')).json()).toEqual({
        name: 'Big',
        price: null,
        currency: null,
      });
    });

    it('reads JSON-LD that sits past 1 MB, as IKEA product pages put it', async () => {
      const product = {
        '@type': 'Product',
        name: 'BILLY bookcase',
        offers: { price: '79', priceCurrency: 'USD' },
      };
      const body = `<title>IKEA</title>${'<p>filler</p>'.repeat(90_000)}${ld(product)}`;
      expect(body.indexOf('application/ld+json')).toBeGreaterThan(1.1 * 1024 * 1024);
      expect(await read(body)).toEqual({ name: 'BILLY bookcase', price: 79, currency: 'USD' });
    });

    it('answers from the OpenGraph tags of a page much larger than 2 MiB', async () => {
      const head = [
        '<title>Page title</title>',
        '<meta property="og:title" content="Standing Desk">',
        '<meta property="product:price:amount" content="249.00">',
        '<meta property="product:price:currency" content="GBP">',
      ].join('');
      const body = `<!doctype html><html><head>${head}</head><body>${'<p>filler</p>'.repeat(250_000)}</body></html>`;
      expect(body.length).toBeGreaterThan(3 * 1024 * 1024);
      serve.mockImplementation(async () => page(body));
      const res = await extract('https://shop.example/p');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: 'Standing Desk', price: 249, currency: 'GBP' });
    });

    it('stops reading a body that never ends instead of draining it, and answers from what it read', async () => {
      let pulls = 0;
      const first = new TextEncoder().encode('<title>Endless</title>'.padEnd(256 * 1024, ' '));
      const chunk = new Uint8Array(256 * 1024).fill(32);
      serve.mockImplementation(async () => {
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            pulls += 1;
            controller.enqueue(pulls === 1 ? first : chunk);
          },
        });
        return page(body);
      });
      const res = await extract('https://shop.example/p');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: 'Endless', price: null, currency: null });
      // Eight 256 KiB chunks make 2 MiB; the stream is cancelled there, not read on.
      expect(pulls).toBeGreaterThan(7);
      expect(pulls).toBeLessThan(16);
    });

    it('gives up after 5 seconds, as one budget for the whole chain', async () => {
      const clock = new AbortController();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(clock.signal);
      serve.mockImplementation(() => new Promise<Response>(() => {}));
      const pending = extract('https://shop.example/p');
      await vi.waitFor(() => expect(serve).toHaveBeenCalled());
      expect(serve.mock.calls[0]![1].signal).toBe(clock.signal);
      clock.abort(new DOMException('The operation timed out.', 'TimeoutError'));
      await upstreamFailure(await pending);
      expect(timeout).toHaveBeenCalledTimes(1);
      expect(timeout).toHaveBeenCalledWith(5000);
    });

    it('sends the same timeout signal on every hop', async () => {
      serve
        .mockImplementationOnce(async () => redirect('/next'))
        .mockImplementationOnce(async () => page('<title>x</title>'));
      await extract('https://shop.example/p');
      const [first, second] = serve.mock.calls.map(([, options]) => options.signal);
      expect(first).toBeInstanceOf(AbortSignal);
      expect(second).toBe(first);
    });

    it('does not start a hop once the budget is spent', async () => {
      const spent = AbortSignal.abort(new DOMException('The operation timed out.', 'TimeoutError'));
      vi.spyOn(AbortSignal, 'timeout').mockReturnValue(spent);
      await upstreamFailure(await extract('https://shop.example/p'));
      expect(requestMock).not.toHaveBeenCalled();
      expect(dns).not.toHaveBeenCalled();
    });

    it('ends a body that stalls when the budget runs out', async () => {
      const clock = new AbortController();
      vi.spyOn(AbortSignal, 'timeout').mockReturnValue(clock.signal);
      let pulls = 0;
      serve.mockImplementation(async () =>
        page(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulls += 1;
              if (pulls === 1) controller.enqueue(new TextEncoder().encode('<title>Half</title>'));
              else return new Promise<void>(() => {});
            },
          }),
        ),
      );
      const pending = extract('https://shop.example/p');
      // The second pull means the first chunk was read and the body has gone quiet.
      await vi.waitFor(() => expect(pulls).toBeGreaterThan(1));
      clock.abort(new DOMException('The operation timed out.', 'TimeoutError'));
      await upstreamFailure(await pending);
    });

    // Sends through node:http itself; its own Agent stands in for the mock one safeFetch passed.
    const useRealHttp = async () => {
      const http = await vi.importActual<typeof import('node:http')>('node:http');
      requestMock.mockImplementation((_via, url, options, onResponse) =>
        http.request(url, { ...options, agent: new http.Agent() }, onResponse),
      );
    };

    it('counts the DNS lookup in the 5 seconds, through the real http client', async () => {
      // The real request with a lookup that never answers: nothing connects, and the signal ends it.
      await useRealHttp();
      dns.mockImplementation(() => new Promise(() => {}));
      const clock = new AbortController();
      vi.spyOn(AbortSignal, 'timeout').mockReturnValue(clock.signal);
      const pending = extract('http://slow-dns.example/p');
      await vi.waitFor(() => expect(dns).toHaveBeenCalled());
      clock.abort(new DOMException('The operation timed out.', 'TimeoutError'));
      await upstreamFailure(await pending);
      expect(serve).not.toHaveBeenCalled();
    });

    it('refuses a private answer through the real http client too', async () => {
      await useRealHttp();
      dns.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
      await refused('http://internal.example/p');
      expect(dns).toHaveBeenCalledTimes(1);
    });

    it('connects with the addresses it checked, never a second answer (DNS rebinding)', async () => {
      const checked = [{ address: '93.184.216.34', family: 4 }];
      dns.mockResolvedValueOnce(checked).mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      serve.mockImplementation(async () => page('<title>Ok</title>'));
      const res = await extract('https://rebind.example/p');
      expect(res.status).toBe(200);
      // One lookup serves both the check and the connection, and the socket gets that answer.
      expect(dns).toHaveBeenCalledTimes(1);
      expect(handed).toEqual([[null, checked]]);
      expect(serve.mock.calls[0]![1].lookup).toBe(checkedLookup);

      // A name that answers private is refused before anything is sent, whatever it says next.
      dns.mockReset();
      dns
        .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }])
        .mockResolvedValue(checked);
      handed.length = 0;
      serve.mockClear();
      await refused('https://rebind.example/p');
      expect(serve).not.toHaveBeenCalled();
      expect(dns).toHaveBeenCalledTimes(1);
      expect(handed).toHaveLength(1);
      expect(handed[0]![0]).toBeInstanceOf(BlockedUrlError);
    });

    describe('checkedLookup', () => {
      const ask = (host: string, options: { all?: boolean; family?: number } = {}) =>
        new Promise<unknown[]>((resolve) => {
          checkedLookup(host, options, (...answer) => resolve(answer));
        });
      const v4 = (address: string) => ({ address, family: 4 });

      it('hands the socket every checked address under all, and the first one otherwise', async () => {
        const answer = [v4('93.184.216.34'), { address: '2606:2800:220:1::1', family: 6 }];
        dns.mockResolvedValue(answer);
        expect(await ask('a.example', { all: true })).toEqual([null, answer]);
        expect(await ask('a.example')).toEqual([null, '93.184.216.34', 4]);
        expect(await ask('a.example', { all: false })).toEqual([null, '93.184.216.34', 4]);
      });

      it('asks the resolver for every address, passing the socket’s other options on', async () => {
        await ask('a.example', { family: 4 });
        expect(dns).toHaveBeenCalledWith('a.example', { family: 4, all: true });
        await ask('b.example', { all: false });
        expect(dns).toHaveBeenLastCalledWith('b.example', { all: true });
      });

      it('refuses a name with any private address, or none, in either answer shape', async () => {
        const refusals: Found[][] = [
          [v4('10.0.0.1')],
          [v4('93.184.216.34'), v4('127.0.0.1')],
          [v4('127.0.0.1'), v4('93.184.216.34')],
          [{ address: '::ffff:169.254.169.254', family: 6 }],
          [{ address: '64:ff9b::7f00:1', family: 6 }],
          [{ address: '::ffff:8.8.8.8', family: 6 }],
          [{ address: '2001::5', family: 6 }],
          [{ address: '100::1', family: 6 }],
          [v4('not-an-ip')],
          [],
        ];
        for (const answer of refusals) {
          dns.mockResolvedValue(answer);
          for (const options of [{ all: true }, {}]) {
            const [err, address] = await ask('evil.example', options);
            expect(err, JSON.stringify(answer)).toBeInstanceOf(BlockedUrlError);
            expect(address).toEqual([]);
          }
        }
      });

      it('passes a resolver error on unchanged', async () => {
        const boom = Object.assign(new Error('getaddrinfo ENOTFOUND a.example'), {
          code: 'ENOTFOUND',
        });
        dns.mockRejectedValue(boom);
        const [err] = await ask('a.example', { all: true });
        expect(err).toBe(boom);
      });
    });

    it('takes only text/html and application/xhtml+xml', async () => {
      const wrong = [
        'application/json',
        'image/png',
        'text/plain',
        'application/pdf',
        'text/htmlx',
      ];
      for (const type of wrong) {
        serve.mockImplementation(async () => page('<title>x</title>', { 'Content-Type': type }));
        await upstreamFailure(await extract('https://shop.example/p'));
      }
      // Bytes carry no default type, unlike a string body.
      serve.mockImplementation(async () => new Response(new Uint8Array([60, 62])));
      await upstreamFailure(await extract('https://shop.example/p'));

      const right = [
        'text/html',
        'TEXT/HTML; charset=ISO-8859-1',
        'application/xhtml+xml',
        'application/xhtml+xml; charset=utf-8',
      ];
      for (const type of right) {
        serve.mockImplementation(async () => page('<title>x</title>', { 'Content-Type': type }));
        expect((await extract('https://shop.example/p')).status, type).toBe(200);
      }
    });

    it('answers 502 without details for an error status, a network error or a DNS failure', async () => {
      serve.mockImplementation(
        async () => new Response('<title>Gone</title>', { status: 404, headers: HTML }),
      );
      await upstreamFailure(await extract('https://shop.example/p'));

      serve.mockImplementation(async () => {
        throw new TypeError('fetch failed: ECONNREFUSED 10.1.2.3:443 /secret/path');
      });
      await upstreamFailure(await extract('https://shop.example/p'));

      dns.mockRejectedValue(new Error('getaddrinfo ENOTFOUND shop.example'));
      await upstreamFailure(await extract('https://shop.example/p'));
    });

    it('caches a successful read for an hour', async () => {
      serve.mockImplementation(async () => page('<title>x</title>'));
      const res = await extract('https://shop.example/p');
      expect(res.headers.get('Cache-Control')).toBe('s-maxage=3600');
    });

    it('prefers JSON-LD Product, with an offers object and a numeric price', async () => {
      expect(
        await read(
          ld({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'Trail Shoe',
            offers: { '@type': 'Offer', price: 89.5, priceCurrency: 'EUR' },
          }),
        ),
      ).toEqual({ name: 'Trail Shoe', price: 89.5, currency: 'EUR' });
    });

    it('reads the first offer with a usable price from an offers array of string prices', async () => {
      expect(
        await read(
          ld({
            '@type': 'Product',
            name: 'Laptop',
            offers: [
              { '@type': 'Offer', price: '', priceCurrency: 'JPY' },
              { '@type': 'Offer', price: '1,299.00', priceCurrency: 'usd' },
              { '@type': 'Offer', price: '5', priceCurrency: 'GBP' },
            ],
          }),
        ),
      ).toEqual({ name: 'Laptop', price: 1299, currency: 'USD' });
    });

    it('finds the Product inside an @graph, a top-level array or a later script', async () => {
      const product = {
        '@type': ['Product', 'Thing'],
        name: 'Lamp',
        offers: { price: '19,99', priceCurrency: 'EUR' },
      };
      const want = { name: 'Lamp', price: 19.99, currency: 'EUR' };
      expect(await read(ld({ '@graph': [{ '@type': 'WebSite', name: 'Shop' }, product] }))).toEqual(
        want,
      );
      expect(await read(ld([{ '@type': 'BreadcrumbList' }, product]))).toEqual(want);
      expect(
        await read(
          [
            '<script type="application/ld+json">{ not json </script>',
            '<script type="application/json">{"@type":"Product","name":"Wrong","offers":{"price":1}}</script>',
            '<script>var x = {"@type":"Product","name":"Wrong"}</script>',
            ld({ '@type': 'Organization', name: 'Shop' }),
            ld(product),
          ].join('\n'),
        ),
      ).toEqual(want);
      const schemaUrl = JSON.stringify({ ...product, '@type': 'https://schema.org/Product' });
      expect(
        await read(`<SCRIPT data-x="1" TYPE='application/ld+json'>${schemaUrl}</SCRIPT>`),
      ).toEqual(want);
    });

    it('finds a Product inside an ItemList and prices it through offers.priceSpecification', async () => {
      const listed = (offers: unknown) =>
        ld({
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'Organization', name: 'IKEA' },
            {
              '@type': 'ItemList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  item: { '@type': 'Product', name: 'BILLY Bookcase', offers },
                },
                {
                  '@type': 'ListItem',
                  position: 2,
                  item: { '@type': 'Product', name: 'Another', offers: { price: 5 } },
                },
              ],
            },
          ],
        });
      const want = { name: 'BILLY Bookcase', price: 79, currency: 'USD' };
      const spec = { '@type': 'UnitPriceSpecification', price: 79, priceCurrency: 'USD' };
      expect(await read(listed({ '@type': 'Offer', priceSpecification: [spec] }))).toEqual(want);
      // An object works as well as an array, and the first specification with a price is the one taken.
      expect(await read(listed({ priceSpecification: spec }))).toEqual(want);
      expect(
        await read(listed({ priceSpecification: [{ priceCurrency: 'EUR' }, spec, { price: 1 }] })),
      ).toEqual(want);
      // `price` comes first, and a price keeps the currency of the element that gave it: the
      // offer's, never the specification's.
      expect(await read(listed({ price: '80', priceSpecification: [spec] }))).toEqual({
        ...want,
        price: 80,
        currency: null,
      });
      expect(
        await read(listed({ price: '80', priceCurrency: 'gbp', priceSpecification: [spec] })),
      ).toEqual({ ...want, price: 80, currency: 'GBP' });
      // A list may also hold the Product itself, without a ListItem around it.
      expect(
        await read(
          ld({
            '@type': 'ItemList',
            itemListElement: [{ '@type': 'Product', name: 'Bare', offers: { price: 3 } }],
          }),
        ),
      ).toEqual({ name: 'Bare', price: 3, currency: null });
    });

    it('takes a ProductGroup name and its first variant with offers', async () => {
      const group = {
        '@context': 'https://schema.org',
        '@type': 'ProductGroup',
        name: 'Arrival Shorts',
        hasVariant: [
          { '@type': 'Product', name: 'Arrival Shorts - Unpriced' },
          {
            '@type': 'Product',
            name: 'Arrival Shorts - S',
            offers: [{ '@type': 'Offer', price: '35.00', priceCurrency: 'USD' }],
          },
          {
            '@type': 'Product',
            name: 'Arrival Shorts - M',
            offers: { '@type': 'Offer', price: '40.00', priceCurrency: 'USD' },
          },
        ],
      };
      expect(await read(ld(group))).toEqual({ name: 'Arrival Shorts', price: 35, currency: 'USD' });
      // The group's own offers come before any variant's.
      const own = { ...group, offers: { price: 30, priceCurrency: 'EUR' } };
      expect(await read(ld(own))).toEqual({ name: 'Arrival Shorts', price: 30, currency: 'EUR' });
      // Inside an @graph too, and a variant that has offers without a usable price is passed over.
      const unusable = {
        ...group,
        hasVariant: [{ '@type': 'Product', offers: { price: 'ask' } }, ...group.hasVariant],
      };
      expect(await read(ld({ '@graph': [{ '@type': 'WebPage' }, unusable] }))).toEqual({
        name: 'Arrival Shorts',
        price: 35,
        currency: 'USD',
      });
    });

    it('prices an AggregateOffer by its lowPrice, after price and priceSpecification', async () => {
      const aggregate = {
        '@type': 'AggregateOffer',
        lowPrice: '19.99',
        highPrice: '49',
        priceCurrency: 'EUR',
      };
      const product = (offers: unknown) => ld({ '@type': 'Product', name: 'Lamp', offers });
      expect(await read(product(aggregate))).toEqual({
        name: 'Lamp',
        price: 19.99,
        currency: 'EUR',
      });
      expect(await read(product({ ...aggregate, price: 25 }))).toMatchObject({ price: 25 });
      expect(
        await read(
          product({ ...aggregate, priceSpecification: { price: 22, priceCurrency: 'GBP' } }),
        ),
      ).toEqual({ name: 'Lamp', price: 22, currency: 'GBP' });
      // A specification's price takes the specification's currency, not the offer's.
      expect(
        await read(product({ priceCurrency: 'EUR', priceSpecification: { price: 22 } })),
      ).toEqual({ name: 'Lamp', price: 22, currency: null });
      expect(await read(product({ '@type': 'AggregateOffer', highPrice: 49 }))).toMatchObject({
        price: null,
      });
    });

    it('walks JSON-LD only 8 levels deep and 500 nodes wide', async () => {
      const product = {
        '@type': 'Product',
        name: 'Deep',
        offers: { price: 9, priceCurrency: 'USD' },
      };
      const found = { name: 'Deep', price: 9, currency: 'USD' };
      const missed = { name: 'Fallback', price: null, currency: null };
      const withFallback = (data: unknown) => `<title>Fallback</title>${ld(data)}`;

      // The root is level 0, and each nested object or array is one level further.
      const nested = (levels: number) =>
        Array.from({ length: levels }).reduce<unknown>((inner) => ({ item: inner }), product);
      expect(await read(withFallback(nested(7)))).toEqual(found);
      expect(await read(withFallback(nested(8)))).toEqual(missed);
      // Far deeper than JSON.stringify itself could write.
      const deep = `${'{"item":'.repeat(5000)}${JSON.stringify(product)}${'}'.repeat(5000)}`;
      const script = `<script type="application/ld+json">${deep}</script>`;
      expect(await read(`<title>Fallback</title>${script}`)).toEqual(missed);

      // The root counts as the first node, so the Product is the 500th here and the 501st below.
      const filler = (n: number) => Array.from({ length: n }, () => ({ '@type': 'Thing' }));
      expect(await read(withFallback({ '@graph': [...filler(498), product] }))).toEqual(found);
      expect(await read(withFallback({ '@graph': [...filler(499), product] }))).toEqual(missed);
      expect(await read(withFallback({ '@graph': [...filler(20_000), product] }))).toEqual(missed);
    });

    it('turns price spellings into a number of major units, or null', async () => {
      const cases: Array<[unknown, number | null]> = [
        [12, 12],
        [0.99, 0.99],
        ['12', 12],
        ['12.50', 12.5],
        ['$1,299.00', 1299],
        ['EUR 1.299,00', 1299],
        ['19,99', 19.99],
        ['1,299', 1299],
        [' 42 ', 42],
        [0, null],
        ['0', null],
        [-5, null],
        ['', null],
        ['free', null],
        ['1.2.3', null],
        ['From $5 to $9', null],
        ['.99', 0.99],
        ['Price: 5.', 5],
        [Number.NaN, null],
        ['9'.repeat(400), null],
        [null, null],
        [undefined, null],
        [{}, null],
        [['9'], null],
        [true, null],
      ];
      for (const [price, want] of cases) {
        const body = ld({ '@type': 'Product', name: 'X', offers: { price } });
        expect(await read(body), JSON.stringify(price)).toMatchObject({ name: 'X', price: want });
      }
      expect(await read(ld({ '@type': 'Product', name: 'X' }))).toEqual({
        name: 'X',
        price: null,
        currency: null,
      });
    });

    it('returns a three-letter currency in capitals, or null', async () => {
      const cases: Array<[unknown, string | null]> = [
        ['EUR', 'EUR'],
        ['eur', 'EUR'],
        ['dollars', null],
        ['US', null],
        ['', null],
        [978, null],
        [null, null],
      ];
      for (const [priceCurrency, want] of cases) {
        const body = ld({ '@type': 'Product', name: 'X', offers: { price: 5, priceCurrency } });
        expect(await read(body), JSON.stringify(priceCurrency)).toMatchObject({ currency: want });
      }
    });

    it('falls back to OpenGraph title, product price and currency, in any attribute order', async () => {
      const want = { name: "Desk & Chair's", price: 249, currency: 'GBP' };
      expect(
        await read(
          [
            '<title>Ignored</title>',
            '<meta property="og:title" content="Desk &amp; Chair&#39;s">',
            '<meta property="product:price:amount" content="249.00">',
            '<meta property="product:price:currency" content="GBP">',
          ].join('\n'),
        ),
      ).toEqual(want);
      expect(
        await read(
          [
            `<meta content='Desk &amp; Chair&#x27;s' property='og:title' />`,
            '<meta content="249,00" name="product:price:amount"/>',
            '<META CONTENT="GBP" PROPERTY="PRODUCT:PRICE:CURRENCY">',
          ].join('\n'),
        ),
      ).toEqual(want);
    });

    it('also reads the og:price spelling Shopify stores use, over several lines', async () => {
      const shopify = [
        `<meta property='og:title' content='Men&#39;s Tree Runner'>`,
        `<meta\n    property='og:price:amount'\n    content='100.00'\n  >`,
        `<meta property='og:price:currency' content='USD'>`,
      ].join('\n');
      expect(await read(shopify)).toEqual({
        name: "Men's Tree Runner",
        price: 100,
        currency: 'USD',
      });
      // The product: spelling wins when a page has both.
      const both = `${shopify}<meta property="product:price:amount" content="90"><meta property="product:price:currency" content="EUR">`;
      expect(await read(both)).toEqual({ name: "Men's Tree Runner", price: 90, currency: 'EUR' });
    });

    it('prefers JSON-LD over OpenGraph over the title', async () => {
      const og = [
        '<title>Page title</title>',
        '<meta property="og:title" content="OG title">',
        '<meta property="product:price:amount" content="30">',
        '<meta property="product:price:currency" content="USD">',
      ].join('');
      const priced = {
        '@type': 'Product',
        name: 'LD name',
        offers: { price: 10, priceCurrency: 'EUR' },
      };
      expect(await read(og + ld(priced))).toEqual({ name: 'LD name', price: 10, currency: 'EUR' });
      // A Product with no name or priced offer leaves those to the next source.
      const bare = { '@type': 'Product', offers: { priceCurrency: 'EUR' } };
      expect(await read(og + ld(bare))).toEqual({ name: 'OG title', price: 30, currency: 'USD' });
      // A price keeps the currency of its own source, never another's.
      const noCurrency = { '@type': 'Product', name: 'LD name', offers: { price: 10 } };
      expect(await read(og + ld(noCurrency))).toEqual({
        name: 'LD name',
        price: 10,
        currency: null,
      });
      expect(await read(og)).toEqual({ name: 'OG title', price: 30, currency: 'USD' });
      expect(
        await read('<title>Page title</title><meta property="og:description" content="x">'),
      ).toEqual({ name: 'Page title', price: null, currency: null });
    });

    it('falls back to the <title>, tidied, and to nulls when there is nothing', async () => {
      const messy =
        '<html><head><title lang="en">\n  Standing\n   Desk &amp; Mat | Shop \n</title>';
      expect(await read(messy)).toEqual({
        name: 'Standing Desk & Mat | Shop',
        price: null,
        currency: null,
      });
      const empty = ['', '<html><body>Hello</body></html>', '<title></title>', '<title>  </title>'];
      for (const body of empty) {
        expect(await read(body), body).toEqual({ name: null, price: null, currency: null });
      }
    });

    it('caps a name at 200 characters', async () => {
      expect((await read(`<title>${'n'.repeat(500)}</title>`)).name).toBe('n'.repeat(200));
      expect((await read(ld({ '@type': 'Product', name: 'p'.repeat(500) }))).name).toBe(
        'p'.repeat(200),
      );
    });

    it('stays fast on a page built to make the parser backtrack', async () => {
      const bodies = [
        '<script type="application/ld+json">'.repeat(55_000),
        '<script '.repeat(250_000),
        '<meta '.repeat(300_000),
        '<title '.repeat(280_000),
        `<title>${'<'.repeat(2_000_000)}`,
      ];
      for (const body of bodies) {
        expect(await read(body)).toEqual({ name: null, price: null, currency: null });
      }
    });
  });
});
