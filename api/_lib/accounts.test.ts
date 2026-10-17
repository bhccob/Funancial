import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The phone's own module, by relative path: the cross tests below hold the server to its formats.
import {
  canonicalUsername as phoneCanonical,
  deriveAccountKeys,
  exportKek,
  newDek,
  unwrapDek,
  wrapDek,
} from '../../src/data/accountCrypto';
import {
  canonicalUsername,
  createAccounts,
  rewrapPassword,
  unwrapServer,
  type Accounts,
  type Result,
  type Sealed,
} from './accounts.js';
import { rateLimit } from './rateLimit.js';
import { memoryKvStore, type KvStore } from './store.js';

const T0 = Date.parse('2026-10-17T12:00:00.000Z');
const MASTER = randomBytes(32);
const IP = '203.0.113.7';
const PASSWORD = 'correct horse battery';
const FAST = 1_000;

let clock = T0;
const advance = (seconds: number) => {
  clock += seconds * 1000;
};
beforeEach(() => {
  clock = T0;
});

// Every call waits a moment first, so requests started together really interleave their store calls.
const lagged = (store: KvStore): KvStore =>
  new Proxy(store, {
    get(target, name, receiver) {
      const member: unknown = Reflect.get(target, name, receiver);
      if (typeof member !== 'function') return member;
      return async (...args: unknown[]) => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return member.apply(target, args);
      };
    },
  });

function setup(slow = false) {
  const store = memoryKvStore(() => clock);
  const accounts = createAccounts({
    store: slow ? lagged(store) : store,
    masterKey: MASTER,
    now: () => clock,
  });
  return { store, accounts };
}

const b64 = (bytes: number) => randomBytes(bytes).toString('base64');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
// A wrapped data key is the 32-byte key plus the 16-byte tag: 48 bytes under a 12-byte IV.
const wrapped = (): Sealed => ({ iv: b64(12), ciphertext: b64(48) });
const copyOf = (bytes = 200): Sealed => ({ iv: b64(12), ciphertext: b64(bytes) });
const out = <T = Record<string, unknown>>(r: Result) => r.body as T;

async function join(accounts: Accounts, over: Record<string, unknown> = {}, ip = IP) {
  const authKey = b64(32);
  const dek = b64(32);
  const wrappedPw = wrapped();
  const res = await accounts.signup(
    { username: 'Ada', email: 'Ada@Example.com', authKey, dek, wrappedPw, ...over },
    ip,
  );
  const token = out<{ deviceToken?: string }>(res)?.deviceToken ?? '';
  return { res, authKey, dek, wrappedPw, token };
}

const put = (a: Accounts, token: string | null, baseVersion: number, c: Sealed = copyOf()) =>
  a.putCopy(token, { baseVersion, ...c });

const logIn = (a: Accounts, authKey: string, username = 'ada', ip = IP) =>
  a.login({ username, authKey }, ip);

