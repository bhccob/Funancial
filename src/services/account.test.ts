import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountApi, NetworkError } from './account';

beforeEach(() => {
  // Whatever a developer's .env files say, the calls go to this origin with this token.
  vi.stubEnv('VITE_FUNANCIAL_API_URL', '');
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'shared-token');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const body = { baseVersion: 0, iv: 'iv', ciphertext: 'ct' };

describe('the account service calls', () => {
  it('send the shared token, the device token and the body, and read the answer and Retry-After', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'too many attempts' }), {
          status: 429,
          headers: { 'Retry-After': '120' },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const reply = await accountApi.putCopy('device-token', body);
    expect(reply).toEqual({ status: 429, body: { error: 'too many attempts' }, retryAfter: 120 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/copy');
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({
      'X-Funancial-Token': 'shared-token',
      Authorization: 'Bearer device-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it('ask for a reset link with the shared token alone: nobody is logged in', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await accountApi.forgot({ who: 'robin' })).toEqual({
      status: 200,
      body: { ok: true },
      retryAfter: null,
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/forgot');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'X-Funancial-Token': 'shared-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({ who: 'robin' });
  });

  it('read an answer with no JSON as no body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 502 })),
    );
    expect(await accountApi.deleteAccount('t')).toEqual({
      status: 502,
      body: null,
      retryAfter: null,
    });
  });

  it('read a failed fetch as nothing coming back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(accountApi.logIn({ username: 'robin', authKey: 'k' })).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  describe('where AbortSignal.timeout is missing (an old WebView)', () => {
    function withoutTimeout() {
      const original = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
      Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
      return () => {
        if (original) Object.defineProperty(AbortSignal, 'timeout', original);
        else Reflect.deleteProperty(AbortSignal, 'timeout');
      };
    }

    it('still sends the request, and gives up after 30 s with the same error', async () => {
      const restore = withoutTimeout();
      try {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        vi.stubGlobal(
          'fetch',
          vi.fn(
            (_url: string, init: RequestInit) =>
              new Promise<Response>((_resolve, reject) => {
                signal = init.signal ?? undefined;
                init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
              }),
          ),
        );
        const sent = accountApi.putCopy('t', body);
        const outcome = expect(sent).rejects.toBeInstanceOf(NetworkError);
        expect(signal).toBeDefined();
        expect(signal!.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(29_999);
        expect(signal!.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(signal!.aborted).toBe(true);
        await outcome;
      } finally {
        restore();
      }
    });

    it('leaves no timer behind when the answer comes', async () => {
      const restore = withoutTimeout();
      try {
        vi.useFakeTimers();
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => new Response('{}', { status: 200 })),
        );
        await accountApi.putCopy('t', body);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        restore();
      }
    });
  });
});
