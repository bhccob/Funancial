import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as loginPOST, OPTIONS as loginOPTIONS } from '../login.js';
import { DELETE as copyDELETE, OPTIONS as copyOPTIONS, PUT as copyPUT } from '../copy.js';
import { POST as passwordPOST, OPTIONS as passwordOPTIONS } from '../password.js';
import { POST as signupPOST, OPTIONS as signupOPTIONS } from '../signup.js';
import { accountRoute } from './accountRoute.js';
import { unwrapServer, type Account } from './accounts.js';
import { clientIp } from './http.js';
import { kvStoreFromEnv, memoryKvStore, type KvStore } from './store.js';

// The routes build their store from the environment; here that is a memory store.
vi.mock('./store.js', async (orig) => ({
  ...(await orig<typeof import('./store.js')>()),
  kvStoreFromEnv: vi.fn(),
}));

const TOKEN = 'test-token';
const ORIGIN = 'http://localhost:5173';
const b64 = (bytes: number) => randomBytes(bytes).toString('base64');

type Handler = (req: Request) => Promise<Response>;

function call(
  handler: Handler,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const init: RequestInit = { method, headers: { 'X-Funancial-Token': TOKEN, ...headers } };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return handler(new Request(`http://localhost${path}`, init));
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const account = () => ({
  username: 'ada',
  email: 'ada@example.com',
  authKey: b64(32),
  dek: b64(32),
  wrappedPw: { iv: b64(12), ciphertext: b64(48) },
});

beforeEach(() => {
  vi.mocked(kvStoreFromEnv).mockReturnValue(memoryKvStore());
  vi.stubEnv('FUNANCIAL_ACCESS_TOKEN', TOKEN);
  vi.stubEnv('SERVER_MASTER_KEY', b64(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const routes: Array<[string, Handler, string, string]> = [
  ['signup', signupPOST, 'POST', '/api/signup'],
  ['login', loginPOST, 'POST', '/api/login'],
  ['put copy', copyPUT, 'PUT', '/api/copy'],
  ['delete copy', copyDELETE, 'DELETE', '/api/copy'],
  ['password', passwordPOST, 'POST', '/api/password'],
];

describe('account routes', () => {
  it('want the shared token, before they look at anything else', async () => {
    for (const [name, handler, method, path] of routes) {
      for (const headers of [{}, { 'X-Funancial-Token': 'nope' }, { 'X-Funancial-Token': '' }]) {
        const res = await call(handler, method, path, account(), {
          'X-Funancial-Token': '',
          ...headers,
        });
        expect(res.status, name).toBe(401);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(await res.json()).toEqual({ error: 'unauthorized' });
      }
    }
    expect(kvStoreFromEnv).not.toHaveBeenCalled();
  });

  it('answer the preflight with every method and header the phone uses', () => {
    for (const options of [signupOPTIONS, loginOPTIONS, copyOPTIONS, passwordOPTIONS]) {
      const res = options(
        new Request('http://localhost/api/copy', {
          method: 'OPTIONS',
          headers: { Origin: ORIGIN },
        }),
      );
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(
        'GET, POST, PUT, DELETE, OPTIONS',
      );
      expect(res.headers.get('Access-Control-Allow-Headers')).toBe(
        'X-Funancial-Token, Authorization, Content-Type',
      );
    }
  });

  it('say not configured, with 503 and nothing else, when the store or master key is missing', async () => {
    const unconfigured = async () => {
      for (const [name, handler, method, path] of routes) {
        const res = await call(
          handler,
          method,
          path,
          account(),
          bearer(b64(32).replace(/\W/g, '_')),
        );
        expect(res.status, name).toBe(503);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(await res.text()).toBe('{"error":"not configured"}');
      }
    };

    vi.mocked(kvStoreFromEnv).mockReturnValue(null);
    await unconfigured();

    vi.mocked(kvStoreFromEnv).mockReturnValue(memoryKvStore());
    vi.stubEnv('SERVER_MASTER_KEY', '');
    await unconfigured();
    vi.stubEnv('SERVER_MASTER_KEY', b64(16));
    await unconfigured();
  });

  it('refuse a body that is not JSON with 400, and one over 1.5 MB with 413', async () => {
    for (const body of ['not json', '', '{"half":']) {
      const res = await call(signupPOST, 'POST', '/api/signup', body);
      expect(res.status, body).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad request' });
    }
    const noBody = await signupPOST(
      new Request('http://localhost/api/signup', {
        method: 'POST',
        headers: { 'X-Funancial-Token': TOKEN },
      }),
    );
    expect(noBody.status).toBe(400);

    // Exactly the cap is read (and then refused as not an account); one byte more never is.
    const pad = (bytes: number) => JSON.stringify({ pad: 'x'.repeat(bytes - 10) });
    expect(pad(1_500_000)).toHaveLength(1_500_000);
    expect((await call(signupPOST, 'POST', '/api/signup', pad(1_500_000))).status).toBe(400);
    const big = await call(signupPOST, 'POST', '/api/signup', pad(1_500_001));
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: 'too large' });

    // A declared length over the cap is refused without reading the body.
    const declared = await call(signupPOST, 'POST', '/api/signup', '{}', {
      'Content-Length': '1500001',
    });
    expect(declared.status).toBe(413);
  });

  it('carry an account from sign-up to deletion', async () => {
    const a = account();
    const signup = await call(signupPOST, 'POST', '/api/signup', a, { Origin: ORIGIN });
    expect(signup.status).toBe(200);
    expect(signup.headers.get('Cache-Control')).toBe('no-store');
    expect(signup.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const { deviceToken } = (await signup.json()) as { deviceToken: string };
    expect(deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const taken = await call(signupPOST, 'POST', '/api/signup', a);
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'taken' });

    const copy = { iv: b64(12), ciphertext: b64(300) };
    const put = await call(
      copyPUT,
      'PUT',
      '/api/copy',
      { baseVersion: 0, ...copy },
      bearer(deviceToken),
    );
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ version: 1 });

    const login = await call(loginPOST, 'POST', '/api/login', {
      username: 'Ada',
      authKey: a.authKey,
    });
    expect(login.status).toBe(200);
    const next = (await login.json()) as {
      deviceToken: string;
      wrappedPw: unknown;
      copy: unknown;
    };
    expect(next.wrappedPw).toEqual(a.wrappedPw);
    expect(next.copy).toEqual({ ...copy, version: 1 });

    const stale = await call(
      copyPUT,
      'PUT',
      '/api/copy',
      { baseVersion: 1, ...copy },
      bearer(deviceToken),
    );
    expect(stale.status).toBe(401);

    const changed = await call(
      passwordPOST,
      'POST',
      '/api/password',
      {
        oldAuthKey: a.authKey,
        newAuthKey: b64(32),
        newWrappedPw: { iv: b64(12), ciphertext: b64(48) },
      },
      bearer(next.deviceToken),
    );
    expect(changed.status).toBe(204);
    expect(await changed.text()).toBe('');

    const gone = await call(copyDELETE, 'DELETE', '/api/copy', undefined, bearer(next.deviceToken));
    expect(gone.status).toBe(204);
    expect(await gone.text()).toBe('');
    const after = await call(
      copyDELETE,
      'DELETE',
      '/api/copy',
      undefined,
      bearer(next.deviceToken),
    );
    expect(after.status).toBe(401);
  });

  it('read the Bearer token strictly, and its scheme in any case', async () => {
    const a = account();
    const { deviceToken } = (await (await call(signupPOST, 'POST', '/api/signup', a)).json()) as {
      deviceToken: string;
    };
    const body = { baseVersion: 0, iv: b64(12), ciphertext: b64(100) };
    for (const Authorization of [
      '',
      deviceToken,
      `Basic ${deviceToken}`,
      `Bearer ${deviceToken} extra`,
      `Bearer  ${deviceToken}`,
    ]) {
      const headers: Record<string, string> = Authorization ? { Authorization } : {};
      expect((await call(copyPUT, 'PUT', '/api/copy', body, headers)).status, Authorization).toBe(
        401,
      );
    }
    const lower = await call(copyPUT, 'PUT', '/api/copy', body, {
      Authorization: `bearer ${deviceToken}`,
    });
    expect(lower.status).toBe(200);
  });

  it('send Retry-After with a 429, and count each address by the first X-Forwarded-For entry', async () => {
    const send = (ip: string, username: string) =>
      call(
        signupPOST,
        'POST',
        '/api/signup',
        { ...account(), username },
        {
          'X-Forwarded-For': `${ip}, 10.0.0.1`,
        },
      );
    for (let i = 0; i < 5; i++) expect((await send('203.0.113.9', `user${i}`)).status).toBe(200);

    const limited = await send('203.0.113.9', 'user5');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('3600');
    // So the phone's WebView, a cross-origin caller, can read it.
    expect(limited.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    expect(limited.headers.get('Cache-Control')).toBe('no-store');
    expect(await limited.json()).toEqual({ error: 'too many attempts' });

    expect((await send('203.0.113.10', 'user5')).status).toBe(200);
  });

  it('count an IPv6 caller by its /64, and an IPv4 caller by the whole address', async () => {
    expect(
      clientIp(new Request('http://x', { headers: { 'X-Forwarded-For': '203.0.113.9' } })),
    ).toBe('203.0.113.9');
    const v6 = (ip: string) =>
      clientIp(new Request('http://x', { headers: { 'X-Forwarded-For': ip } }));
    const prefix = '2001:0db8:0001:0002::/64';
    for (const ip of [
      '2001:db8:1:2:aaaa:bbbb:cccc:dddd',
      '2001:DB8:1:2::1',
      '2001:db8:1:2:ffff:ffff:ffff:ffff',
      '2001:0db8:0001:0002:0000:0000:0000:0009',
    ]) {
      expect(v6(ip), ip).toBe(prefix);
    }
    expect(v6('2001:db8:1:3::1')).toBe('2001:0db8:0001:0003::/64');
    expect(v6('::1')).toBe('0000:0000:0000:0000::/64');
    // An IPv4 address in IPv6 dress is the same caller as the IPv4 one.
    expect(v6('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(v6('not an address')).toBe('not an address');

    // End to end: five sign-ups from one /64 use up its hour, whichever host bits they come from.
    const send = (ip: string, username: string) =>
      call(
        signupPOST,
        'POST',
        '/api/signup',
        { ...account(), username },
        { 'X-Forwarded-For': ip },
      );
    for (let i = 0; i < 5; i++) {
      expect((await send(`2001:db8:1:2:${i}::${i}`, `user${i}`)).status).toBe(200);
    }
    expect((await send('2001:db8:1:2:ffff::1', 'user5')).status).toBe(429);
    expect((await send('2001:db8:1:3::1', 'user5')).status).toBe(200);
  });

  it('answer 503 not configured when the master key is not the one that wrapped the account', async () => {
    const store = memoryKvStore();
    vi.mocked(kvStoreFromEnv).mockReturnValue(store);
    expect((await call(signupPOST, 'POST', '/api/signup', account())).status).toBe(200);

    // A route that opens the stored data key, as the email reset will, under a changed key.
    vi.stubEnv('SERVER_MASTER_KEY', b64(32));
    const reset = accountRoute(async () => {
      const key = Buffer.from(process.env.SERVER_MASTER_KEY ?? '', 'base64');
      unwrapServer(store.dump()['acct:u:ada'] as Account, key);
      return { status: 204 };
    }, false);
    const res = await reset(
      new Request('http://localhost/api/x', {
        method: 'POST',
        headers: { 'X-Funancial-Token': TOKEN },
      }),
    );
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"error":"not configured"}');
  });

  // Every console method, so a stray log of any kind fails the test.
  const spiedConsole = () =>
    (['error', 'log', 'info', 'warn', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
  const logged = (spies: ReturnType<typeof spiedConsole>) =>
    JSON.stringify(spies.map((spy) => spy.mock.calls));

  it('answer 503 without details, and log only the kind of error, when the store fails, on every route', async () => {
    const secret = b64(32);
    const failing = Object.fromEntries(
      ['get', 'set', 'setNx', 'del', 'incr', 'expire', 'ttl', 'sadd', 'smembers', 'srem'].map(
        (name) => [
          name,
          async () => {
            throw new Error(`connection refused for token ${secret}`);
          },
        ],
      ),
    ) as unknown as KvStore;
    vi.mocked(kvStoreFromEnv).mockReturnValue(failing);
    const spies = spiedConsole();

    const a = account();
    const auth = bearer(randomBytes(32).toString('base64url'));
    const bodies: Array<[Handler, string, string, unknown]> = [
      [signupPOST, 'POST', '/api/signup', a],
      [loginPOST, 'POST', '/api/login', { username: 'ada', authKey: a.authKey }],
      [copyPUT, 'PUT', '/api/copy', { baseVersion: 0, iv: b64(12), ciphertext: b64(100) }],
      [copyDELETE, 'DELETE', '/api/copy', undefined],
      [
        passwordPOST,
        'POST',
        '/api/password',
        { oldAuthKey: a.authKey, newAuthKey: b64(32), newWrappedPw: a.wrappedPw },
      ],
    ];
    for (const [handler, method, path, body] of bodies) {
      const res = await call(handler, method, path, body, auth);
      expect(res.status, path).toBe(503);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.text()).toBe('{"error":"unavailable"}');
    }

    const [error, ...others] = spies;
    expect(error).toHaveBeenCalledTimes(bodies.length);
    for (const spy of others) expect(spy).not.toHaveBeenCalled();
    for (const text of [secret, a.authKey, a.dek, 'connection refused']) {
      expect(logged(spies)).not.toContain(text);
    }
  });

  it('log nothing, and return no secret, on any failure path of any route', async () => {
    const spies = spiedConsole();
    const a = account();
    const signup = await call(signupPOST, 'POST', '/api/signup', a);
    const { deviceToken } = (await signup.json()) as { deviceToken: string };
    const guess = b64(32);
    const guessToken = randomBytes(32).toString('base64url');
    const master = process.env.SERVER_MASTER_KEY ?? '';
    const noToken = { 'X-Funancial-Token': 'nope' };
    const copy = { baseVersion: 0, iv: b64(12), ciphertext: b64(100) };

    const failures: Response[] = [];
    // No shared token, on every route, with real secrets in the body.
    for (const [, handler, method, path] of routes) {
      failures.push(await call(handler, method, path, a, noToken));
    }
    failures.push(
      await call(signupPOST, 'POST', '/api/signup', a), // taken
      await call(signupPOST, 'POST', '/api/signup', { ...a, username: 'grace', dek: guess }),
      await call(signupPOST, 'POST', '/api/signup', '{"authKey":'), // not JSON
      await call(loginPOST, 'POST', '/api/login', { username: 'ada', authKey: guess }),
      await call(loginPOST, 'POST', '/api/login', { username: 'nobody', authKey: a.authKey }),
      await call(copyPUT, 'PUT', '/api/copy', copy, bearer(guessToken)),
      await call(copyPUT, 'PUT', '/api/copy', { ...copy, baseVersion: 7 }, bearer(deviceToken)),
      await call(
        copyPUT,
        'PUT',
        '/api/copy',
        { ...copy, ciphertext: b64(1_000_001) },
        bearer(deviceToken),
      ),
      await call(copyPUT, 'PUT', '/api/copy', 'x'.repeat(1_500_001), bearer(deviceToken)),
      await call(copyDELETE, 'DELETE', '/api/copy', undefined, bearer(guessToken)),
      await call(
        passwordPOST,
        'POST',
        '/api/password',
        { oldAuthKey: guess, newAuthKey: b64(32), newWrappedPw: a.wrappedPw },
        bearer(deviceToken),
      ),
      await call(
        passwordPOST,
        'POST',
        '/api/password',
        { oldAuthKey: a.authKey, newAuthKey: b64(32), newWrappedPw: a.wrappedPw },
        bearer(guessToken),
      ),
    );
    // Until the log-in limit answers.
    for (let i = 0; i < 11; i++) {
      failures.push(
        await call(loginPOST, 'POST', '/api/login', { username: 'ada', authKey: guess }),
      );
    }
    // And with the service not set up.
    vi.mocked(kvStoreFromEnv).mockReturnValue(null);
    for (const [, handler, method, path] of routes) {
      failures.push(await call(handler, method, path, a, bearer(deviceToken)));
    }

    expect(failures.some((res) => res.status === 429)).toBe(true);
    const seen = JSON.stringify(
      await Promise.all(
        failures.map(async (res) => [res.status, [...res.headers], await res.text()]),
      ),
    );
    for (const secret of [a.authKey, a.dek, deviceToken, guess, guessToken, master]) {
      expect(seen).not.toContain(secret);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
