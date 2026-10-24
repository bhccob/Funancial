import * as nodeCrypto from 'node:crypto';
import { createHash, createHmac, hkdfSync, randomBytes, randomInt, scrypt } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi, type MockedFunction } from 'vitest';
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
import { fakeMailer } from './mailer.js';
import { rateLimit } from './rateLimit.js';
import { memoryKvStore, type KvStore } from './store.js';

// The real scrypt, watched: a log-in that must wait is answered before any of its work. The real
// randomInt too, which a test can set for one call to know the code a send will make.
vi.mock('node:crypto', async (real) => {
  const crypto = await real<typeof import('node:crypto')>();
  return { ...crypto, scrypt: vi.fn(crypto.scrypt), randomInt: vi.fn(crypto.randomInt) };
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

// The same, with a mailer that keeps what it is asked to send, for the routes that send.
function setupMailed(through: (store: KvStore) => KvStore = (store) => store) {
  const store = memoryKvStore(() => clock);
  const mail = fakeMailer();
  const accounts = createAccounts({
    store: through(store),
    masterKey: MASTER,
    now: () => clock,
    mailer: mail,
  });
  return { store, accounts, mail };
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

describe('the emailed code', () => {
  const HOUR = 3600;
  const DAY = 24 * HOUR;
  const CODE_KEY = 'acct:v:ada@example.com';
  const TOO_MANY = (retryAfter: number) => ({
    status: 429,
    body: { error: 'too many attempts' },
    retryAfter,
  });
  const WRONG = { status: 401, body: { error: 'code' } };
  const EXPIRED = { status: 410, body: { error: 'expired' } };
  const TAKEN = { status: 409, body: { error: 'taken' } };

  const spied = () => {
    const all = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    return { all, error: all[3] };
  };
  afterEach(() => vi.restoreAllMocks());

  // randomInt is the real one, set for a call only where a test needs to know the code.
  const randomIntMock = vi.mocked(randomInt) as unknown as MockedFunction<
    (min: number, max: number) => number
  >;

  const ask = (accounts: Accounts, over: Record<string, unknown> = {}, ip = IP) =>
    accounts.code({ username: 'Ada', email: 'Ada@Example.com', ...over }, ip);
  /** The code in the newest email: "481 529" is 481529. */
  const sentCode = (mail: ReturnType<typeof fakeMailer>) =>
    /is (\d{3}) (\d{3})\./
      .exec(mail.sent.at(-1)?.text ?? '')
      ?.slice(1)
      .join('') ?? '';
  const wrongOf = (code: string) => (code === '000000' ? '000001' : '000000');
  /** An address of its own for the nth request, so no per-address limit gets in the way. */
  const ipOf = (n: number) => `10.1.${Math.floor(n / 250)}.${n % 250}`;
  /** What the record holds in place of a code: an HMAC over the address and the code, under a key of the master key's. */
  const codeKey = Buffer.from(
    hkdfSync('sha256', MASTER, new Uint8Array(0), 'funcial signup code', 32),
  );
  const hashOf = (address: string, code: string) =>
    createHmac('sha256', codeKey).update(`${address}\n${code}`).digest('hex');
  const NOT_SENT = { status: 503, body: { error: 'not sent' } };
  const refuseNextMail = (mail: ReturnType<typeof fakeMailer>) =>
    vi
      .spyOn(mail, 'send')
      .mockRejectedValueOnce(Object.assign(new Error('refused'), { code: 'ECONNECTION' }));

  it('sends a code: one email, in the words of the brief, and keeps only its hash for 10 minutes', async () => {
    const { store, accounts, mail } = setupMailed();
    expect(await ask(accounts)).toEqual({ status: 200, body: { ok: true } });

    expect(mail.sent).toHaveLength(1);
    const [sent] = mail.sent;
    expect(sent?.to).toBe('ada@example.com');
    expect(sent?.subject).toBe('Your Funcial code');
    expect(sent?.text).toMatch(
      /^Your Funcial code is \d{3} \d{3}\. It works for 10 minutes\. If you didn't ask for it, ignore this email\.$/,
    );

    const code = sentCode(mail);
    expect(code).toMatch(/^\d{6}$/);
    expect(randomInt).toHaveBeenCalledWith(0, 1_000_000);
    expect(store.dump()[CODE_KEY]).toEqual({
      hash: hashOf('ada@example.com', code),
      tries: 0,
      sentAt: T0,
    });
    expect(await store.ttl(CODE_KEY)).toBe(600);
    // Not a bare hash of the six digits, which anyone with the database could invert at once.
    expect(JSON.stringify(store.dump())).not.toContain(sha(code));
  });

  it('keys the stored hash to the address and the master key, so the same code gives a different hash for each', async () => {
    const { store, accounts, mail } = setupMailed();
    randomIntMock.mockReturnValueOnce(123456).mockReturnValueOnce(123456);
    await ask(accounts);
    await ask(accounts, { username: 'bob', email: 'bob@example.com' }, ipOf(1));
    expect(mail.sent.map((m) => m.text.slice(0, 29))).toEqual([
      'Your Funcial code is 123 456.',
      'Your Funcial code is 123 456.',
    ]);
    const ada = store.dump()[CODE_KEY] as { hash: string };
    const bob = store.dump()['acct:v:bob@example.com'] as { hash: string };
    expect(ada.hash).toBe(hashOf('ada@example.com', '123456'));
    expect(bob.hash).toBe(hashOf('bob@example.com', '123456'));
    expect(ada.hash).not.toBe(bob.hash);

    // Another master key hashes the same address and code to something else.
    const otherStore = memoryKvStore(() => clock);
    const other = createAccounts({
      store: otherStore,
      masterKey: randomBytes(32),
      now: () => clock,
      mailer: fakeMailer(),
    });
    randomIntMock.mockReturnValueOnce(123456);
    await ask(other);
    const elsewhere = otherStore.dump()[CODE_KEY] as { hash: string };
    expect(elsewhere.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(elsewhere.hash).not.toBe(ada.hash);

    // And the right code still works, for each address, with its own.
    expect((await join(accounts, { code: '123456' })).res.status).toBe(200);
    const second = { username: 'bob', email: 'bob@example.com', code: '123456' };
    expect((await join(accounts, second, ipOf(2))).res.status).toBe(200);
  });

  it('writes a code with leading zeros in full, in two groups of three', async () => {
    const { mail, accounts } = setupMailed();
    randomIntMock.mockReturnValueOnce(42);
    await ask(accounts);
    expect(mail.sent[0]?.text).toContain('Your Funcial code is 000 042.');
  });

  it('gives a taken name no code, in any spelling of it, and sends nothing', async () => {
    const { store, accounts, mail } = setupMailed();
    await join(accounts);
    for (const username of ['ada', 'ADA', 'ＡＤＡ']) {
      expect(await ask(accounts, { username, email: 'x@example.com' }, ipOf(1))).toEqual(TAKEN);
    }
    expect(mail.sent).toEqual([]);
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:v:'))).toEqual([]);
  });

  it('mails a code to an address that already has an account, just as to a new one, so asking cannot find who is signed up', async () => {
    const { store, accounts, mail } = setupMailed();
    await join(accounts);
    expect(store.dump()['acct:e:ada@example.com']).toEqual(['ada']);

    randomIntMock.mockReturnValueOnce(481529).mockReturnValueOnce(481529);
    const known = await ask(accounts, { username: 'grace' }, ipOf(1));
    const fresh = await ask(accounts, { username: 'heidi', email: 'heidi@example.com' }, ipOf(2));
    expect(known).toEqual({ status: 200, body: { ok: true } });
    expect(known).toEqual(fresh);
    expect(mail.sent.map((m) => m.to)).toEqual(['ada@example.com', 'heidi@example.com']);

    const record = store.dump()[CODE_KEY] as Record<string, unknown>;
    const other = store.dump()['acct:v:heidi@example.com'] as Record<string, unknown>;
    expect(record).toEqual({
      hash: hashOf('ada@example.com', '481529'),
      tries: 0,
      sentAt: T0,
    });
    expect(Object.keys(record)).toEqual(Object.keys(other));
    expect(await store.ttl(CODE_KEY)).toBe(await store.ttl('acct:v:heidi@example.com'));
  });

  it('counts a taken name against the address like any request, so it cannot be probed without limit', async () => {
    const { accounts } = setupMailed();
    await join(accounts);
    for (let i = 0; i < 5; i++) expect(await ask(accounts)).toEqual(TAKEN);
    expect(await ask(accounts)).toEqual(TOO_MANY(HOUR));
  });

  it('refuses a bad body with 400, sending and counting nothing', async () => {
    const { store, accounts, mail } = setupMailed();
    const bad: Array<Record<string, unknown>> = [
      { username: 'ab' },
      { username: 'has space' },
      { username: undefined },
      { email: 'nope' },
      { email: `${'a'.repeat(250)}@x.io` },
      { email: undefined },
      { authKey: b64(32) },
      { code: '123456' },
    ];
    for (const over of bad) {
      expect(await ask(accounts, over), JSON.stringify(over)).toEqual({
        status: 400,
        body: { error: 'bad request' },
      });
    }
    for (const body of [null, 'x', 7, [], {}]) {
      expect((await accounts.code(body, IP)).status).toBe(400);
    }
    expect(mail.sent).toEqual([]);
    expect(Object.keys(store.dump())).toEqual([]);
  });

  it('is not configured without a mailer, and touches nothing', async () => {
    const { store, accounts } = setup();
    expect(await ask(accounts)).toEqual({ status: 503, body: { error: 'not configured' } });
    expect(Object.keys(store.dump())).toEqual([]);
  });

  it('replaces the old code with a new one: only the newest works', async () => {
    const { store, accounts, mail } = setupMailed();
    randomIntMock.mockReturnValueOnce(111111).mockReturnValueOnce(222222);
    await ask(accounts);
    advance(31);
    await ask(accounts);
    expect(mail.sent.map((m) => m.text.slice(0, 29))).toEqual([
      'Your Funcial code is 111 111.',
      'Your Funcial code is 222 222.',
    ]);
    // The new record has its own 10 minutes, from its own send.
    expect(store.dump()[CODE_KEY]).toMatchObject({ sentAt: T0 + 31_000 });
    expect(await store.ttl(CODE_KEY)).toBe(600);

    expect((await join(accounts, { code: '111111' })).res).toEqual(WRONG);
    expect((await join(accounts, { code: '222222' })).res.status).toBe(200);
  });

  it('makes a new send start the tries again', async () => {
    const { accounts, mail } = setupMailed();
    await ask(accounts);
    for (let i = 0; i < 4; i++) {
      expect((await join(accounts, { code: wrongOf(sentCode(mail)) })).res).toEqual(WRONG);
    }
    advance(31);
    await ask(accounts);
    for (let i = 0; i < 4; i++) {
      expect((await join(accounts, { code: wrongOf(sentCode(mail)) })).res).toEqual(WRONG);
    }
    expect((await join(accounts, { code: sentCode(mail) })).res.status).toBe(200);
  });

  it('keeps 30 seconds between codes for an address, and says how long is left', async () => {
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    advance(10);
    expect(await ask(accounts, {}, ipOf(1))).toEqual(TOO_MANY(20));
    advance(19);
    expect(await ask(accounts, {}, ipOf(2))).toEqual(TOO_MANY(1));
    expect(mail.sent).toHaveLength(1);
    // A refusal for being too soon uses up none of the day's emails.
    expect(store.dump()['rl:code:global:all']).toBe(1);

    advance(1);
    expect((await ask(accounts, {}, ipOf(3))).status).toBe(200);
    expect(mail.sent).toHaveLength(2);
    // Another address has its own gap.
    expect((await ask(accounts, { username: 'bob', email: 'bob@example.com' })).status).toBe(200);
  });

  it('sends five codes an hour to one address, then makes it wait out the hour', async () => {
    const { accounts, mail } = setupMailed();
    for (let i = 0; i < 5; i++) {
      expect((await ask(accounts, {}, ipOf(i))).status).toBe(200);
      advance(31);
    }
    // 155 s into the hour.
    expect(await ask(accounts, {}, ipOf(9))).toEqual(TOO_MANY(HOUR - 155));
    expect(mail.sent).toHaveLength(5);

    advance(HOUR - 155);
    expect((await ask(accounts, {}, ipOf(10))).status).toBe(200);
    expect(mail.sent).toHaveLength(6);
  });

  it('sends five codes an hour from one address, however many emails they are for', async () => {
    const { accounts, mail } = setupMailed();
    for (let i = 0; i < 5; i++) {
      const who = { username: `user${i}`, email: `user${i}@example.com` };
      expect((await ask(accounts, who)).status).toBe(200);
    }
    const sixth = { username: 'user5', email: 'user5@example.com' };
    expect(await ask(accounts, sixth)).toEqual(TOO_MANY(HOUR));
    expect(mail.sent).toHaveLength(5);
    expect((await ask(accounts, sixth, '198.51.100.2')).status).toBe(200);
  });

  it('has a daily cap of its own, inside the one it shares with forgot-password', async () => {
    const spies = spied();
    const { store, accounts, mail } = setupMailed();
    await join(accounts, { username: 'grace', email: 'grace@example.com' });
    for (let i = 0; i < 150; i++) {
      const who = { username: `user${i}`, email: `user${i}@example.com` };
      expect((await ask(accounts, who, ipOf(i))).status, `code ${i + 1}`).toBe(200);
    }
    expect(mail.sent).toHaveLength(150);
    expect(spies.error).not.toHaveBeenCalled();

    // The 151st is turned away, and uses none of forgot-password's share.
    const who = { username: 'user150', email: 'user150@example.com' };
    expect(await ask(accounts, who, ipOf(150))).toEqual(TOO_MANY(DAY));
    expect(mail.sent).toHaveLength(150);
    expect(store.dump()['rl:forgot:global:all']).toBe(150);
    expect(spies.error?.mock.calls).toEqual([['[api] code email skipped: cap']]);

    // Forgot-password still has the other 150.
    expect(await accounts.forgot({ who: 'grace' }, IP)).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(mail.sent).toHaveLength(151);
    expect(mail.sent[150]?.subject).toBe('Choose a new Funcial password');

    // A day later codes go again.
    advance(DAY + 1);
    expect((await ask(accounts, who, ipOf(151))).status).toBe(200);
  });

  it('stops when the daily cap it shares with forgot-password is used up', async () => {
    const { store, accounts, mail } = setupMailed();
    for (let i = 0; i < 300; i++) await rateLimit(store, 'forgot:global', 'all', 300, DAY);
    expect(await ask(accounts)).toEqual(TOO_MANY(DAY));
    expect(mail.sent).toEqual([]);
    expect(store.dump()[CODE_KEY]).toBeUndefined();
  });

  it('counts a code against both daily caps', async () => {
    const { store, accounts } = setupMailed();
    await ask(accounts);
    expect(store.dump()['rl:code:global:all']).toBe(1);
    expect(store.dump()['rl:forgot:global:all']).toBe(1);
  });

  it('answers 503 not sent, and keeps no code, when the email cannot go; the person can ask again at once', async () => {
    const spies = spied();
    const { store, accounts, mail } = setupMailed();
    const failure = Object.assign(new Error('refused for ada@example.com, 123456'), {
      code: 'ECONNECTION',
    });
    vi.spyOn(mail, 'send').mockRejectedValueOnce(failure);

    expect(await ask(accounts)).toEqual({ status: 503, body: { error: 'not sent' } });
    expect(store.dump()[CODE_KEY]).toBeUndefined();
    // Only the kind of failure is logged: no address, no code, no message.
    expect(spies.error?.mock.calls).toEqual([['[api] code email failed:', 'ECONNECTION']]);

    // There is no code to wait for, so there is no gap.
    expect((await ask(accounts)).status).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(store.dump()[CODE_KEY]).toBeDefined();
  });

  it('keeps the earlier code, with its tries and what is left of its 10 minutes, when a resend cannot go', async () => {
    const spies = spied();
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    const first = sentCode(mail);
    expect((await join(accounts, { code: wrongOf(first) })).res).toEqual(WRONG);
    const before = store.dump()[CODE_KEY];
    expect(before).toMatchObject({ tries: 1, sentAt: T0 });

    advance(40);
    refuseNextMail(mail);
    expect(await ask(accounts)).toEqual(NOT_SENT);
    expect(spies.error?.mock.calls).toEqual([['[api] code email failed:', 'ECONNECTION']]);
    // The record is the one it was, not the one the failed send wrote.
    expect(store.dump()[CODE_KEY]).toEqual(before);
    expect(await store.ttl(CODE_KEY)).toBe(560);

    // Its gap is the old one, long past: the person can ask again at once, and the first code works.
    expect((await join(accounts, { code: first })).res.status).toBe(200);
  });

  it('lets the person ask again at once after a failed resend, and the new code then replaces the earlier one', async () => {
    const { accounts, mail } = setupMailed();
    await ask(accounts);
    const first = sentCode(mail);
    advance(31);
    refuseNextMail(mail);
    expect(await ask(accounts)).toEqual(NOT_SENT);
    randomIntMock.mockReturnValueOnce(first === '654321' ? 123456 : 654321);
    expect((await ask(accounts)).status).toBe(200);
    expect(sentCode(mail)).not.toBe(first);
    expect((await join(accounts, { code: first })).res).toEqual(WRONG);
    expect((await join(accounts, { code: sentCode(mail) })).res.status).toBe(200);
  });

  it('still puts the earlier code back when a try was counted on the new one while its email was out', async () => {
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    const first = sentCode(mail);
    const before = store.dump()[CODE_KEY];
    advance(31);
    randomIntMock.mockReturnValueOnce(first === '111111' ? 222222 : 111111);
    const wrong = first === '222222' ? '333333' : '222222';
    vi.spyOn(mail, 'send').mockImplementationOnce(async () => {
      // The new record is already written: this try is counted on it, so the restore's first write loses.
      expect((await join(accounts, { code: wrong }, ipOf(7))).res).toEqual(WRONG);
      expect(store.dump()[CODE_KEY]).toMatchObject({ tries: 1, sentAt: T0 + 31_000 });
      throw Object.assign(new Error('refused'), { code: 'ECONNECTION' });
    });
    expect(await ask(accounts, {}, ipOf(1))).toEqual(NOT_SENT);
    expect(store.dump()[CODE_KEY]).toEqual(before);
    expect((await join(accounts, { code: first })).res.status).toBe(200);
  });

  it('leaves a newer code alone: a failed send puts back nothing over a record it did not write', async () => {
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    advance(31);
    vi.spyOn(mail, 'send').mockImplementationOnce(async () => {
      // Another record replaces the one this send wrote (as a send past the gap would).
      await store.set(CODE_KEY, { hash: 'x'.repeat(64), tries: 0, sentAt: clock + 1 }, 600);
      throw Object.assign(new Error('refused'), { code: 'ECONNECTION' });
    });
    expect(await ask(accounts, {}, ipOf(1))).toEqual(NOT_SENT);
    expect(store.dump()[CODE_KEY]).toMatchObject({ hash: 'x'.repeat(64) });
  });

  it('knows its own record by its hash and its time, so a copy of the hash made later is not undone either', async () => {
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    advance(31);
    vi.spyOn(mail, 'send').mockImplementationOnce(async () => {
      const written = store.dump()[CODE_KEY] as { hash: string; tries: number; sentAt: number };
      await store.set(CODE_KEY, { ...written, sentAt: written.sentAt + 1 }, 600);
      throw Object.assign(new Error('refused'), { code: 'ECONNECTION' });
    });
    expect(await ask(accounts, {}, ipOf(1))).toEqual(NOT_SENT);
    expect(store.dump()[CODE_KEY]).toMatchObject({ sentAt: T0 + 31_000 + 1 });
  });

  it('writes a new code only over the record the gap check saw: a code spent meanwhile is not brought back by a failed resend', async () => {
    // The resend is held between its gap check and its write; the person spends the earlier code.
    let armed = false;
    const held = gate();
    const { store, accounts, mail } = setupMailed((s) =>
      around(s, 'incr', async (args, run) => {
        if (armed && String(args[0]).startsWith('rl:code:email:')) {
          armed = false;
          held.hit();
          await held.opened;
        }
        return run();
      }),
    );
    await ask(accounts);
    const first = sentCode(mail);
    advance(31);
    armed = true;
    const resend = ask(accounts, {}, ipOf(1));
    await held.reached;

    expect((await join(accounts, { code: first }, ipOf(2))).res.status).toBe(200);
    const refused = refuseNextMail(mail);
    held.open();

    // The key is not what it read, so it wrote nothing and sent nothing, and told the person to wait.
    expect(await resend).toEqual(TOO_MANY(1));
    expect(refused).not.toHaveBeenCalled();
    expect(mail.sent).toHaveLength(1);
    expect(store.dump()[CODE_KEY]).toBeUndefined();
    // So the spent code stays spent.
    const again = await join(accounts, { username: 'grace', code: first }, ipOf(3));
    expect(again.res).toEqual(EXPIRED);
    expect(store.dump()['acct:u:grace']).toBeUndefined();
  });

  it('sends one email when two requests for an address pass the 30 s gap together, with none before', async () => {
    const { store, accounts, mail } = setupMailed(lagged);
    const answers = await Promise.all([
      ask(accounts, {}, ipOf(1)),
      ask(accounts, {}, ipOf(2)),
      ask(accounts, {}, ipOf(3)),
    ]);
    expect(answers.filter((r) => r.status === 200)).toHaveLength(1);
    // The others are told when the one that won will have its 30 s up.
    for (const r of answers.filter((r) => r.status !== 200)) expect(r).toEqual(TOO_MANY(30));
    expect(mail.sent).toHaveLength(1);
    expect(store.dump()[CODE_KEY]).toEqual({
      hash: hashOf('ada@example.com', sentCode(mail)),
      tries: 0,
      sentAt: T0,
    });
    expect(await store.ttl(CODE_KEY)).toBe(600);
  });

  it('sends one email when two requests pass the gap together over an earlier code', async () => {
    const { store, accounts, mail } = setupMailed(lagged);
    await ask(accounts);
    advance(31);
    const answers = await Promise.all([ask(accounts, {}, ipOf(1)), ask(accounts, {}, ipOf(2))]);
    expect(answers.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(mail.sent).toHaveLength(2);
    expect(store.dump()[CODE_KEY]).toMatchObject({
      hash: hashOf('ada@example.com', sentCode(mail)),
      sentAt: T0 + 31_000,
    });
    // The write that took the key gave it a lifetime again.
    expect(await store.ttl(CODE_KEY)).toBe(600);
  });

  it('answers a sign-up whose code was accepted even when tidying the key away fails', async () => {
    // After the write that spends the code lands, the store refuses the lifetime and the delete.
    const hiccup = (args: unknown[], run: () => Promise<unknown>) =>
      args.includes(CODE_KEY) ? Promise.reject(new Error('store hiccup')) : run();
    const { store, accounts, mail } = setupMailed((s) =>
      around(around(s, 'expire', hiccup), 'del', hiccup),
    );
    await ask(accounts);
    const code = sentCode(mail);
    // A wrong try is answered as one, not as an outage.
    expect((await join(accounts, { code: wrongOf(code) })).res).toEqual(WRONG);
    expect(store.dump()[CODE_KEY]).toMatchObject({ tries: 1 });

    const made = await join(accounts, { code });
    expect(made.res.status).toBe(200);
    expect(store.dump()['acct:u:ada']).toMatchObject({ emailVerified: true });
    // The key could not be removed, and still the code is spent.
    expect(store.dump()[CODE_KEY]).toMatchObject({ tries: 5 });
    expect((await join(accounts, { username: 'grace', code }, ipOf(1))).res).toEqual(EXPIRED);
  });

  it('ends a code after five wrong tries: the sixth, even with the right code, is expired', async () => {
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    const code = sentCode(mail);
    for (let i = 0; i < 5; i++) {
      expect((await join(accounts, { code: wrongOf(code) })).res, `try ${i + 1}`).toEqual(WRONG);
    }
    expect(store.dump()[CODE_KEY]).toBeUndefined();
    expect((await join(accounts, { code })).res).toEqual(EXPIRED);
    expect(store.dump()['acct:u:ada']).toBeUndefined();

    // A new code starts afresh.
    advance(31);
    await ask(accounts);
    expect((await join(accounts, { code: sentCode(mail) })).res.status).toBe(200);
  });

  it('still takes the right code after four wrong tries', async () => {
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    const code = sentCode(mail);
    for (let i = 0; i < 4; i++) await join(accounts, { code: wrongOf(code) });
    expect(store.dump()[CODE_KEY]).toMatchObject({ tries: 4 });
    expect((await join(accounts, { code })).res.status).toBe(200);
  });

  it('counts every wrong try even when they arrive at once, so the five tries cannot be raced', async () => {
    const { store, accounts, mail } = setupMailed(lagged);
    await ask(accounts);
    const code = sentCode(mail);
    const tries = await Promise.all(
      Array.from({ length: 30 }, (_, i) => join(accounts, { code: wrongOf(code) }, ipOf(i))),
    );
    const told = tries.filter(({ res }) => res.status === 401).length;
    expect(told).toBeGreaterThan(0);
    expect(told).toBeLessThanOrEqual(5);
    // Each wrong answer was a try that was counted; the rest were turned away without a verdict.
    const record = store.dump()[CODE_KEY] as { tries: number } | undefined;
    expect(record?.tries ?? 5).toBe(told);
    for (const { res } of tries.filter(({ res }) => res.status !== 401)) {
      expect([410, 429]).toContain(res.status);
    }
    expect(store.dump()['acct:u:ada']).toBeUndefined();
  });

  it('lets only one of many sign-ups at once spend a right code, whatever the names', async () => {
    const { store, accounts, mail } = setupMailed(lagged);
    await ask(accounts);
    const code = sentCode(mail);
    const answers = await Promise.all(
      Array.from({ length: 10 }, (_, i) => join(accounts, { username: `user${i}`, code }, ipOf(i))),
    );
    expect(answers.filter(({ res }) => res.status === 200)).toHaveLength(1);
    for (const { res } of answers.filter(({ res }) => res.status !== 200)) {
      expect([410, 429]).toContain(res.status);
    }
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:u:'))).toHaveLength(1);
    expect(store.dump()[CODE_KEY]).toBeUndefined();
  });

  it('turns a second sign-up away even while the first, which was accepted, has not yet tidied the code away', async () => {
    // The first sign-up is held just before it deletes the key; a second one then runs whole.
    const held = gate();
    const { store, accounts, mail } = setupMailed((s) =>
      around(s, 'del', async (args, run) => {
        if (!args.includes(CODE_KEY)) return run();
        held.hit();
        await held.opened;
        return run();
      }),
    );
    await ask(accounts);
    const code = sentCode(mail);
    const first = join(accounts, { username: 'user1', code }, ipOf(1));
    await held.reached;
    const second = await join(accounts, { username: 'user2', code }, ipOf(2));
    held.open();

    expect(second.res).toEqual(EXPIRED);
    expect((await first).res.status).toBe(200);
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:u:'))).toEqual([
      'acct:u:user1',
    ]);
  });

  it('spends a right code in the write that accepts it, so a delete that never lands leaves it spent', async () => {
    // Every delete of the code key is lost, as if the function were cut off before it ran.
    const { store, accounts, mail } = setupMailed((s) =>
      around(s, 'del', (args, run) => (args.includes(CODE_KEY) ? Promise.resolve() : run())),
    );
    await ask(accounts);
    const code = sentCode(mail);
    expect((await join(accounts, { code })).res.status).toBe(200);
    expect(store.dump()[CODE_KEY]).toBeDefined();

    const again = await join(accounts, { username: 'grace', code }, ipOf(1));
    expect(again.res).toEqual(EXPIRED);
    expect(store.dump()['acct:u:grace']).toBeUndefined();
    // A wrong try does not bring it back either.
    expect((await join(accounts, { username: 'grace', code: wrongOf(code) }, ipOf(2))).res).toEqual(
      EXPIRED,
    );
  });

  it('expires a code after 10 minutes', async () => {
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    const code = sentCode(mail);
    advance(599);
    expect((await join(accounts, { code: wrongOf(code) })).res).toEqual(WRONG);
    // The wrong try did not give it a new lifetime.
    expect(await store.ttl(CODE_KEY)).toBe(1);
    advance(2);
    expect((await join(accounts, { code })).res).toEqual(EXPIRED);
    expect(store.dump()['acct:u:ada']).toBeUndefined();
  });

  it('says expired for an address that was sent no code at all', async () => {
    const { accounts } = setupMailed();
    expect((await join(accounts, { code: '123456' })).res).toEqual(EXPIRED);
  });

  it('makes a verified account with the right code, and uses the code up', async () => {
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    const code = sentCode(mail);
    const first = await join(accounts, { code });
    expect(first.res.status).toBe(200);
    expect(store.dump()['acct:u:ada']).toMatchObject({ emailVerified: true });
    expect(store.dump()[CODE_KEY]).toBeUndefined();

    // The same code does not make a second account.
    const again = await join(accounts, { username: 'grace', code });
    expect(again.res).toEqual(EXPIRED);
    expect(store.dump()['acct:u:grace']).toBeUndefined();
  });

  it('refuses a code that is not for the address in the sign-up', async () => {
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    const code = sentCode(mail);
    const other = await join(accounts, { email: 'eve@example.com', code });
    expect(other.res).toEqual(EXPIRED);
    expect(store.dump()['acct:u:ada']).toBeUndefined();
    // Its own address's code is untouched by the try.
    expect(store.dump()[CODE_KEY]).toMatchObject({ tries: 0 });
  });

  it('still makes an account without a code, marked unverified', async () => {
    const { store, accounts } = setup();
    const { res } = await join(accounts);
    expect(res.status).toBe(200);
    expect(store.dump()['acct:u:ada']).toMatchObject({ emailVerified: false });
  });

  it('answers a retried sign-up with taken before it looks at the code', async () => {
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    const code = sentCode(mail);
    expect((await join(accounts, { code })).res.status).toBe(200);
    const before = JSON.stringify(store.dump()['acct:u:ada']);

    // The reply was lost and the phone sends it again: the code is long gone, and still it is taken.
    expect((await join(accounts, { code })).res).toEqual(TAKEN);
    expect((await join(accounts, { code: wrongOf(code) })).res).toEqual(TAKEN);
    expect((await join(accounts)).res).toEqual(TAKEN);
    expect(JSON.stringify(store.dump()['acct:u:ada'])).toBe(before);
    // Nothing about a code was looked at, so no try was counted after the first.
    expect(store.dump()['rl:code:try:' + IP]).toBe(1);
  });

  it('counts wrong codes in their own bucket: six wrong ones do not use up the sign-up limit', async () => {
    const { store, accounts, mail } = setupMailed();
    await ask(accounts);
    for (let i = 0; i < 4; i++) {
      expect((await join(accounts, { code: wrongOf(sentCode(mail)) })).res).toEqual(WRONG);
    }
    advance(31);
    await ask(accounts);
    for (let i = 0; i < 2; i++) {
      expect((await join(accounts, { code: wrongOf(sentCode(mail)) })).res).toEqual(WRONG);
    }
    // Six wrong tries from this address; sign-up's five an hour are untouched.
    expect(store.dump()['rl:code:try:' + IP]).toBe(6);
    expect(store.dump()['rl:signup:ip:' + IP]).toBeUndefined();

    const right = await join(accounts, { code: sentCode(mail) });
    expect(right.res.status).toBe(200);
    expect(store.dump()['rl:signup:ip:' + IP]).toBe(1);
  });

  it('stops a flood of codes tried at 20 an hour per address, before it looks at any code', async () => {
    const { store, accounts, mail } = setupMailed();
    for (let round = 0; round < 4; round++) {
      await ask(accounts, {}, ipOf(round));
      for (let i = 0; i < 5; i++) {
        expect((await join(accounts, { code: wrongOf(sentCode(mail)) })).res.status).toBe(401);
      }
      advance(31);
    }
    await ask(accounts, {}, ipOf(9));
    const code = sentCode(mail);
    const blocked = await join(accounts, { code });
    expect(blocked.res).toEqual(TOO_MANY(HOUR - 124));
    // The key was not touched: the code is whole, and the account is not made.
    expect(store.dump()[CODE_KEY]).toMatchObject({ tries: 0 });
    expect(store.dump()['acct:u:ada']).toBeUndefined();
    // Another address is not held up.
    expect((await join(accounts, { code }, '198.51.100.9')).res.status).toBe(200);
  });

  it('refuses a code that is not six digits with 400, counting nothing', async () => {
    const { store, accounts } = setupMailed();
    const bad = ['12345', '1234567', 'abcdef', '12 3456', ' 123456', '١٢٣٤٥٦', 123456, null];
    for (const code of bad) {
      expect((await join(accounts, { code })).res, String(code)).toEqual({
        status: 400,
        body: { error: 'bad request' },
      });
    }
    expect(Object.keys(store.dump())).toEqual([]);
  });

  it('still limits sign-ups to five an hour per address, after the code', async () => {
    const { store, accounts, mail } = setupMailed();
    for (let i = 0; i < 5; i++) {
      const who = { username: `user${i}`, email: `user${i}@example.com` };
      await ask(accounts, who, ipOf(i));
      expect((await join(accounts, { ...who, code: sentCode(mail) })).res.status).toBe(200);
    }
    const who = { username: 'user5', email: 'user5@example.com' };
    await ask(accounts, who, ipOf(5));
    expect((await join(accounts, { ...who, code: sentCode(mail) })).res).toEqual(TOO_MANY(HOUR));
    expect(store.dump()['acct:u:user5']).toBeUndefined();
  });

  it('never writes the code or the address in the log, or returns the code in an answer', async () => {
    const spies = spied();
    const { accounts, mail } = setupMailed();
    const answers = [await ask(accounts), await ask(accounts)];
    const code = sentCode(mail);
    answers.push((await join(accounts, { code: wrongOf(code) })).res);
    answers.push((await join(accounts, { code })).res);
    answers.push(await ask(accounts));
    const seen = JSON.stringify([answers, spies.all.map((spy) => spy.mock.calls)]);
    expect(seen).not.toContain(code);
    expect(seen).not.toContain('ada@example.com');
    for (const spy of spies.all) expect(spy).not.toHaveBeenCalled();
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
      // Each answer is the SHA-256 of `${authKey} ${kek}` (Robin's of authKey alone), as those files
      // hold it: the keys themselves look like real secrets to a scanner.
      const sha = (text: string) => createHash('sha256').update(text).digest('hex');
      const both = ({ authKey, kek }: { authKey: string; kek: string }) => sha(`${authKey} ${kek}`);
      // src/data/accountCrypto.test.ts
      expect(both(independently('Ada.Lovelace', PASSWORD, FAST))).toBe(
        '9120294c0a61d99843980c24376440ade236da9eccfdb68707596fb95e2e1e8a',
      );
      expect(both(independently('Ada.Lovelace', PASSWORD, KDF_PARAMS))).toBe(
        'c5465b5b3a09cebe47d78a873c19682a4948664537f520d11db7a9bd4b043b74',
      );
      // site/reset/main.test.ts and tests/e2e/site/reset.spec.ts
      expect(both(independently('ada', 'a brand new password', KDF_PARAMS))).toBe(
        '69f1094909f5a745ce82f5ea776857362a933fe598357171df5c24836722b7b4',
      );
      // tests/e2e/account-settings.spec.ts
      expect(sha(independently('Robin', 'a long enough password', KDF_PARAMS).authKey)).toBe(
        'cbac384a9a92fb4820f05b88b977ef5005c6ec975a37a89f0cb29a81fa9f7146',
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
