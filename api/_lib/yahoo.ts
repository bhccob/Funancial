import YahooFinance from 'yahoo-finance2';

// Thin wrapper over yahoo-finance2: raw Yahoo data in, no validation or shaping.
// The routes own that, so tests that mock this module still exercise it.

export interface RawQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  currency?: string;
  quoteType?: string;
  fullExchangeName?: string;
  regularMarketTime?: Date;
}

export interface RawProfile {
  shortName?: string | null;
  longName?: string | null;
  quoteType?: string;
  exchangeName?: string;
  currency?: string;
  sector?: string;
  /** The company's own site (most ETFs have none); the logo route looks up its icon. */
  website?: string;
}

export interface RawDividends {
  currency: string;
  history: Array<{ date: Date; amount: number }>;
  exDividendDate?: Date;
  dividendDate?: Date;
}

export interface RawNewsItem {
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: Date;
}

export interface RawFxRate {
  rate: number;
  asOf: Date;
}

const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const MINOR_UNITS: Record<string, string> = { GBp: 'GBP', ZAc: 'ZAR', ILA: 'ILS' };

/** Yahoo quotes some markets in a hundredth of the currency (pence, cents, agorot). */
export function normalise(price: number, currency: string): { price: number; currency: string } {
  const major = MINOR_UNITS[currency];
  return major ? { price: price / 100, currency: major } : { price, currency };
}

export function assetType(quoteType: string | undefined): 'stock' | 'etf' | 'other' {
  return quoteType === 'EQUITY' ? 'stock' : quoteType === 'ETF' ? 'etf' : 'other';
}

/** One retry after 500ms when Yahoo answers 429 Too Many Requests. */
async function retried<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code !== 429) throw err;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return call();
  }
}

export function getQuotes(symbols: string[]): Promise<RawQuote[]> {
  return retried(() => yahoo.quote(symbols)) as Promise<RawQuote[]>;
}

export function getProfile(symbol: string): Promise<RawProfile> {
  return retried(async () => {
    const { price, assetProfile } = await yahoo.quoteSummary(symbol, {
      modules: ['price', 'assetProfile'],
    });
    return { ...price, sector: assetProfile?.sector, website: assetProfile?.website };
  });
}

// Yahoo has no calendar for ETFs and says so with this message; any other failure is real.
const NO_CALENDAR = 'No fundamentals data found';

export async function getDividends(symbol: string): Promise<RawDividends> {
  const since = new Date();
  since.setUTCFullYear(since.getUTCFullYear() - 5);
  const [chart, summary] = await Promise.all([
    retried(() => yahoo.chart(symbol, { period1: since, interval: '1mo', events: 'div' })),
    retried(() => yahoo.quoteSummary(symbol, { modules: ['calendarEvents'] })).catch((err) => {
      if (err instanceof Error && err.message.startsWith(NO_CALENDAR)) return undefined;
      throw err;
    }),
  ]);
  return {
    currency: chart.meta.currency ?? '',
    history: chart.events?.dividends ?? [],
    exDividendDate: summary?.calendarEvents?.exDividendDate,
    dividendDate: summary?.calendarEvents?.dividendDate,
  };
}

export async function getNews(symbol: string): Promise<RawNewsItem[]> {
  const { news } = await retried(() => yahoo.search(symbol, { newsCount: 10, quotesCount: 0 }));
  return news.map(({ title, publisher, link, providerPublishTime }) => ({
    title,
    publisher,
    link,
    providerPublishTime,
  }));
}

export interface RawSearchQuote {
  [key: string]: unknown;
  symbol?: string;
  quoteType?: string;
  longname?: string;
  shortname?: string;
  exchDisp?: string;
  exchange?: string;
}

export async function search(q: string): Promise<RawSearchQuote[]> {
  const { quotes } = await retried(() => yahoo.search(q, { quotesCount: 10, newsCount: 0 }));
  return quotes;
}

export interface RawHistory {
  currency: string;
  /** The exchange's, such as Europe/Amsterdam: a bar is stamped at its local midnight or open. */
  timeZone: string;
  quotes: Array<{ date: Date; close: number | null }>;
}

/** The closes from `period1` on, one per `interval`; Yahoo's own, not yet turned into days or pounds. */
export async function history(
  symbol: string,
  period1: Date,
  interval: '1d' | '1wk' | '1mo',
): Promise<RawHistory> {
  const { meta, quotes } = await retried(() => yahoo.chart(symbol, { period1, interval }));
  return { currency: meta.currency ?? '', timeZone: meta.exchangeTimezoneName, quotes };
}

export async function getFxRate(from: string, to: string): Promise<RawFxRate> {
  const [pair] = await retried(() => yahoo.quote([`${from}${to}=X`]));
  if (!pair?.regularMarketPrice || !pair.regularMarketTime) throw new Error('no rate for pair');
  return { rate: pair.regularMarketPrice, asOf: pair.regularMarketTime };
}
