import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLatest, metaLine } from './latest';

const LATEST = {
  versionCode: 8,
  versionName: '0.8',
  notes: 'First release for friends.',
  apkUrl: 'https://funancial.vercel.app/get/funancial-0.8.apk',
  sha256: 'a'.repeat(63) + '0',
  size: 9_437_184,
};

const answer = (body: string, status = 200) =>
  vi.fn<typeof fetch>(async () => new Response(body, { status }));

afterEach(() => vi.useRealTimers());

describe('loadLatest', () => {
  it('reads the absolute /get/latest.json, which a /get without a slash would not find relatively', async () => {
    const fetchImpl = answer(JSON.stringify(LATEST));
    expect(await loadLatest(fetchImpl)).toEqual(LATEST);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/get/latest.json');
  });

  it('is null on a 404', async () => {
    expect(await loadLatest(answer('not found', 404))).toBeNull();
  });

  it('is null on a body that is not JSON, or not a release', async () => {
    expect(await loadLatest(answer('<html>'))).toBeNull();
    expect(await loadLatest(answer('null'))).toBeNull();
    expect(await loadLatest(answer(JSON.stringify({ ...LATEST, versionCode: '8' })))).toBeNull();
    expect(
      await loadLatest(answer(JSON.stringify({ ...LATEST, apkUrl: 'javascript:alert(1)' }))),
    ).toBeNull();
  });

  describe('in a browser without AbortSignal.timeout', () => {
    const timeout = AbortSignal.timeout;
    const without = () =>
      Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
    afterEach(() =>
      Object.defineProperty(AbortSignal, 'timeout', { value: timeout, configurable: true }),
    );

    it('still reads the release', async () => {
      without();
      expect(await loadLatest(answer(JSON.stringify(LATEST)))).toEqual(LATEST);
    });

    it('still gives up after five seconds', async () => {
      without();
      vi.useFakeTimers();
      const stuck = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted'))),
          ),
      );
      const result = loadLatest(stuck);
      await vi.advanceTimersByTimeAsync(4999);
      expect(stuck.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(stuck.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(await result).toBeNull();
    });
  });

  it('is null, and does not reject, in a browser with no AbortSignal or AbortController', async () => {
    const globals = globalThis as Record<string, unknown>;
    const saved = { AbortSignal, AbortController };
    delete globals.AbortSignal;
    delete globals.AbortController;
    try {
      await expect(loadLatest(answer(JSON.stringify(LATEST)))).resolves.toBeNull();
    } finally {
      Object.assign(globals, saved);
    }
  });

  it('is null when the request fails', async () => {
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await loadLatest(offline)).toBeNull();
  });
});

describe('metaLine', () => {
  it('names the version and the size in decimal MB, as Android shows it, with one decimal', () => {
    expect(metaLine(LATEST)).toBe('Version 0.8 · 9.4 MB');
    expect(metaLine({ ...LATEST, versionName: '1.2', size: 12_345_678 })).toBe(
      'Version 1.2 · 12.3 MB',
    );
  });
});
