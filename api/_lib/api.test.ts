import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as dividendsGET } from '../dividends.js';
import { GET as fxGET } from '../fx.js';
import { GET as newsGET } from '../news.js';
import { GET as profileGET } from '../profile.js';
import { GET as quoteGET, OPTIONS as quoteOPTIONS } from '../quote.js';
import { parseSymbols } from './http.js';
import * as yahoo from './yahoo.js';

vi.mock('./yahoo.js', async (orig) => ({
  ...(await orig<typeof import('./yahoo.js')>()),
  getQuotes: vi.fn(),
  getProfile: vi.fn(),
  getDividends: vi.fn(),
  getNews: vi.fn(),
  getFxRate: vi.fn(),
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
    expect(ok.headers.get('Access-Control-Allow-Headers')).toBe('X-Funancial-Token');
    expect(ok.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
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
});
