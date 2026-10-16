import { createHash, timingSafeEqual } from 'node:crypto';

const ORIGINS = ['http://localhost:5173', 'capacitor://localhost', 'https://localhost'];
const SYMBOL = /^[A-Za-z0-9.^=-]{1,15}$/;
const MAX_SYMBOLS = 25;

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  return origin && [...ORIGINS, process.env.FUNANCIAL_APP_ORIGIN].includes(origin) ? origin : null;
}

// Vary on Origin and the token so a shared cache never replays a response across either.
function headers(req: Request, extra: Record<string, string>): Headers {
  const h = new Headers({ ...extra, Vary: 'Origin, X-Funancial-Token' });
  const origin = allowedOrigin(req);
  if (origin) h.set('Access-Control-Allow-Origin', origin);
  return h;
}

export function json(req: Request, body: unknown, cacheControl: string, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers(req, { 'Content-Type': 'application/json', 'Cache-Control': cacheControl }),
  });
}

export const badRequest = (req: Request) => json(req, { error: 'bad request' }, 'no-store', 400);

export function upstream(req: Request, err: unknown): Response {
  // The reason stays in the server log; the body never carries it.
  console.error('[api] upstream failure:', err instanceof Error ? err.message : err);
  return json(req, { error: 'upstream' }, 'no-store', 502);
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Null when the request may proceed, otherwise the response to send. */
export function guard(req: Request): Response | null {
  const expected = process.env.FUNANCIAL_ACCESS_TOKEN;
  if (!expected) return json(req, { error: 'not configured' }, 'no-store', 500);
  // Hashing first gives timingSafeEqual equal-length inputs, so the length never leaks.
  const given = req.headers.get('X-Funancial-Token') ?? '';
  if (!timingSafeEqual(digest(given), digest(expected))) {
    return json(req, { error: 'unauthorized' }, 'no-store', 401);
  }
  return null;
}

export function preflight(req: Request): Response {
  const extra = {
    'Access-Control-Allow-Headers': 'X-Funancial-Token',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
  // A disallowed origin gets no Allow-Origin, which is what makes the browser refuse it.
  return new Response(null, { status: 204, headers: headers(req, extra) });
}

/** Comma-separated symbols, or null when any is malformed, none is given or there are over 25. */
export function parseSymbols(param: string | null): string[] | null {
  if (!param) return null;
  const parts = param.split(',');
  return parts.length <= MAX_SYMBOLS && parts.every((s) => SYMBOL.test(s))
    ? [...new Set(parts)]
    : null;
}

/** Exactly one symbol, or null. */
export function parseSymbol(param: string | null): string | null {
  const symbols = parseSymbols(param);
  return symbols?.length === 1 ? (symbols[0] ?? null) : null;
}