describe('sign-up', () => {
  it('stores the account lower-cased, with only a hash of the token, and returns the token', async () => {
    const { store, accounts } = setup();
    const { res, authKey, dek, token, wrappedPw } = await join(accounts);
    expect(res.status).toBe(200);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const dump = store.dump();
    expect(dump['acct:u:ada']).toMatchObject({
      username: 'ada',
      email: 'ada@example.com',
      wrappedPw,
      deviceTokenHash: sha(token),
      version: 1,
      createdAt: '2026-10-17T12:00:00.000Z',
    });
    expect(dump['acct:e:ada@example.com']).toEqual(['ada']);

    const all = JSON.stringify(dump);
    for (const secret of [authKey, dek, token]) expect(all).not.toContain(secret);
    expect(all).not.toContain('authKey');
  });

  it('wraps the sent data key under the master key, and it unwraps back to that key', async () => {
    const { store, accounts } = setup();
    const { dek } = await join(accounts);
    const account = store.dump()['acct:u:ada'] as { wrappedServer: Sealed };
    expect(unwrapServer(account, MASTER).toString('base64')).toBe(dek);
    expect(account.wrappedServer.ciphertext).not.toContain(dek);
    // A different master key opens nothing.
    expect(() => unwrapServer(account, randomBytes(32))).toThrow();
  });

  it('refuses a taken username in any spelling of it, and leaves the first account alone', async () => {
    const { store, accounts } = setup();
    await join(accounts, {}, '198.51.100.1');
    const before = JSON.stringify(store.dump()['acct:u:ada']);
    for (const username of ['ada', 'ADA', 'ＡＤＡ']) {
      const again = await join(accounts, { username, email: 'x@example.com' }, '198.51.100.2');
      expect(again.res).toEqual({ status: 409, body: { error: 'taken' } });
    }
    expect(JSON.stringify(store.dump()['acct:u:ada'])).toBe(before);
    expect(store.dump()['acct:e:x@example.com']).toBeUndefined();
  });

  it('lets only one of two simultaneous sign-ups for a name win', async () => {
    const { store, accounts } = setup(true);
    const [a, b] = await Promise.all([
      join(accounts, { email: 'a@example.com' }, '198.51.100.1'),
      join(accounts, { email: 'b@example.com' }, '198.51.100.2'),
    ]);
    expect([a.res.status, b.res.status].sort()).toEqual([200, 409]);
    const winner = a.res.status === 200 ? a : b;
    expect(store.dump()['acct:u:ada']).toMatchObject({ deviceTokenHash: sha(winner.token) });
    // The loser left nothing behind.
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:t:'))).toHaveLength(1);
  });

  it('refuses a bad username, email, key, data key or wrapped key with 400, storing nothing', async () => {
    const { store, accounts } = setup();
    const bad: Array<Record<string, unknown>> = [
      { username: 'ab' },
      { username: 'a'.repeat(31) },
      { username: 'has space' },
      { username: 'ada!' },
      { username: 'café' },
      { username: 42 },
      { username: undefined },
      { email: 'nope' },
      { email: `${'a'.repeat(250)}@x.io` },
      { email: undefined },
      { authKey: 'short' },
      { authKey: b64(33) },
      { dek: undefined },
      { dek: b64(16) },
      { dek: b64(64) },
      { dek: 'not base64!' },
      { wrappedPw: undefined },
      { wrappedPw: { iv: b64(8), ciphertext: b64(48) } },
      { wrappedPw: { iv: b64(12), ciphertext: b64(47) } },
    ];
    for (const over of bad) {
      const { res } = await join(accounts, over);
      expect(res, JSON.stringify(over)).toEqual({ status: 400, body: { error: 'bad request' } });
    }
    for (const body of [null, 'x', 7, [], {}]) {
      expect(await accounts.signup(body, IP)).toEqual({
        status: 400,
        body: { error: 'bad request' },
      });
    }
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:'))).toEqual([]);
  });

  it('takes a 30-character name and a 254-character address', async () => {
    const { accounts } = setup();
    const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;
    expect(email).toHaveLength(254);
    const { res } = await join(accounts, { username: 'a'.repeat(30), email });
    expect(res.status).toBe(200);
  });
});

