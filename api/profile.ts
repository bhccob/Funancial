import { badRequest, guard, json, parseSymbol, preflight, upstream } from './_lib/http.js';
import { assetType, getProfile, normalise } from './_lib/yahoo.js';

export const OPTIONS = preflight;

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const symbol = parseSymbol(new URL(req.url).searchParams.get('symbol'));
  if (!symbol) return badRequest(req);

  try {
    const p = await getProfile(symbol);
    if (!p.currency) throw new Error('profile without a currency');
    const type = assetType(p.quoteType);
    return json(
      req,
      {
        symbol,
        name: p.longName ?? p.shortName ?? symbol,
        type,
        exchange: p.exchangeName ?? null,
        currency: normalise(0, p.currency).currency,
        sector: type === 'etf' ? null : (p.sector ?? null),
      },
      's-maxage=86400',
    );
  } catch (err) {
    return upstream(req, err);
  }
}
