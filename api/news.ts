import { badRequest, guard, json, parseSymbols, preflight, upstream } from './_lib/http.js';
import { getNews } from './_lib/yahoo.js';

export const OPTIONS = preflight;

const PER_SYMBOL = 10;

type Item = { symbol: string; title: string; publisher: string; url: string; publishedAt: string };

const isWebUrl = (link: string) => URL.canParse(link) && /^https?:$/.test(new URL(link).protocol);
const newestFirst = (a: Item, b: Item) => b.publishedAt.localeCompare(a.publishedAt);

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const symbols = parseSymbols(new URL(req.url).searchParams.get('symbols'));
  if (!symbols) return badRequest(req);

  try {
    const perSymbol = await Promise.all(
      symbols.map(async (symbol) =>
        (await getNews(symbol))
          .filter((n) => isWebUrl(n.link))
          .map((n) => ({
            symbol,
            title: n.title,
            publisher: n.publisher,
            url: n.link,
            publishedAt: n.providerPublishTime.toISOString(),
          }))
          .sort(newestFirst)
          .slice(0, PER_SYMBOL),
      ),
    );
    // A story tagged to two symbols is listed once, under the first one asked for.
    const byUrl = new Map<string, Item>();
    for (const item of perSymbol.flat()) if (!byUrl.has(item.url)) byUrl.set(item.url, item);
    return json(req, { items: [...byUrl.values()].sort(newestFirst) }, 's-maxage=3600');
  } catch (err) {
    return upstream(req, err);
  }
}
