import { badRequest, guard, json, parseSymbol, preflight, upstream } from './_lib/http.js';
import { history, normalise } from './_lib/yahoo.js';

export const OPTIONS = preflight;

const DAY_MS = 86_400_000;
const DAILY_DAYS = 92;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The start of a `YYYY-MM-DD` day in UTC, or null when it is not a real day from 1970 on. */
function startOf(day: string | null): number | null {
  if (!day || !DATE.test(day)) return null;
  const start = Date.parse(`${day}T00:00:00Z`);
  // 2026-02-30 parses as March 2nd, so only a day that prints back as itself is real.
  return start >= 0 && new Date(start).toISOString().startsWith(day) ? start : null;
}

/** The calendar day of `at` on the exchange's clock, so a weekly bar stamped at Amsterdam midnight stays that Monday. */
function dayIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC' }).format(at);
}

/** Daily closes for the last 92 days, weekly for 2 years, monthly beyond that. */
function intervalFor(start: number, today: number): '1d' | '1wk' | '1mo' {
  if (today - start <= DAILY_DAYS * DAY_MS) return '1d';
  const t = new Date(today);
  return start >= Date.UTC(t.getUTCFullYear() - 2, t.getUTCMonth(), t.getUTCDate()) ? '1wk' : '1mo';
}

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const params = new URL(req.url).searchParams;
  const symbol = parseSymbol(params.get('symbol'));
  const start = startOf(params.get('from'));
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  if (!symbol || start === null || start > today) return badRequest(req);

  try {
    const raw = await history(symbol, new Date(start), intervalFor(start, today));
    const points = raw.quotes
      .flatMap((q) =>
        q.close === null
          ? []
          : [
              {
                date: dayIn(q.date, raw.timeZone),
                close: normalise(q.close, raw.currency).price,
              },
            ],
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    return json(
      req,
      { symbol, currency: normalise(0, raw.currency).currency, points },
      's-maxage=3600',
    );
  } catch (err) {
    return upstream(req, err);
  }
}
