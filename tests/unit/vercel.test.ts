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

  it('asks search engines to stay away from every response', () => {
    expect(headersOf('/(.*)')['X-Robots-Tag']).toBe('noindex, nofollow');
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
