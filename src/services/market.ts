import type { LocalDate } from '@/domain/dates';
import type { Holding } from '@/domain/entities';

/** The price service could not be reached, or did not answer well. */
export class MarketError extends Error {
  constructor() {
    super("Couldn't reach the price service.");
    this.name = 'MarketError';
  }
}

/** The service takes at most this many symbols per request. */
const MAX_SYMBOLS = 25;

export type Quote = {
  symbol: string;
  name: string;
  price: number;
  previousClose: number | null;
  currency: string;
  type: Holding['type'];
  exchange: string | null;
  asOf: string;
};
export type QuotesResponse = { quotes: Quote[]; missing: string[] };
export type ProfileResponse = {
  symbol: string;
  name: string;
  type: Holding['type'];
  exchange: string | null;
  currency: string;
  sector: string | null;
};
export type DividendsResponse = {
  symbol: string;
  currency: string;
  history: Array<{ date: LocalDate; amount: number }>;
  next: { exDate: LocalDate | null; payDate: LocalDate | null; amount: number | null };
};
export type NewsItem = {
  symbol: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
};
export type NewsResponse = { items: NewsItem[] };
export type FxResponse = { from: string; to: string; rate: number; asOf: string };
export type SearchResult = {
  symbol: string;
  name: string;
  exchange: string | null;
  type: 'stock' | 'etf';
};
export type SearchResponse = { results: SearchResult[] };
/** Closes oldest first, in the trading currency, one per day, week or month by how far back it goes. */
export type HistoryResponse = {
  symbol: string;
  currency: string;
  points: Array<{ date: LocalDate; close: number }>;
};

/** Live prices need a token; without one the app never asks. */
export const marketConfigured = (): boolean => Boolean(import.meta.env.VITE_FUNANCIAL_API_TOKEN);

/** The price service's address for a route and its query. */
export const serviceUrl = (route: string, params: Record<string, string>): string =>
  `${import.meta.env.VITE_FUNANCIAL_API_URL ?? ''}/api/${route}?${new URLSearchParams(params)}`;

/** A GET of one of its addresses with the token, ending after 10 s. The caller reads the status. */
export const serviceFetch = (url: string): Promise<Response> =>
  fetch(url, {
    headers: { 'X-Funancial-Token': import.meta.env.VITE_FUNANCIAL_API_TOKEN ?? '' },
    signal: AbortSignal.timeout(10_000),
  });

async function get<T>(route: string, params: Record<string, string>): Promise<T> {
  try {
    const res = await serviceFetch(serviceUrl(route, params));
    if (!res.ok) throw new Error(`The price service answered ${res.status}`);
    return (await res.json()) as T;
  } catch {
    // Offline, a timeout, an error status or a body that is not JSON all read the same to the app.
    throw new MarketError();
  }
}

/** Symbols are sent upper-case, as Holding.symbol is. A long list goes out in as many requests as it needs. */
export async function fetchQuotes(symbols: string[]): Promise<QuotesResponse> {
  const parts = await Promise.all(
    Array.from({ length: Math.ceil(symbols.length / MAX_SYMBOLS) }, (_, i) =>
      get<QuotesResponse>('quote', {
        symbols: symbols
          .slice(i * MAX_SYMBOLS, (i + 1) * MAX_SYMBOLS)
          .join(',')
          .toUpperCase(),
      }),
    ),
  );
  return { quotes: parts.flatMap((p) => p.quotes), missing: parts.flatMap((p) => p.missing) };
}

export const fetchProfile = (symbol: string) =>
  get<ProfileResponse>('profile', { symbol: symbol.toUpperCase() });

export const fetchDividends = (symbol: string) =>
  get<DividendsResponse>('dividends', { symbol: symbol.toUpperCase() });

// shortcut: news goes out as one request, so more than 25 symbols is refused by the service; split
// and merge by link as `fetchQuotes` splits if the news tab ever needs more.
export const fetchNews = (symbols: string[]) =>
  get<NewsResponse>('news', { symbols: symbols.join(',').toUpperCase() });

export const fetchFx = (from: string, to: string) => get<FxResponse>('fx', { from, to });

export const fetchSearch = (q: string) => get<SearchResponse>('search', { q });

export const fetchHistory = (symbol: string, from: LocalDate) =>
  get<HistoryResponse>('history', { symbol: symbol.toUpperCase(), from });

/** What the actions need from the price service; tests hand them a fake. */
export const market = {
  fetchQuotes,
  fetchProfile,
  fetchDividends,
  fetchNews,
  fetchFx,
  fetchSearch,
  fetchHistory,
};
export type Market = typeof market;