describe('log-in', () => {
  it('returns a token, the wrapped key and no copy for a new account', async () => {
    const { accounts } = setup();
    const { authKey, wrappedPw } = await join(accounts);
    const res = await logIn(accounts, authKey, 'ADA');
    expect(res.status).toBe(200);
    expect(out(res)).toEqual({
      deviceToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      wrappedPw,
      copy: null,
    });
  });

  it('returns the copy, with its version', async () => {
    const { accounts } = setup();
    const { authKey, token } = await join(accounts);
    const c = copyOf();
    await put(accounts, token, 0, c);
    const res = await logIn(accounts, authKey);
    expect(out(res).copy).toEqual({ ...c, version: 1 });
  });

  it('answers a wrong key and an unknown user with the same 401 body', async () => {
    const { accounts } = setup();
    const { authKey } = await join(accounts);
    const wrong = await logIn(accounts, b64(32));
    const unknown = await logIn(accounts, authKey, 'grace');
    expect(wrong.status).toBe(401);
    expect(unknown).toEqual(wrong);
    expect(JSON.stringify(wrong)).toBe('{"status":401,"body":{"error":"unauthorized"}}');
  });

  it('refuses a malformed log-in with 400', async () => {
    const { accounts } = setup();
    for (const body of [null, {}, { username: 'ada' }, { username: 'ada', authKey: 'x' }]) {
      expect((await accounts.login(body, IP)).status).toBe(400);
    }
  });

  it('rotates the token: the old one stops working, the new one works', async () => {
    const { store, accounts } = setup();
    const { authKey, token: first } = await join(accounts);
    const second = out<{ deviceToken: string }>(await logIn(accounts, authKey)).deviceToken;
    expect(second).not.toBe(first);

    expect((await put(accounts, first, 0)).status).toBe(401);
    expect((await put(accounts, second, 0)).status).toBe(200);
    // One pointer is left, for the live token.
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:t:'))).toEqual([
      `acct:t:${sha(second)}`,
    ]);
  });

  it('keeps the token when the key is wrong', async () => {
    const { accounts } = setup();
    const { token } = await join(accounts);
    await logIn(accounts, b64(32));
    expect((await put(accounts, token, 0)).status).toBe(200);
  });
});

