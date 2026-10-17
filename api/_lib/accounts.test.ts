import * as nodeCrypto from 'node:crypto';
import { createHash, createHmac, hkdfSync, randomBytes, scrypt } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The phone's own module, by relative path: the cross tests below hold the server to its formats.
import {
  canonicalUsername as phoneCanonical,
  deriveAccountKeys,
  exportKek,
  KDF_PARAMS,
  newDek,
  unwrapDek,
  wrapDek,
  type KdfParams,
} from '../../src/data/accountCrypto';
import {
  canonicalUsername,
  createAccounts,
  masterKeyId,
  MasterKeyMismatch,
  rewrapPassword,
  unwrapServer,
  type Account,
  type Accounts,
  type Result,
  type Sealed,
} from './accounts.js';
import { rateLimit } from './rateLimit.js';
import { memoryKvStore, type KvStore } from './store.js';

// The real scrypt, watched: a log-in that must wait is answered before any of its work.
vi.mock('node:crypto', async (real) => {
  const crypto = await real<typeof import('node:crypto')>();
  return { ...crypto, scrypt: vi.fn(crypto.scrypt) };
});

const T0 = Date.parse('2026-10-17T12:00:00.000Z');
const MASTER = randomBytes(32);
const IP = '203.0.113.7';
const PASSWORD = 'correct horse battery';
/** Argon2id at its smallest: 8 KiB, one pass. */
const FAST = { memorySize: 8, iterations: 1, parallelism: 1 };
// Node's own Argon2id, from Node 24.7 (the engines field allows 22.12, where these checks skip).
const { argon2Sync } = nodeCrypto as Partial<typeof nodeCrypto>;

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

// Runs `wrapper` in place of one store method, with a way to carry on with the real call.
const around = (
  store: KvStore,
  method: keyof KvStore,
  wrapper: (args: unknown[], run: () => Promise<unknown>) => Promise<unknown>,
): KvStore =>
  new Proxy(store, {
    get(target, name, receiver) {
      const member: unknown = Reflect.get(target, name, receiver);
      if (name !== method || typeof member !== 'function') return member;
      return (...args: unknown[]) => wrapper(args, () => member.apply(target, args));
    },
  });

// A point two requests can be held at: `hit` says it was reached, `open` lets the holder go on.
const gate = () => {
  let open!: () => void;
  let hit!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const reached = new Promise<void>((resolve) => (hit = resolve));
  return { open, opened, hit, reached };
};

function setup(through: (store: KvStore) => KvStore = (store) => store) {
  const store = memoryKvStore(() => clock);
  const accounts = createAccounts({ store: through(store), masterKey: MASTER, now: () => clock });
  return { store, accounts };
}

const acctKeys = (store: { dump(): Record<string, unknown> }) =>
  // A claim on a version lapses by itself within a minute; it is not account data.
  Object.keys(store.dump()).filter((k) => k.startsWith('acct:') && !k.startsWith('acct:cl:'));
