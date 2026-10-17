import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Latest } from '@/domain/update';
import { fetchLatest, isReleaseBuild, updateUrl } from './update';

const PAGE = 'https://funancial.vercel.app/get/latest.json';
const latest: Latest = {
  versionCode: 9,
  versionName: '0.9',
  notes: 'A new look for the budget screen.',
  apkUrl: 'https://funancial.vercel.app/get/funancial-0.9.apk',
  sha256: 'a'.repeat(63) + '0',
  size: 12_345_678,
};

const fetchMock = vi.fn();
const answer = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  fetchMock.mockReset();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the build flags', () => {
  it('is a release build only when VITE_RELEASE is 1', () => {
    expect(isReleaseBuild()).toBe(false);
    for (const value of ['', '0', 'true', 'yes']) {
      vi.stubEnv('VITE_RELEASE', value);
      expect(isReleaseBuild()).toBe(false);
    }
    vi.stubEnv('VITE_RELEASE', '1');
    expect(isReleaseBuild()).toBe(true);
  });

  it('checks the download page unless a build names another place', () => {
    vi.stubEnv('VITE_UPDATE_URL', '');
    expect(updateUrl()).toBe(PAGE);
    vi.stubEnv('VITE_UPDATE_URL', 'https://funancial.vercel.app/get/test/latest.json');
    expect(updateUrl()).toBe('https://funancial.vercel.app/get/test/latest.json');
  });
});

describe('fetchLatest', () => {
  it('returns the parsed file, asked for with no headers or cookies', async () => {
    answer({ ...latest, extra: 'ignored' });

    await expect(fetchLatest(PAGE, fetchMock)).resolves.toEqual(latest);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(PAGE);
    expect(init.headers).toBeUndefined();
    expect(init.credentials).toBe('omit');
  });

  it('uses the global fetch unless told otherwise', async () => {
    vi.stubGlobal('fetch', fetchMock);
    answer(latest);
    await expect(fetchLatest(PAGE)).resolves.toEqual(latest);
  });

  it('says nothing when the page cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(fetchLatest(PAGE, fetchMock)).resolves.toBeNull();
  });

  it.each([404, 500, 206])('says nothing for a %s', async (status) => {
    answer(latest, status);
    await expect(fetchLatest(PAGE, fetchMock)).resolves.toBeNull();
  });

  it('says nothing for a body that is not JSON', async () => {
    answer('<html>Not found</html>');
    await expect(fetchLatest(PAGE, fetchMock)).resolves.toBeNull();
  });

  it('says nothing for JSON that fails the schema', async () => {
    answer({ ...latest, versionCode: '9' });
    await expect(fetchLatest(PAGE, fetchMock)).resolves.toBeNull();
    answer({ ...latest, notes: 'x'.repeat(10_000) });
    await expect(fetchLatest(PAGE, fetchMock)).resolves.toBeNull();
  });

  it.each([
    ['another host', 'https://evil.example/get/funancial-0.9.apk'],
    ['a look-alike host', 'https://funancial.vercel.app.evil.example/funancial-0.9.apk'],
    ['a host hidden behind credentials', 'https://funancial.vercel.app@evil.example/a.apk'],
    ['http instead of https', 'http://funancial.vercel.app/get/funancial-0.9.apk'],
    ['another port', 'https://funancial.vercel.app:8443/get/funancial-0.9.apk'],
    ['a javascript: link', 'javascript:alert(1)'],
    ['a data: link', 'data:text/html,<script>alert(1)</script>'],
    ['a protocol-relative link', '//evil.example/a.apk'],
    ['the right host with a user name and password', 'https://user:pw@funancial.vercel.app/a.apk'],
  ])('refuses an apkUrl on %s', async (_, apkUrl) => {
    answer({ ...latest, apkUrl });
    await expect(fetchLatest(PAGE, fetchMock)).resolves.toBeNull();
  });

  it('refuses an https apkUrl from an http page too', async () => {
    answer(latest);
    await expect(
      fetchLatest('http://funancial.vercel.app/get/latest.json', fetchMock),
    ).resolves.toBeNull();
  });

  it('gives up after 5 seconds', async () => {
    let aborted = false;
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );

    const result = fetchLatest(PAGE, fetchMock);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(aborted).toBe(true);
    await expect(result).resolves.toBeNull();
  });

  it('leaves no timer behind once the answer is in', async () => {
    answer(latest);
    await fetchLatest(PAGE, fetchMock);
    expect(vi.getTimerCount()).toBe(0);
  });
});