describe('putCopy', () => {
  it('saves when baseVersion matches, giving version + 1 and the save time', async () => {
    const { store, accounts } = setup();
    const { token } = await join(accounts);
    const c = copyOf();
    const first = await put(accounts, token, 0, c);
    expect(first).toEqual({
      status: 200,
      body: { version: 1, savedAt: '2026-10-17T12:00:00.000Z' },
    });
    advance(60);
    const second = await put(accounts, token, 1);
    expect(second.body).toEqual({ version: 2, savedAt: '2026-10-17T12:01:00.000Z' });
    expect(store.dump()['acct:c:ada']).toMatchObject({ version: 2 });
  });

  it('answers 409 for a stale or a future baseVersion and keeps the stored copy', async () => {
    const { store, accounts } = setup();
    const { token } = await join(accounts);
    await put(accounts, token, 0);
    const kept = JSON.stringify(store.dump()['acct:c:ada']);
    for (const base of [0, 2, 9]) {
      expect(await put(accounts, token, base)).toEqual({
        status: 409,
        body: { error: 'conflict' },
      });
    }
    expect(JSON.stringify(store.dump()['acct:c:ada'])).toBe(kept);
  });

  it('lets only one of two uploads from the same version win', async () => {
    const { store, accounts } = setup(true);
    const { token } = await join(accounts);
    const a = copyOf();
    const b = copyOf();
    const results = await Promise.all([put(accounts, token, 0, a), put(accounts, token, 0, b)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results[0]?.status === 200 ? a : b;
    expect(store.dump()['acct:c:ada']).toEqual({
      ...winner,
      version: 1,
      savedAt: '2026-10-17T12:00:00.000Z',
    });
    // The next version can still be written once the race is over.
    expect((await put(accounts, token, 1)).status).toBe(200);
  });

  it('retries cleanly after the claim on a version has lapsed', async () => {
    const { store, accounts } = setup();
    const { token } = await join(accounts);
    // A writer that claimed version 0 and died before saving.
    await store.setNx('acct:cl:ada:2026-10-17T12:00:00.000Z:0', 1, 60);
    expect((await put(accounts, token, 0)).status).toBe(409);
    advance(61);
    expect((await put(accounts, token, 0)).status).toBe(200);
  });

  it('refuses over 1,000,000 bytes of ciphertext with 413, and takes exactly that many', async () => {
    const { store, accounts } = setup();
    const { token } = await join(accounts);
    const big = (n: number) => ({ iv: b64(12), ciphertext: 'A'.repeat(n) });
    expect(await put(accounts, token, 0, big(1_000_004))).toEqual({
      status: 413,
      body: { error: 'too large' },
    });
    expect(store.dump()['acct:c:ada']).toBeUndefined();
    expect((await put(accounts, token, 0, big(1_000_000))).status).toBe(200);
  });

  it('answers 401 to a missing, malformed, unknown or old Bearer', async () => {
    const { accounts } = setup();
    const { authKey, token } = await join(accounts);
    await logIn(accounts, authKey); // the first token is now old
    for (const bad of [null, '', 'garbage', b64(32).replace(/\+/g, '-'), token, 'A'.repeat(43)]) {
      expect(await put(accounts, bad, 0), String(bad)).toEqual({
        status: 401,
        body: { error: 'unauthorized' },
      });
    }
  });

  it('refuses a malformed body with 400', async () => {
    const { accounts } = setup();
    const { token } = await join(accounts);
    const ok = copyOf();
    const bad: unknown[] = [
      null,
      {},
      { ...ok },
      { ...ok, baseVersion: -1 },
      { ...ok, baseVersion: 1.5 },
      { ...ok, baseVersion: '0' },
      { ...ok, baseVersion: 0, iv: b64(8) },
      { ...ok, baseVersion: 0, iv: undefined },
      { ...ok, baseVersion: 0, ciphertext: 'not base64!' },
      { ...ok, baseVersion: 0, ciphertext: '' },
      { ...ok, baseVersion: 0, ciphertext: b64(8) },
    ];
    for (const body of bad) {
      expect((await accounts.putCopy(token, body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('leaves no copy behind when the account is deleted mid-upload', async () => {
    const store = memoryKvStore(() => clock);
    const accounts = createAccounts({ store, masterKey: MASTER, now: () => clock });
    const { token } = await join(accounts);
    // Deleting the account the moment the copy is written.
    const set = store.set.bind(store);
    store.set = async (key, value, ex) => {
      await set(key, value, ex);
      if (key === 'acct:c:ada') await store.del('acct:u:ada');
    };
    // The upload is refused as from an account that no longer exists, and its copy is removed.
    expect((await put(accounts, token, 0)).status).toBe(401);
    expect(store.dump()['acct:c:ada']).toBeUndefined();
  });
});

describe('changePassword', () => {
  const change = (a: Accounts, token: string | null, oldAuthKey: string, newAuthKey: string) =>
    a.changePassword(token, { oldAuthKey, newAuthKey, newWrappedPw: wrapped() });

  it('swaps the hash and the wrapped key, keeps the token, and the new key logs in', async () => {
    const { store, accounts } = setup();
    const { authKey, token } = await join(accounts);
    const before = store.dump()['acct:u:ada'] as Record<string, unknown>;
    const newKey = b64(32);
    const newWrappedPw = wrapped();

    const res = await accounts.changePassword(token, {
      oldAuthKey: authKey,
      newAuthKey: newKey,
      newWrappedPw,
    });
    expect(res).toEqual({ status: 204 });

    const after = store.dump()['acct:u:ada'] as Record<string, unknown>;
    expect(after.authHash).not.toBe(before.authHash);
    expect(after.authSalt).not.toBe(before.authSalt);
    expect(after.wrappedPw).toEqual(newWrappedPw);
    expect(after.wrappedServer).toEqual(before.wrappedServer);
    expect(after.deviceTokenHash).toBe(before.deviceTokenHash);
    expect(JSON.stringify(store.dump())).not.toContain(newKey);

    expect((await logIn(accounts, authKey)).status).toBe(401);
    const back = await logIn(accounts, newKey);
    expect(out(back).wrappedPw).toEqual(newWrappedPw);
    // The log-in just issued a new token, and that one uploads.
    expect((await put(accounts, out<{ deviceToken: string }>(back).deviceToken, 0)).status).toBe(
      200,
    );
  });

  it('keeps the device token working after the change', async () => {
    const { accounts } = setup();
    const { authKey, token } = await join(accounts);
    await change(accounts, token, authKey, b64(32));
    expect((await put(accounts, token, 0)).status).toBe(200);
  });

  it('gives 401 for a wrong old key and changes nothing', async () => {
    const { store, accounts } = setup();
    const { authKey, token } = await join(accounts);
    const before = JSON.stringify(store.dump()['acct:u:ada']);
    expect(await change(accounts, token, b64(32), b64(32))).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
    expect(JSON.stringify(store.dump()['acct:u:ada'])).toBe(before);
    expect((await logIn(accounts, authKey)).status).toBe(200);
  });

  it('gives 401 for a missing or unknown Bearer, before looking at the keys', async () => {
    const { accounts } = setup();
    const { authKey } = await join(accounts);
    for (const bad of [null, '', b64(32)]) {
      expect((await change(accounts, bad, authKey, b64(32))).status).toBe(401);
    }
  });

  it('refuses a malformed body with 400', async () => {
    const { accounts } = setup();
    const { authKey, token } = await join(accounts);
    const ok = { oldAuthKey: authKey, newAuthKey: b64(32), newWrappedPw: wrapped() };
    const bad: unknown[] = [
      null,
      {},
      { ...ok, oldAuthKey: 'x' },
      { ...ok, newAuthKey: 'x' },
      { ...ok, newWrappedPw: undefined },
      { ...ok, newWrappedPw: { iv: b64(12), ciphertext: b64(40) } },
    ];
    for (const body of bad) {
      expect((await accounts.changePassword(token, body)).status).toBe(400);
    }
  });

  it('limits guesses at the old key: the 11th in 15 minutes is 429', async () => {
    const { accounts } = setup();
    const { token } = await join(accounts);
    for (let i = 0; i < 10; i++) {
      expect((await change(accounts, token, b64(32), b64(32))).status).toBe(401);
    }
    const res = await change(accounts, token, b64(32), b64(32));
    expect(res).toMatchObject({ status: 429, retryAfter: 900 });
  });
});

describe('deleteAccount', () => {
  it('removes the account, the copy, the token pointer and its entry in the email set', async () => {
    const { store, accounts } = setup();
    const { authKey, token } = await join(accounts);
    const other = await join(accounts, { username: 'grace' }, '198.51.100.9');
    await put(accounts, token, 0);

    expect(await accounts.deleteAccount(token)).toEqual({ status: 204 });

    // A claim on a version lapses by itself within a minute; it is not account data.
    const keys = Object.keys(store.dump()).filter(
      (k) => k.startsWith('acct:') && !k.startsWith('acct:cl:'),
    );
    expect(keys.sort()).toEqual(
      ['acct:u:grace', 'acct:e:ada@example.com', `acct:t:${sha(other.token)}`].sort(),
    );
    // Grace shares the email, and stays in its set.
    expect(store.dump()['acct:e:ada@example.com']).toEqual(['grace']);

    expect((await logIn(accounts, authKey)).status).toBe(401);
    expect((await put(accounts, token, 0)).status).toBe(401);
    expect((await accounts.deleteAccount(token)).status).toBe(401);
    // The name is free again.
    expect((await join(accounts, {}, '198.51.100.10')).res.status).toBe(200);
  });

  it('refuses a missing or unknown Bearer and deletes nothing', async () => {
    const { store, accounts } = setup();
    await join(accounts);
    const before = JSON.stringify(store.dump());
    for (const bad of [null, '', b64(32)]) {
      expect((await accounts.deleteAccount(bad)).status).toBe(401);
    }
    expect(JSON.stringify(store.dump())).toBe(before);
  });
});

describe('rate limits', () => {
  it('turns away the 11th log-in for a username within 15 minutes, saying nothing of the account', async () => {
    const { accounts } = setup();
    const { authKey } = await join(accounts);
    for (let i = 0; i < 10; i++) expect((await logIn(accounts, b64(32))).status).toBe(401);

    const known = await logIn(accounts, authKey);
    expect(known).toEqual({ status: 429, body: { error: 'too many attempts' }, retryAfter: 900 });
    // A name that was never registered is turned away just the same.
    for (let i = 0; i < 10; i++) await logIn(accounts, b64(32), 'nobody');
    expect(await logIn(accounts, b64(32), 'nobody')).toEqual(known);

    advance(300);
    expect(await logIn(accounts, authKey)).toMatchObject({ status: 429, retryAfter: 600 });
  });

  it('opens the window again once it has ended', async () => {
    const { accounts } = setup();
    const { authKey } = await join(accounts);
    for (let i = 0; i < 11; i++) await logIn(accounts, b64(32));
    advance(899);
    expect((await logIn(accounts, authKey)).status).toBe(429);
    advance(2);
    expect((await logIn(accounts, authKey)).status).toBe(200);
  });

  it('limits log-ins per address too: the 31st in 15 minutes is 429, another address is fine', async () => {
    const { accounts } = setup();
    const { authKey } = await join(accounts);
    for (let i = 0; i < 30; i++) {
      expect((await logIn(accounts, b64(32), `user${i}`, '198.51.100.1')).status).toBe(401);
    }
    const res = await logIn(accounts, b64(32), 'user31', '198.51.100.1');
    expect(res).toMatchObject({ status: 429, retryAfter: 900 });
    expect((await logIn(accounts, authKey, 'ada', '198.51.100.2')).status).toBe(200);
  });

  it('limits sign-ups per address: the 6th in an hour is 429, and the hour resets it', async () => {
    const { store, accounts } = setup();
    for (let i = 0; i < 5; i++) {
      expect((await join(accounts, { username: `user${i}` }, IP)).res.status).toBe(200);
    }
    const sixth = await join(accounts, { username: 'user5' }, IP);
    expect(sixth.res).toEqual({
      status: 429,
      body: { error: 'too many attempts' },
      retryAfter: 3600,
    });
    expect(store.dump()['acct:u:user5']).toBeUndefined();

    expect((await join(accounts, { username: 'user5' }, '198.51.100.2')).res.status).toBe(200);
    advance(3601);
    expect((await join(accounts, { username: 'user6' }, IP)).res.status).toBe(200);
  });

  it('does not count a malformed sign-up against the address', async () => {
    const { accounts } = setup();
    for (let i = 0; i < 6; i++)
      expect((await join(accounts, { username: 'x' })).res.status).toBe(400);
    expect((await join(accounts)).res.status).toBe(200);
  });

  it('arms a window on a counter that lost its expiry, so it cannot lock forever', async () => {
    const store = memoryKvStore(() => clock);
    await store.incr('rl:test:who'); // an INCR whose EXPIRE never ran
    expect(await store.ttl('rl:test:who')).toBe(-1);
    expect(await rateLimit(store, 'test', 'who', 5, 60)).toEqual({ ok: true });
    expect(await store.ttl('rl:test:who')).toBe(60);
  });

  it('counts a window from its first attempt and does not stretch it', async () => {
    const store = memoryKvStore(() => clock);
    expect(await rateLimit(store, 'test', 'who', 2, 60)).toEqual({ ok: true });
    advance(30);
    expect(await rateLimit(store, 'test', 'who', 2, 60)).toEqual({ ok: true });
    expect(await rateLimit(store, 'test', 'who', 2, 60)).toEqual({ ok: false, retryAfter: 30 });
  });
});

describe('secrets', () => {
  const spied = () =>
    (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
  afterEach(() => vi.restoreAllMocks());

  it('logs nothing, and returns no secret, on any failure path', async () => {
    const spies = spied();
    const { accounts } = setup();
    const a = await join(accounts);
    const guess = b64(32);
    const guessToken = b64(32);
    const newKey = b64(32);
    const wrongDek = b64(16);
    const failures: Result[] = [
      (await join(accounts, { dek: a.dek })).res, // taken, with a real dek in the body
      (await join(accounts, { dek: wrongDek, username: 'grace' })).res,
      (await join(accounts, { authKey: guess.slice(1), username: 'grace' })).res,
      await logIn(accounts, guess),
      await logIn(accounts, guess, 'nobody'),
      await accounts.login({ username: 'ada', authKey: guess.slice(2) }, IP),
      await put(accounts, null, 0),
      await put(accounts, guessToken, 0),
      await put(accounts, a.token, 5),
      await put(accounts, a.token, 0, { iv: b64(12), ciphertext: 'A'.repeat(1_000_004) }),
      await accounts.putCopy(a.token, { baseVersion: 0, iv: a.dek, ciphertext: a.authKey }),
      await accounts.changePassword(a.token, {
        oldAuthKey: guess,
        newAuthKey: newKey,
        newWrappedPw: wrapped(),
      }),
      await accounts.changePassword(guessToken, {
        oldAuthKey: a.authKey,
        newAuthKey: newKey,
        newWrappedPw: wrapped(),
      }),
      await accounts.changePassword(a.token, { oldAuthKey: a.authKey, newAuthKey: newKey }),
      await accounts.deleteAccount(guessToken),
    ];
    for (let i = 0; i < 10; i++) failures.push(await logIn(accounts, guess));

    const secrets = [
      a.authKey,
      a.dek,
      a.token,
      guess,
      guessToken,
      newKey,
      wrongDek,
      MASTER.toString('base64'),
      MASTER.toString('hex'),
    ];
    const seen = JSON.stringify(failures);
    for (const secret of secrets) expect(seen).not.toContain(secret);
    expect(failures.filter((r) => r.status === 429).length).toBeGreaterThan(0);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('with the phone module', () => {
  const aesKey = (raw: Uint8Array) =>
    crypto.subtle.importKey('raw', new Uint8Array(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);

  it('canonicalises usernames exactly as the phone does', () => {
    for (const name of [
      'Ada.Lovelace',
      'JOSÉ',
      'ﬁsh',
      'İstanbul',
      'Kelvin',
      'ＡＤＡ',
      '',
      'Ϊ́',
      'Ϊ́',
      'Ώͅ',
    ]) {
      expect(canonicalUsername(name)).toBe(phoneCanonical(name));
    }
  });

  it('opens a data key the phone wrapped, and the phone opens one the server wrapped (AES-GCM tag last)', async () => {
    const { store, accounts } = setup();
    const { dek } = await join(accounts);

    // Server to phone: wrappedServer is ciphertext then the 16-byte tag, as WebCrypto reads it.
    const account = store.dump()['acct:u:ada'] as { wrappedServer: Sealed };
    expect((await unwrapDek(account.wrappedServer, await aesKey(MASTER))).raw).toBe(dek);

    // Phone to server.
    const fromPhone = await wrapDek(dek, await aesKey(MASTER));
    expect(unwrapServer({ wrappedServer: fromPhone }, MASTER).toString('base64')).toBe(dek);
  });

  it('re-wraps a data key under a password key the phone can open', async () => {
    const { kek } = await deriveAccountKeys('ada', PASSWORD, FAST);
    const kekBytes = Buffer.from(await exportKek(kek), 'base64');
    const dek = await newDek();

    const sealed = rewrapPassword(Buffer.from(dek.raw, 'base64'), kekBytes);
    expect(sealed.iv).toMatch(/^[A-Za-z0-9+/]{16}$/);
    expect(Buffer.from(sealed.ciphertext, 'base64')).toHaveLength(48);
    expect((await unwrapDek(sealed, kek)).raw).toBe(dek.raw);
  });

  it('runs sign-up and log-in with the phone-made keys, and the password opens the data key', async () => {
    const { accounts } = setup();
    const { authKey, kek } = await deriveAccountKeys('Ada', PASSWORD, FAST);
    const dek = await newDek();
    const wrappedPw = await wrapDek(dek.raw, kek);

    const signed = await accounts.signup(
      { username: 'Ada', email: 'ada@example.com', authKey, dek: dek.raw, wrappedPw },
      IP,
    );
    expect(signed.status).toBe(200);

    const phone2 = await deriveAccountKeys('ADA', PASSWORD, FAST);
    const res = await logIn(accounts, phone2.authKey, 'ADA');
    expect(res.status).toBe(200);
    const opened = await unwrapDek(out<{ wrappedPw: Sealed }>(res).wrappedPw, phone2.kek);
    expect(opened.raw).toBe(dek.raw);
  });
});
