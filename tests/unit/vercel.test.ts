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

// The entries Vercel applies to a path, in file order (each becomes a `continue` route in the built
// config.json). A `.` is literal in a source (`latest.json`), except as the `.` of `.*`.
const entriesFor = (path: string) =>
  config.headers.filter(({ source }) =>
    new RegExp(`^${source.replace(/\.(?!\*)/g, '\\.')}$`).test(path),
  );
// What is sent for a path, were a later entry to replace an earlier one's header of the same name.
const sentFor = (path: string) =>
  Object.fromEntries(
    entriesFor(path).flatMap(({ headers }) => headers.map((h) => [h.key.toLowerCase(), h.value])),
  );
const cspsIn = (headers: Header[]) =>
  headers.filter((h) => /^content-security-policy$/i.test(h.key));
// The entries that set a CSP for a path: two would both bind the page, whatever Vercel does on a clash.
const cspEntriesFor = (path: string) => entriesFor(path).filter((e) => cspsIn(e.headers).length);

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
// The reset page compiles Argon2id's WebAssembly from bytes, which that one keyword allows.
const RESET_CSP = CSP.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'");

// Every page but the reset page: this source never matches /reset, /reset/ or anything below it.
const GENERAL = '/((?!reset(?:/|$)).*)';
const SECURITY = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

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
    expect(headersOf(GENERAL)).toEqual({ ...SECURITY, 'Content-Security-Policy': CSP });
  });

  it.each(['/', '/get', '/get/', '/api/quote', '/reset', '/reset/', '/reset/index.html'])(
    'sets exactly one Content-Security-Policy on %s, by which entries match and not by their order',
    (path) => {
      const entries = cspEntriesFor(path);
      expect(entries).toHaveLength(1);
      expect(cspsIn(entries[0]?.headers ?? [])).toHaveLength(1);
    },
  );

  it.each(['/get', '/get/', '/api/reset', '/assets/get-abc.js', '/get/latest.json'])(
    'lets %s run scripts from its own origin only',
    (path) => {
      expect(sentFor(path)['content-security-policy']).toBe(CSP);
    },
  );

  it.each(['/reset', '/reset/(.*)'])(
    'serves the reset page under %s fresh, as its link carries a token for one use, lets it compile WebAssembly, and repeats the other security headers',
    (source) => {
      const entries = config.headers.filter((h) => h.source === source);
      expect(entries).toHaveLength(1);
      expect(cspsIn(entries[0]?.headers ?? [])).toHaveLength(1);
      expect(headersOf(source)).toEqual({
        ...SECURITY,
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': RESET_CSP,
      });
    },
  );

  // The page is the same file at all three, and Vercel serves it at each.
  it.each(['/reset', '/reset/', '/reset/index.html'])(
    'gives %s the wasm CSP, no-cache and the other security headers',
    (path) => {
      const sent = sentFor(path);
      expect(sent['content-security-policy']).toBe(RESET_CSP);
      expect(sent['cache-control']).toBe('no-cache');
      expect(sent['x-frame-options']).toBe('DENY');
      expect(sent['x-content-type-options']).toBe('nosniff');
    },
  );

  it.each(['/resetting', '/reset-old/index.html', '/get/reset', '/assets/reset-abc.js'])(
    'keeps the wasm CSP off %s, which only looks like the reset page',
    (path) => {
      expect(sentFor(path)['content-security-policy']).toBe(CSP);
      expect(cspEntriesFor(path)).toHaveLength(1);
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
