import { badRequest, guard, json, parseSymbols, preflight, upstream } from './_lib/http.js';
import { assetType, getQuotes, normalise } from './_lib/yahoo.js';

export const OPTIONS = preflight;

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const symbols = parseSymbols(new URL(req.url).searchParams.get('symbols'));
  if (!symbols) return badRequest(req);

  try {
    const quotes = (await getQuotes(symbols)).flatMap((q) => {
      const { regularMarketPrice: price, regularMarketPreviousClose: previous } = q;
      if (typeof price !== 'number' || !q.currency || !q.regularMarketTime) return [];
      const now = normalise(price, q.currency);
      return {
        symbol: q.symbol,
        name: q.longName ?? q.shortName ?? q.symbol,
        price: now.price,
        previousClose: typeof previous === 'number' ? normalise(previous, q.currency).price : null,
        currency: now.currency,
        type: assetType(q.quoteType),
        exchange: q.fullExchangeName ?? null,
        asOf: q.regularMarketTime.toISOString(),
      };
    });
    const found = new Set(quotes.map((q) => q.symbol.toUpperCase()));
    const missing = symbols.filter((s) => !found.has(s.toUpperCase()));
    return json(req, { quotes, missing }, 's-maxage=60, stale-while-revalidate=60');
  } catch (err) {
    return upstream(req, err);
  }
}