const claimKeys = (store: { dump(): Record<string, unknown> }) =>
  Object.keys(store.dump()).filter((k) => k.startsWith('acct:cl:'));

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
    const account = store.dump()['acct:u:ada'] as Account;
    expect(unwrapServer(account, MASTER).toString('base64')).toBe(dek);
    expect(account.wrappedServer.ciphertext).not.toContain(dek);
    // A different master key opens nothing.
    expect(() => unwrapServer(account, randomBytes(32))).toThrow();
    // It is bound to its account: in a record with another name, email or birth it doesn't open.
    for (const changed of [
      { username: 'grace' },
      { email: 'mallory@example.com' },
      { createdAt: '2026-10-17T12:00:01.000Z' },
    ]) {
      expect(() => unwrapServer({ ...account, ...changed }, MASTER)).toThrow();
    }
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
    const { store, accounts } = setup(lagged);
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

  it('does not call its own account taken when a retried write finds it already made', async () => {
    // The client retries a SET NX whose first try took effect but whose answer was lost: it sees
    // the key taken. The token hash in the account is this attempt's own, so the account is ours.
    const { store, accounts } = setup((s) =>
      around(s, 'setNx', async ([key], run) => {
        const won = await run();
        return key === 'acct:u:ada' ? false : won;
      }),
    );
    const { res, token } = await join(accounts);
    expect(res.status).toBe(200);
    expect(store.dump()['acct:u:ada']).toMatchObject({ deviceTokenHash: sha(token) });
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:t:'))).toEqual([
      `acct:t:${sha(token)}`,
    ]);
  });

  it('marks the account with the master key that wrapped its data key', async () => {
    const { store, accounts } = setup();
    await join(accounts);
    const account = store.dump()['acct:u:ada'] as Account;
    const idOf = (key: Uint8Array) =>
      createHmac('sha256', key).update('funancial key id').digest().subarray(0, 8).toString('hex');
    expect(account.keyId).toBe(idOf(MASTER));
    expect(account.keyId).toMatch(/^[0-9a-f]{16}$/);
    expect(unwrapServer(account, MASTER)).toHaveLength(32);

    // Another key is refused up front, by name, not as a failed decryption.
    const other = randomBytes(32);
    expect(idOf(other)).not.toBe(account.keyId);
    expect(() => unwrapServer(account, other)).toThrow(MasterKeyMismatch);
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
      email: 'ada@example.com',
    });
  });

  it('returns the copy, with its version', async () => {
    const { accounts } = setup();
    const { authKey, token } = await join(accounts);
    const c = copyOf();
    await put(accounts, token, 0, c);
    const res = await logIn(accounts, authKey);
    expect(out(res).copy).toEqual({ ...c, version: 1, savedAt: expect.any(String) });
  });

  it('returns the account email, to a phone that logs in and does not have it', async () => {
    const { accounts } = setup();
    const { authKey } = await join(accounts);
    expect(out(await logIn(accounts, authKey)).email).toBe('ada@example.com');
  });

  it('answers a wrong key and an unknown user with the same 401 body', async () => {
    const { accounts } = setup();
    const { authKey } = await join(accounts);
    const wrong = await logIn(accounts, b64(32));
    const unknown = await logIn(accounts, authKey, 'grace');
    expect(wrong.status).toBe(401);
    expect(unknown).toEqual(wrong);
    expect(JSON.stringify(wrong)).toBe('{"status":401,"body":{"error":"denied"}}');
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

  it('reads the copy before it rotates the token, so a failed read never logs the old phone out', async () => {
    let failing = true;
    const { store, accounts } = setup((s) =>
      around(s, 'get', async ([key], run) => {
        if (failing && key === 'acct:c:ada') throw new Error('store down');
        return run();
      }),
    );
    const { authKey, token } = await join(accounts);
    await expect(logIn(accounts, authKey)).rejects.toThrow('store down');

    expect(store.dump()['acct:u:ada']).toMatchObject({ deviceTokenHash: sha(token) });
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:t:'))).toEqual([
      `acct:t:${sha(token)}`,
    ]);
    failing = false;
    expect((await put(accounts, token, 0)).status).toBe(200);
  });

  it('answers with the newest copy: an upload acknowledged between its first read and the rotation is not missed', async () => {
    const g = gate();
    let reads = 0;
    const { accounts } = setup((s) =>
      around(s, 'get', async ([key], run) => {
        const value = await run();
        // Hold the log-in's own first read of the copy, after it has been taken.
        if (key === 'acct:c:ada' && ++reads === 1) {
          g.hit();
          await g.opened;
        }
        return value;
      }),
    );
    const { authKey, token } = await join(accounts);
    const loggingIn = logIn(accounts, authKey);
    await g.reached; // the log-in has read "no copy" and not rotated the token yet
    const c = copyOf();
    expect((await put(accounts, token, 0, c)).status).toBe(200); // acknowledged to the old phone
    g.open();

    const res = await loggingIn;
    expect(res.status).toBe(200);
    expect(out(res).copy).toEqual({ ...c, version: 1, savedAt: expect.any(String) });
  });

  it('falls back to its first read when the read after the rotation fails', async () => {
    let reads = 0;
    const { accounts } = setup((s) =>
      around(s, 'get', async ([key], run) => {
        if (key === 'acct:c:ada' && ++reads === 3) throw new Error('store down');
        return run();
      }),
    );
    const { authKey, token } = await join(accounts);
    const c = copyOf();
    await put(accounts, token, 0, c); // reads 1 (the version check)
    // The log-in's first read is the 2nd, and the one after the rotation is the 3rd, which fails.
    const res = await logIn(accounts, authKey);
    expect(res.status).toBe(200);
    expect(out(res).copy).toEqual({ ...c, version: 1, savedAt: expect.any(String) });
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

  it('answers 409 stale, with the stored version, for a base behind or ahead, and keeps the copy', async () => {
    const { store, accounts } = setup();
    const { token } = await join(accounts);
    expect(await put(accounts, token, 5)).toEqual({
      status: 409,
      body: { error: 'stale', version: 0 },
    });
    await put(accounts, token, 0);
    const kept = JSON.stringify(store.dump()['acct:c:ada']);
    for (const base of [0, 2, 9]) {
      expect(await put(accounts, token, base)).toEqual({
        status: 409,
        body: { error: 'stale', version: 1 },
      });
    }
    expect(JSON.stringify(store.dump()['acct:c:ada'])).toBe(kept);
  });

  it('lets only one of two uploads from the same version win', async () => {
    const { store, accounts } = setup(lagged);
    const { token } = await join(accounts);
    const a = copyOf();
    const b = copyOf();
    const results = await Promise.all([put(accounts, token, 0, a), put(accounts, token, 0, b)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    // The one that lost the claim is told to try later, not that it is stale.
    expect(results.find((r) => r.status === 409)?.body).toEqual({ error: 'busy', version: 0 });
    const winner = results[0]?.status === 200 ? a : b;
    expect(store.dump()['acct:c:ada']).toEqual({
      ...winner,
      version: 1,
      savedAt: '2026-10-17T12:00:00.000Z',
      createdAt: '2026-10-17T12:00:00.000Z',
    });
    // Retried after the race, the loser is stale and learns the version to re-base on.
    expect(await put(accounts, token, 0)).toEqual({
      status: 409,
      body: { error: 'stale', version: 1 },
    });
    expect((await put(accounts, token, 1)).status).toBe(200);
  });

  it('retries cleanly after the claim on a version has lapsed', async () => {
    const { store, accounts } = setup();
    const { token } = await join(accounts);
    // A writer that claimed version 0 and was killed before saving: no catch ran for it.
    await store.setNx('acct:cl:ada:2026-10-17T12:00:00.000Z:0', 'another-writer', 60);
    expect(await put(accounts, token, 0)).toEqual({
      status: 409,
      body: { error: 'busy', version: 0 },
    });
    advance(61);
    expect((await put(accounts, token, 0)).status).toBe(200);
  });

  it('lets go of its claim when the write fails, so the next try from the same version succeeds', async () => {
    let failing = true;
    const { store, accounts } = setup((s) =>
      around(s, 'set', async ([key], run) => {
        if (failing && key === 'acct:c:ada') throw new Error('store down');
        return run();
      }),
    );
    const { token } = await join(accounts);
    await expect(put(accounts, token, 0)).rejects.toThrow('store down');
    expect(claimKeys(store)).toEqual([]);

    failing = false;
    expect((await put(accounts, token, 0)).status).toBe(200);
  });

  it('takes a claim as its own when a retried write finds it already made', async () => {
    const { accounts } = setup((s) =>
      around(s, 'setNx', async ([key], run) => {
        const won = await run();
        return String(key).startsWith('acct:cl:') ? false : won;
      }),
    );
    const { token } = await join(accounts);
    expect((await put(accounts, token, 0)).status).toBe(200);
  });

  it('refuses over 1,000,000 bytes of ciphertext with 413, and takes exactly that many', async () => {
    const { store, accounts } = setup();
    const { token } = await join(accounts);
    // n counts bytes; the base64 that carries them is a third longer.
    const big = (n: number) => ({ iv: b64(12), ciphertext: b64(n) });
    expect(await put(accounts, token, 0, big(1_000_001))).toEqual({
      status: 413,
      body: { error: 'too large' },
    });
    expect(store.dump()['acct:c:ada']).toBeUndefined();
    const full = await put(accounts, token, 0, big(1_000_000));
    expect(full.status).toBe(200);
    expect((store.dump()['acct:c:ada'] as { ciphertext: string }).ciphertext).toHaveLength(
      1_333_336,
    );
  });

  it('answers 401 to a missing, malformed, unknown or old Bearer', async () => {
    const { accounts } = setup();
    const { authKey, token } = await join(accounts);
    await logIn(accounts, authKey); // the first token is now old
    for (const bad of [null, '', 'garbage', b64(32).replace(/\+/g, '-'), token, 'A'.repeat(43)]) {
      expect(await put(accounts, bad, 0), String(bad)).toEqual({
        status: 401,
        body: { error: 'moved' },
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

  it('refuses an upload whose token was replaced while it was written, and leaves the copy for the new phone to re-base on', async () => {
    const g = gate();
    const { store, accounts } = setup((s) =>
      around(s, 'set', async ([key], run) => {
        if (key === 'acct:c:ada') {
          g.hit();
          await g.opened;
        }
        return run();
      }),
    );
    const { authKey, token } = await join(accounts);
    const upload = put(accounts, token, 0);
    await g.reached;
    const second = out<{ deviceToken: string }>(await logIn(accounts, authKey)).deviceToken;
    g.open();

    expect((await upload).status).toBe(401);
    expect(store.dump()['acct:c:ada']).toMatchObject({ version: 1 });
    // The new phone's first upload is told the version, and goes on from it.
    expect(await put(accounts, second, 0)).toEqual({
      status: 409,
      body: { error: 'stale', version: 1 },
    });
    expect((await put(accounts, second, 1)).status).toBe(200);
  });
});

describe('a copy left by an earlier account of the same name', () => {
  const OLD = '2026-10-17T12:00:00.000Z';

  it('is not handed to the new account, and does not block its first upload (an upload held while the account was deleted and made again)', async () => {
    const g = gate();
    let held = false;
    const { store, accounts } = setup((s) =>
      around(s, 'set', async ([key], run) => {
        if (key === 'acct:c:ada' && !held) {
          held = true;
          g.hit();
          await g.opened;
        }
        return run();
      }),
    );
    const { token } = await join(accounts);
    const upload = put(accounts, token, 0);
    await g.reached;
    expect(await accounts.deleteAccount(token)).toEqual({ status: 204 });
    advance(1); // the new account has its own creation time
    const again = await join(accounts, {}, '198.51.100.20');
    expect(again.res.status).toBe(200);
    g.open();
    expect((await upload).status).toBe(401); // the old phone's token is gone
    // The old account's copy did land, under the old creation time.
    expect(store.dump()['acct:c:ada']).toMatchObject({ version: 1, createdAt: OLD });

    // A second phone logs in to the new account: no copy, and its first upload is from base 0.
    const res = await logIn(accounts, again.authKey, 'ada', '198.51.100.21');
    expect(res.status).toBe(200);
    expect(out(res).copy).toBeNull();
    const first = await put(accounts, out<{ deviceToken: string }>(res).deviceToken, 0);
    expect(first).toMatchObject({ status: 200, body: { version: 1 } });
    expect(store.dump()['acct:c:ada']).toMatchObject({
      version: 1,
      createdAt: '2026-10-17T12:00:01.000Z',
    });
  });

  it('is ignored too when the function that wrote it was killed before it could clean up', async () => {
    const g = gate();
    let held = false;
    let dying = false;
    const { store, accounts } = setup((s) =>
      around(
        around(s, 'set', async ([key], run) => {
          if (key === 'acct:c:ada' && !held) {
            held = true;
            g.hit();
            await g.opened;
          }
          return run();
        }),
        'get',
        async ([key], run) => {
          // The check after the write is where the function dies.
          if (dying && key === 'acct:u:ada') throw new Error('killed');
          return run();
        },
      ),
    );
    const { token } = await join(accounts);
    const upload = put(accounts, token, 0);
    await g.reached;
    expect(await accounts.deleteAccount(token)).toEqual({ status: 204 });
    dying = true;
    g.open();
    await expect(upload).rejects.toThrow('killed');
    dying = false;
    // No account is left, and its copy is.
    expect(acctKeys(store)).toEqual(['acct:c:ada']);

    advance(1);
    const again = await join(accounts, {}, '198.51.100.20');
    expect(again.res.status).toBe(200);
    const res = await logIn(accounts, again.authKey, 'ada', '198.51.100.21');
    expect(out(res).copy).toBeNull();
    const first = await put(accounts, out<{ deviceToken: string }>(res).deviceToken, 0);
    expect(first).toMatchObject({ status: 200, body: { version: 1 } });
  });
});

describe('deleting while uploading', () => {
  it("leaves no copy when the delete runs between the upload's checks and its write", async () => {
    const g = gate();
    const { store, accounts } = setup((s) =>
      around(s, 'set', async ([key], run) => {
        if (key === 'acct:c:ada') {
          g.hit();
          await g.opened;
        }
        return run();
      }),
    );
    const { token } = await join(accounts);
    const upload = put(accounts, token, 0);
    await g.reached; // the claim is made and the version read; the copy is not written yet
    expect(await accounts.deleteAccount(token)).toEqual({ status: 204 });
    g.open();

    expect((await upload).status).toBe(401);
    expect(acctKeys(store)).toEqual([]);
  });

  it("leaves no copy when an upload lands between the delete's own steps", async () => {
    const g = gate();
    const { store, accounts } = setup((s) =>
      around(s, 'srem', async (_args, run) => {
        g.hit();
        await g.opened;
        return run();
      }),
    );
    const { token } = await join(accounts);
    const deletion = accounts.deleteAccount(token);
    await g.reached; // the delete is part-way
    expect((await put(accounts, token, 0)).status).toBe(200);
    g.open();

    expect(await deletion).toEqual({ status: 204 });
    expect(acctKeys(store)).toEqual([]);
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

  it('tells a device token that no longer counts (moved) from a wrong password (denied)', async () => {
    const { accounts } = setup();
    const { authKey, token } = await join(accounts);
    await logIn(accounts, authKey); // the first token is now old
    const moved = { status: 401, body: { error: 'moved' } };
    expect(await put(accounts, token, 0)).toEqual(moved);
    expect(await change(accounts, token, authKey, b64(32))).toEqual(moved);
    expect(await accounts.deleteAccount(token)).toEqual(moved);
    const denied = { status: 401, body: { error: 'denied' } };
    expect(await logIn(accounts, b64(32))).toEqual(denied);
    const live = out<{ deviceToken: string }>(await logIn(accounts, authKey)).deviceToken;
    expect(await change(accounts, live, b64(32), b64(32))).toEqual(denied);
  });

  it('gives 401 for a wrong old key and changes nothing', async () => {
    const { store, accounts } = setup();
    const { authKey, token } = await join(accounts);
    const before = JSON.stringify(store.dump()['acct:u:ada']);
    expect(await change(accounts, token, b64(32), b64(32))).toEqual({
      status: 401,
      body: { error: 'denied' },
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

    const keys = acctKeys(store);
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
  const DENIED = { status: 401, body: { error: 'denied' } };
  const WAIT = (retryAfter: number) => ({
    status: 429,
    body: { error: 'too many attempts' },
    retryAfter,
  });
  // A new address for each try, as an attacker with many has: only the name's count applies.
  let address = 0;
  const tryKey = (accounts: Accounts, authKey: string, username = 'ada') =>
    logIn(accounts, authKey, username, `10.0.${Math.floor(address / 250)}.${address++ % 250}`);
  const fail = async (accounts: Accounts, times: number, username = 'ada') => {
    for (let i = 0; i < times; i++) {
      expect(await tryKey(accounts, b64(32), username)).toEqual(DENIED);
    }
  };

  it('makes a name wait 15 s from its 5th failed log-in, even with the right key', async () => {
    const { accounts } = setup();
    const { authKey } = await join(accounts);
    await fail(accounts, 4);
    expect((await tryKey(accounts, authKey)).status).toBe(200);
    await fail(accounts, 5);

    expect(await tryKey(accounts, authKey)).toEqual(WAIT(15));
    advance(14);
    expect(await tryKey(accounts, authKey)).toEqual(WAIT(1));
    advance(1);
    expect((await tryKey(accounts, authKey)).status).toBe(200);
  });

  it('answers the wait before it reads the account or runs scrypt', async () => {
    const reads: unknown[] = [];
    const { accounts } = setup((store) =>
      around(store, 'get', (args, run) => (reads.push(args[0]), run())),
    );
    const { authKey } = await join(accounts);
    await fail(accounts, 5);
    reads.length = 0;
    vi.mocked(scrypt).mockClear();

    expect(await tryKey(accounts, authKey)).toEqual(WAIT(15));
    expect(reads).not.toContain('acct:u:ada');
    expect(scrypt).not.toHaveBeenCalled();
  });

  it('doubles the wait with each failure after the 5th, up to 10 minutes', async () => {
    const { accounts } = setup();
    await join(accounts);
    await fail(accounts, 5);
    const waits: number[] = [];
    for (let i = 0; i < 8; i++) {
      const { status, retryAfter = 0 } = await tryKey(accounts, b64(32));
      expect(status).toBe(429);
      waits.push(retryAfter);
      advance(retryAfter);
      // Counted only now the wait is over: tries during it are turned away uncounted.
      await fail(accounts, 1);
    }
    expect(waits).toEqual([15, 30, 60, 120, 240, 480, 600, 600]);
  });

  it('forgets the failures 15 minutes after the last one, not the first', async () => {
    const { accounts } = setup();
    const { authKey } = await join(accounts);
    await fail(accounts, 1);
    advance(600);
    await fail(accounts, 3);
    // 20 minutes after the first failure, 10 after the last: the 5th still counts.
    advance(600);
    await fail(accounts, 1);
    expect(await tryKey(accounts, authKey)).toEqual(WAIT(15));

    advance(900);
    await fail(accounts, 4);
    expect((await tryKey(accounts, authKey)).status).toBe(200);
  });

  it('gives the count its lifetime in the step that counts, so a function cut off there leaves none for ever', async () => {
    let cut = false;
    // The function dies straight after the count: every store call after it fails.
    const { store, accounts } = setup(
      (real) =>
        new Proxy(real, {
          get(target, name, receiver) {
            const member: unknown = Reflect.get(target, name, receiver);
            if (typeof member !== 'function') return member;
            return async (...args: unknown[]) => {
              if (cut) throw new Error('cut off');
              const out: unknown = await member.apply(target, args);
              if (name === 'incr' && String(args[0]).startsWith('rl:login:fail:')) cut = true;
              return out;
            };
          },
        }),
    );
    await join(accounts);
    await tryKey(accounts, b64(32)).catch(() => {});
    expect(cut).toBe(true);
    expect(await store.ttl('rl:login:fail:ada')).toBe(900);
  });

  it('clears the count and the wait when a log-in succeeds', async () => {
    const { store, accounts } = setup();
    const { authKey } = await join(accounts);
    const left = () => Object.keys(store.dump()).filter((k) => /^rl:login:(fail|wait):/.test(k));
    await fail(accounts, 4);
    expect((await tryKey(accounts, authKey)).status).toBe(200);
    expect(left()).toEqual([]);

    // Past the 5th, a try sets the next wait before its check: a success takes that away too.
    await fail(accounts, 5);
    advance(15);
    expect((await tryKey(accounts, authKey)).status).toBe(200);
    expect(left()).toEqual([]);
    expect((await tryKey(accounts, authKey)).status).toBe(200);

    await fail(accounts, 4);
    expect((await tryKey(accounts, authKey)).status).toBe(200);
  });

  it('runs at most 6 password checks for a burst of tries at one name from as many addresses', async () => {
    for (const username of ['ada', 'nobody']) {
      const { accounts } = setup(lagged);
      await join(accounts);
      const burst = async () => {
        vi.mocked(scrypt).mockClear();
        const answers = await Promise.all(
          Array.from({ length: 40 }, () => tryKey(accounts, b64(32), username)),
        );
        const checks = vi.mocked(scrypt).mock.calls.length;
        // Each check is a wrong password; every other try was told how long to wait.
        expect(answers.filter((r) => r.status === 401)).toHaveLength(checks);
        for (const r of answers.filter((r) => r.status !== 401)) {
          expect(r.status).toBe(429);
          expect(r.retryAfter).toBeGreaterThan(0);
        }
        return checks;
      };
      expect(await burst(), username).toBeLessThanOrEqual(6);
      // Once its waits are over, the name is past its 5 free tries: one check for the next burst.
      advance(600);
      expect(await burst(), username).toBeLessThanOrEqual(1);
    }
  });

  it('counts a name with no account exactly as a wrong password, so neither says which it is', async () => {
    const { accounts } = setup();
    await join(accounts);
    const answers = async (username: string) => {
      const seen: Result[] = [];
      for (let i = 0; i < 7; i++) {
        seen.push(await tryKey(accounts, b64(32), username));
        if (i === 5) advance(15);
      }
      return seen;
    };
    const known = await answers('ada');
    expect(known.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 429, 401]);
    expect(await answers('nobody')).toEqual(known);
  });

  it('limits log-ins per address: the 11th in a minute is 429, another address is fine', async () => {
    const { accounts } = setup();
    const { authKey } = await join(accounts);
    for (let i = 0; i < 10; i++) {
      expect(await logIn(accounts, b64(32), `user${i}`, '198.51.100.1')).toEqual(DENIED);
    }
    expect(await logIn(accounts, authKey, 'ada', '198.51.100.1')).toEqual(WAIT(60));
    expect((await logIn(accounts, authKey, 'ada', '198.51.100.2')).status).toBe(200);
    advance(60);
    expect((await logIn(accounts, authKey, 'ada', '198.51.100.1')).status).toBe(200);
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

describe('request bodies', () => {
  it('are refused with 400 for a field the service does not know, at any depth, and change nothing', async () => {
    const { store, accounts } = setup();
    const a = await join(accounts);
    const before = JSON.stringify(store.dump());
    const extra = { isAdmin: true };
    const BAD = { status: 400, body: { error: 'bad request' } };

    expect((await join(accounts, { username: 'grace', ...extra })).res).toEqual(BAD);
    expect(
      (await join(accounts, { username: 'grace', wrappedPw: { ...wrapped(), ...extra } })).res,
    ).toEqual(BAD);
    expect(await accounts.login({ username: 'ada', authKey: a.authKey, ...extra }, IP)).toEqual(
      BAD,
    );
    expect(await accounts.putCopy(a.token, { baseVersion: 0, ...copyOf(), ...extra })).toEqual(BAD);
    const change = { oldAuthKey: a.authKey, newAuthKey: b64(32), newWrappedPw: wrapped() };
    expect(await accounts.changePassword(a.token, { ...change, ...extra })).toEqual(BAD);
    expect(
      await accounts.changePassword(a.token, {
        ...change,
        newWrappedPw: { ...wrapped(), ...extra },
      }),
    ).toEqual(BAD);
    expect(JSON.stringify(store.dump())).toBe(before);

    // The same bodies without it go through.
    expect((await accounts.login({ username: 'ada', authKey: a.authKey }, IP)).status).toBe(200);
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
      await put(accounts, a.token, 0, { iv: b64(12), ciphertext: b64(1_000_001) }),
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

describe('the phone derivation, against an Argon2id apart from its own', () => {
  /** What accountCrypto.ts describes, with Node's Argon2id (OpenSSL) and HKDF: no hash-wasm, no WebCrypto. */
  function independently(username: string, password: string, kdf: KdfParams) {
    const master = argon2Sync!('argon2id', {
      message: Buffer.from(password.normalize('NFKC')),
      nonce: createHash('sha256')
        .update(`funancial-account:${canonicalUsername(username)}`)
        .digest(),
      memory: kdf.memorySize,
      passes: kdf.iterations,
      parallelism: kdf.parallelism,
      tagLength: 32,
    });
    const split = (info: string) =>
      Buffer.from(hkdfSync('sha256', master, new Uint8Array(0), info, 32)).toString('base64');
    return { authKey: split('funancial auth'), kek: split('funancial enc') };
  }
  const phone = async (username: string, password: string, kdf?: KdfParams) => {
    const { authKey, kek } = await deriveAccountKeys(username, password, kdf);
    return { authKey, kek: await exportKek(kek) };
  };

  it.runIf(Boolean(argon2Sync))('checks the oracle against RFC 9106 §5.3 first', () => {
    const tag = argon2Sync!('argon2id', {
      message: Buffer.alloc(32, 1),
      nonce: Buffer.alloc(16, 2),
      secret: Buffer.alloc(8, 3),
      associatedData: Buffer.alloc(12, 4),
      memory: 32,
      passes: 3,
      parallelism: 4,
      tagLength: 32,
    });
    expect(tag.toString('hex')).toBe(
      '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659',
    );
  });

  it.runIf(Boolean(argon2Sync))(
    "gives the keys Node's Argon2id and HKDF give, with the app's parameters and others",
    async () => {
      expect(await phone('Ada.Lovelace', PASSWORD)).toEqual(
        independently('Ada.Lovelace', PASSWORD, KDF_PARAMS),
      );
      const cases: Array<[string, string, KdfParams]> = [
        ['Ada.Lovelace', PASSWORD, FAST],
        // An accented name and a ligature in the password (NFKC), and two passes over two lanes.
        ['JOSE\u0301', '\ufb01 and more words', FAST],
        ['ada', PASSWORD, { memorySize: 64, iterations: 2, parallelism: 2 }],
      ];
      for (const [name, password, kdf] of cases) {
        expect(await phone(name, password, kdf)).toEqual(independently(name, password, kdf));
      }
    },
  );

  it.runIf(Boolean(argon2Sync))(
    'gives the known answers the phone, the reset page and the e2e specs are held to',
    () => {
      // src/data/accountCrypto.test.ts
      expect(independently('Ada.Lovelace', PASSWORD, FAST)).toEqual({
        authKey: 'aarEa9zitUo8HYw0C8xWPUuydJoK5gq1r9gp1dBI5q8=',
        kek: '3j06rpX21YS4WjUn4IqoOi97HHbSjgyj9f81c0pv41E=',
      });
      expect(independently('Ada.Lovelace', PASSWORD, KDF_PARAMS)).toEqual({
        authKey: 'tvQBDpfBPb0en/81A5fMWJsQQ1eRXW7Wo4jUypYII5s=',
        kek: 'MlWLwDDry6A3PnLTZHweNzsfv2kdJC8ceUimErkaXiM=',
      });
      // site/reset/main.test.ts and tests/e2e/site/reset.spec.ts
      expect(independently('ada', 'a brand new password', KDF_PARAMS)).toEqual({
        authKey: 'lZxv41bid5O0MjkLF1yeGhyvPux4SnnbRdw+3PaAiq4=',
        kek: 'rVlb6vjMQaTT2CAzWvIHDx4oZlpcOTTaQSp1gApAqCs=',
      });
      // tests/e2e/account-settings.spec.ts
      expect(independently('Robin', 'a long enough password', KDF_PARAMS).authKey).toBe(
        'Vj0qBrtPRpdyMcSA5NoTGNqLuly/M1fklymvThxkE/s=',
      );
    },
  );
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

  it('seals wrappedServer as WebCrypto does (AES-GCM tag last), bound to the JSON of [username, email, createdAt]', async () => {
    const { store, accounts } = setup();
    const { dek } = await join(accounts);
    const account = store.dump()['acct:u:ada'] as Account;
    const key = await aesKey(MASTER);
    const additionalData = new TextEncoder().encode(
      JSON.stringify(['ada', 'ada@example.com', '2026-10-17T12:00:00.000Z']),
    );
    const bytes = (b64text: string) => Uint8Array.from(Buffer.from(b64text, 'base64'));

    // Server to WebCrypto: ciphertext then the 16-byte tag, under that additional data.
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes(account.wrappedServer.iv), additionalData },
      key,
      bytes(account.wrappedServer.ciphertext),
    );
    expect(Buffer.from(opened).toString('base64')).toBe(dek);

    // WebCrypto to server.
    const iv = randomBytes(12);
    const sealed = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData },
      key,
      bytes(dek),
    );
    const wrappedServer = {
      iv: iv.toString('base64'),
      ciphertext: Buffer.from(sealed).toString('base64'),
    };
    expect(unwrapServer({ ...account, wrappedServer }, MASTER).toString('base64')).toBe(dek);
    expect(account.keyId).toBe(masterKeyId(MASTER));
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
