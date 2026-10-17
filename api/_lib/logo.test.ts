import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as logoGET, OPTIONS as logoOPTIONS } from '../logo.js';
import { BlockedUrlError, safeFetchImage } from './safeFetch.js';
import * as yahoo from './yahoo.js';

// The favicon service is never called here: safeFetchImage is the network edge and it is mocked.
vi.mock('./yahoo.js', async (orig) => ({
  ...(await orig<typeof import('./yahoo.js')>()),
  getProfile: vi.fn(),
}));
vi.mock('./safeFetch.js', async (orig) => ({
  ...(await orig<typeof import('./safeFetch.js')>()),
  safeFetchImage: vi.fn(),
}));

const TOKEN = 'test-token';
const ORIGIN = 'http://localhost:5173';
// The first bytes of a PNG, then two that are not valid UTF-8: the body must arrive byte for byte.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x80]);

function request(path: string, headers: Record<string, string> = { 'X-Funancial-Token': TOKEN }) {
  return new Request(`http://localhost${path}`, { headers });
}

const logo = (symbol = 'AAPL', headers?: Record<string, string>) =>
  logoGET(request(`/api/logo?symbol=${symbol}`, headers));

const siteOf = (website: string | undefined) =>
  vi.mocked(yahoo.getProfile).mockResolvedValue({ currency: 'USD', website });

const notFound = async (res: Response) => {
  expect(res.status).toBe(404);
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(await res.json()).toEqual({ error: 'not found' });
};

beforeEach(() => {
  vi.resetAllMocks();
  process.env.FUNANCIAL_ACCESS_TOKEN = TOKEN;
  delete process.env.FUNANCIAL_APP_ORIGIN;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.FUNANCIAL_ACCESS_TOKEN;
});

describe('GET /api/logo', () => {
  it("answers the site's icon bytes untouched, cached for a week", async () => {
    siteOf('https://www.apple.com');
    vi.mocked(safeFetchImage).mockResolvedValue({ type: 'image/png', bytes: PNG });

    const res = await logo('AAPL', { 'X-Funancial-Token': TOKEN, Origin: ORIGIN });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=604800');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
    expect(yahoo.getProfile).toHaveBeenCalledWith('AAPL');
    expect(safeFetchImage).toHaveBeenCalledExactlyOnceWith(
      'https://www.google.com/s2/favicons?domain=www.apple.com&sz=64',
    );
  });

  it('asks only for the host of the profile website, whatever way it is written', async () => {
    const hosts: Array<[string, string]> = [
      ['https://www.apple.com/investor/relations?x=1#top', 'www.apple.com'],
      ['HTTP://Apple.COM:8080/x', 'apple.com'],
      ['apple.com', 'apple.com'],
      ['www.coca-colacompany.com/', 'www.coca-colacompany.com'],
      ['https://münchen.example', 'xn--mnchen-3ya.example'],
    ];
    for (const [website, host] of hosts) {
      vi.mocked(safeFetchImage).mockClear();
      vi.mocked(safeFetchImage).mockResolvedValue({ type: 'image/png', bytes: PNG });
      siteOf(website);
      expect((await logo()).status, website).toBe(200);
      expect(safeFetchImage, website).toHaveBeenCalledExactlyOnceWith(
        `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
      );
    }
  });

  it('answers 404 when the profile has no website, or none that names a public site', async () => {
    const unusable = [
      undefined,
      '',
      '   ',
      'not a site',
      'localhost',
      'http://intranet/',
      'http://127.0.0.1/',
      'http://10.0.0.5/admin',
      'http://[::1]/',
      'http://2130706433/',
      'javascript:alert(1)',
      'ftp://files.example.com/',
      'https://apple.com&sz=999&x=1',
      'a'.repeat(300) + '.com',
    ];
    for (const website of unusable) {
      siteOf(website);
      await notFound(await logo());
    }
    expect(safeFetchImage).not.toHaveBeenCalled();
  });

  it('answers 404, not an error, when the icon cannot be had', async () => {
    siteOf('https://www.apple.com');
    for (const failure of [
      new Error('unreadable page: 404 text/html'),
      new BlockedUrlError('not a public address'),
      new TypeError('fetch failed: ECONNREFUSED /secret/path'),
    ]) {
      vi.mocked(safeFetchImage).mockRejectedValue(failure);
      const res = await logo();
      await notFound(res);
    }
  });

  it('answers 502 without details when Yahoo fails', async () => {
    vi.mocked(yahoo.getProfile).mockRejectedValue(new Error('crumb exploded at /secret/path'));
    const res = await logo();
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toBe('{"error":"upstream"}');
    expect(safeFetchImage).not.toHaveBeenCalled();
  });

  it('wants the shared token before it looks anything up', async () => {
    const bad: Array<Record<string, string>> = [
      {},
      { 'X-Funancial-Token': 'nope' },
      { 'X-Funancial-Token': '' },
    ];
    for (const headers of bad) {
      const res = await logo('AAPL', headers);
      expect(res.status).toBe(401);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
    expect(yahoo.getProfile).not.toHaveBeenCalled();
    expect(safeFetchImage).not.toHaveBeenCalled();
  });

  it('refuses a missing or malformed symbol with 400', async () => {
    for (const path of [
      '/api/logo',
      '/api/logo?symbol=',
      '/api/logo?symbol=AAPL,KO',
      '/api/logo?symbol=a/b',
    ]) {
      const res = await logoGET(request(path));
      expect(res.status, path).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad request' });
    }
    expect(yahoo.getProfile).not.toHaveBeenCalled();
  });

  it('answers the preflight for an allowed origin', () => {
    const res = logoOPTIONS(
      new Request('http://localhost/api/logo', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });
});
