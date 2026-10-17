import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as loginPOST, OPTIONS as loginOPTIONS } from '../login.js';
import { DELETE as copyDELETE, OPTIONS as copyOPTIONS, PUT as copyPUT } from '../copy.js';
import { POST as passwordPOST, OPTIONS as passwordOPTIONS } from '../password.js';
import { POST as signupPOST, OPTIONS as signupOPTIONS } from '../signup.js';
import { kvStoreFromEnv, memoryKvStore } from './store.js';

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
    expect(limited.headers.get('Cache-Control')).toBe('no-store');
    expect(await limited.json()).toEqual({ error: 'too many attempts' });

    expect((await send('203.0.113.10', 'user5')).status).toBe(200);
  });

  it('answer 503 without details, and log no message, when the store fails', async () => {
    const secret = b64(32);
    const store = memoryKvStore();
    store.get = async () => {
      throw new Error(`connection refused for token ${secret}`);
    };
    vi.mocked(kvStoreFromEnv).mockReturnValue(store);
    const logged = [
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
    ];

    const a = account();
    const res = await call(loginPOST, 'POST', '/api/login', {
      username: 'ada',
      authKey: a.authKey,
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toBe('{"error":"unavailable"}');

    const seen = JSON.stringify(logged.map((spy) => spy.mock.calls));
    expect(logged[0]).toHaveBeenCalledTimes(1);
    for (const text of [secret, a.authKey, 'connection refused']) expect(seen).not.toContain(text);
  });
});
