import { badRequest, guard, json, parseSymbol, preflight, upstream } from './_lib/http.js';
import { getDividends, normalise } from './_lib/yahoo.js';

export const OPTIONS = preflight;

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const symbol = parseSymbol(new URL(req.url).searchParams.get('symbol'));
  if (!symbol) return badRequest(req);

  try {
    const raw = await getDividends(symbol);
    const history = raw.history
      .map((d) => ({ date: day(d.date), amount: normalise(d.amount, raw.currency).price }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const exDate = raw.exDividendDate ? day(raw.exDividendDate) : null;
    const payDate = raw.dividendDate ? day(raw.dividendDate) : null;
    // Yahoo gives dates but no amount for the next payout, so the last paid amount stands in.
    const amount =
      (exDate || payDate) && history.length ? history[history.length - 1]!.amount : null;
    return json(
      req,
      {
        symbol,
        currency: normalise(0, raw.currency).currency,
        history,
        next: { exDate, payDate, amount },
      },
      's-maxage=21600',
    );
  } catch (err) {
    return upstream(req, err);
  }
}
