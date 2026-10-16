import { badRequest, guard, json, preflight, upstream } from './_lib/http.js';
import { getFxRate } from './_lib/yahoo.js';

export const OPTIONS = preflight;

const CURRENCY = /^[A-Z]{3}$/;

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const params = new URL(req.url).searchParams;
  const from = params.get('from');
  const to = params.get('to');
  if (!from || !to || !CURRENCY.test(from) || !CURRENCY.test(to)) return badRequest(req);

  const cache = 's-maxage=3600';
  if (from === to) return json(req, { from, to, rate: 1, asOf: new Date().toISOString() }, cache);
  try {
    const { rate, asOf } = await getFxRate(from, to);
    return json(req, { from, to, rate, asOf: asOf.toISOString() }, cache);
  } catch (err) {
    return upstream(req, err);
  }
}
