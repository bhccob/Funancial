import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Header {
  key: string;
  value: string;
}
interface VercelConfig {
  buildCommand: string;
  outputDirectory: string;
  functions: Record<string, { maxDuration: number }>;
  redirects: Array<{ source: string; destination: string; permanent: boolean }>;
  headers: Array<{ source: string; headers: Header[] }>;
}

const config: VercelConfig = JSON.parse(
  readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
);

const headersOf = (source: string) =>
  Object.fromEntries(
    config.headers
      .filter((h) => h.source === source)
      .flatMap((h) => h.headers.map((x) => [x.key, x.value])),
  );

// What Vercel sends for a path: every matching entry in file order, a later one replacing an earlier
// one's header of the same name (each entry becomes a `continue` route in the built config.json).
const sentFor = (path: string) => {
  const sent = new Map<string, string>();
  for (const { source, headers } of config.headers) {
    // A `.` is literal in a source (`latest.json`), except as the `.` of `(.*)`.
    if (!new RegExp(`^${source.replace(/\.(?!\*)/g, '\\.')}$`).test(path)) continue;
    for (const { key, value } of headers) sent.set(key.toLowerCase(), value);
  }
  return Object.fromEntries(sent);
};
const cspsIn = (headers: Header[]) =>
  headers.filter((h) => /^content-security-policy$/i.test(h.key));

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
// The reset page compiles Argon2id's WebAssembly from bytes, which that one keyword allows.
const RESET_CSP = CSP.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'");

describe('vercel.json', () => {
  it('deploys the download page, not the app', () => {
    expect(config.buildCommand).toBe('npm run site:build');
    expect(config.outputDirectory).toBe('site-dist');
  });

  it('keeps the price service as it was', () => {
    expect(config.functions).toEqual({ 'api/*.ts': { maxDuration: 10 } });
  });

  it('sends / to /get, for now', () => {
    expect(config.redirects).toEqual([{ source: '/', destination: '/get', permanent: false }]);
  });

  it('sends the six security headers on every response, and asks search engines to stay away', () => {
    expect(headersOf('/(.*)')).toEqual({
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    });
  });

  it.each(['/get', '/get/', '/api/reset', '/assets/get-abc.js', '/get/latest.json'])(
    'lets %s run scripts from its own origin only',
    (path) => {
      expect(sentFor(path)['content-security-policy']).toBe(CSP);
    },
  );

  it.each(['/reset', '/reset/'])(
    'serves the reset page %s fresh, as its link carries a token for one use, and lets it compile WebAssembly',
    (source) => {
      const entries = config.headers.filter((h) => h.source === source);
      expect(entries).toHaveLength(1);
      // One CSP in the entry, and so one in the response: two would both bind the page.
      expect(cspsIn(entries[0]?.headers ?? [])).toHaveLength(1);
      expect(headersOf(source)).toEqual({
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': RESET_CSP,
      });
      expect(sentFor(source)['content-security-policy']).toBe(RESET_CSP);
      expect(sentFor(source)['x-frame-options']).toBe('DENY');
    },
  );

  it('never allows eval, only WebAssembly compiled from bytes', () => {
    const all = config.headers.flatMap((h) => cspsIn(h.headers).map((x) => x.value));
    expect(all).toHaveLength(3);
    for (const csp of all) expect(csp).not.toContain("'unsafe-eval'");
  });

  it.each(['/get/latest.json', '/get/test/latest.json'])(
    'serves %s fresh, and to the app inside Android’s WebView (origin https://localhost)',
    (source) => {
      expect(headersOf(source)).toEqual({
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
    },
  );
});
