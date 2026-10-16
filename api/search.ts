import { badRequest, guard, json, parseSymbol, preflight, upstream } from './_lib/http.js';
import { assetType, search } from './_lib/yahoo.js';

export const OPTIONS = preflight;

const QUERY = /^[\p{L}\p{N} .&'-]{1,40}$/u;
const MAX_RESULTS = 8;

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!QUERY.test(q)) return badRequest(req);

  try {
    const results = (await search(q))
      .flatMap((r) => {
        const type = assetType(r.quoteType);
        const symbol = parseSymbol(r.symbol ?? null);
        if (type === 'other' || !symbol) return [];
        return [
          {
            symbol,
            name: r.longname ?? r.shortname ?? symbol,
            exchange: r.exchDisp ?? r.exchange ?? null,
            type,
          },
        ];
      })
      .slice(0, MAX_RESULTS);
    return json(req, { results }, 's-maxage=86400');
  } catch (err) {
    return upstream(req, err);
  }
}
