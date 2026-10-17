import { createHash, timingSafeEqual } from 'node:crypto';
import { isIPv6 } from 'node:net';

const ORIGINS = ['http://localhost:5173', 'capacitor://localhost', 'https://localhost'];
const SYMBOL = /^[A-Za-z0-9.^=-]{1,15}$/;
const MAX_SYMBOLS = 25;
/** The largest JSON body an account route reads: a 1,000,000-byte copy plus its envelope. */
export const MAX_BODY_BYTES = 1_500_000;

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

/** A response with no body (204), for the routes that answer with nothing. */
export const empty = (req: Request, status = 204) =>
  new Response(null, { status, headers: headers(req, { 'Cache-Control': 'no-store' }) });

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
    'Access-Control-Allow-Headers': 'X-Funancial-Token, Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    // So a browser asks once a day, not before every request (it may cap the time lower).
    'Access-Control-Max-Age': '86400',
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

/**
 * The request's JSON body, or the status to answer with: 413 over `max` bytes (counted as it is read,
 * so a body that lies about its length, or has none, is cut off too), 400 when it isn't JSON.
 */
export async function readJson(
  req: Request,
  max = MAX_BODY_BYTES,
): Promise<{ value: unknown } | { status: 400 | 413 }> {
  if (Number(req.headers.get('Content-Length')) > max) return { status: 413 };
  const reader = req.body?.getReader();
  if (!reader) return { status: 400 };
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return { status: 413 };
    }
    chunks.push(value);
  }
  try {
    return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { status: 400 };
  }
}

/**
 * What a rate limit counts a caller as: the address the platform reports (the first X-Forwarded-For
 * entry). An IPv6 caller owns a whole /64, so it is counted by that prefix; IPv4 stays whole.
 */
export function clientIp(req: Request): string {
  const first = req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim();
  const ip = (first || req.headers.get('X-Real-IP') || 'unknown').slice(0, 64);
  if (!isIPv6(ip)) return ip;

  // The URL parser gives the canonical form (lower-case, one "::", no dotted tail).
  const host = new URL(`http://[${ip.split('%')[0]}]`).hostname.slice(1, -1);
  const [head = '', tail] = host.split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  const groups = [...a, ...Array<string>(8 - a.length - b.length).fill('0'), ...b].map((g) =>
    g.padStart(4, '0'),
  );
  // An IPv4 address in IPv6 dress is the same caller as the IPv4 one.
  if (groups.slice(0, 5).every((g) => g === '0000') && groups[5] === 'ffff') {
    const hex = `${groups[6]}${groups[7]}`;
    return [0, 2, 4, 6].map((i) => parseInt(hex.slice(i, i + 2), 16)).join('.');
  }
  return `${groups.slice(0, 4).join(':')}::/64`;
}

/** The token of an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(req: Request): string | null {
  return /^Bearer (\S+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1] ?? null;
}
