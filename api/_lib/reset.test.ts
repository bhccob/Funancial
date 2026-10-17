import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The phone's own module, by relative path: the cross tests hold the server to its formats.
import {
  deriveAccountKeys,
  exportKek,
  newDek,
  unwrapDek,
  wrapDek,
} from '../../src/data/accountCrypto';
import { OPTIONS as forgotOPTIONS, POST as forgotPOST } from '../forgot.js';
import { POST as signupPOST } from '../signup.js';
import { GET as resetGET, POST as resetPOST } from '../reset.js';
import { createAccounts, MasterKeyMismatch, type Accounts, type Result } from './accounts.js';
import { fakeMailer, gmailMailerFromEnv, type Mailer } from './mailer.js';
import { rateLimit } from './rateLimit.js';
import { kvStoreFromEnv, memoryKvStore, type KvStore } from './store.js';
import { waitUntil } from '@vercel/functions';

// The routes build their store and mailer from the environment; here those are fakes.
vi.mock('./store.js', async (orig) => ({
  ...(await orig<typeof import('./store.js')>()),
  kvStoreFromEnv: vi.fn(),
}));
vi.mock('./mailer.js', async (orig) => ({
  ...(await orig<typeof import('./mailer.js')>()),
  gmailMailerFromEnv: vi.fn(),
}));
// The routes hand the work after their answer to Vercel; here the promise is kept for the test to await.
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));
const sendMail = vi.fn();
const createTransport = vi.hoisted(() => vi.fn());
vi.mock('nodemailer', () => ({ default: { createTransport } }));

const T0 = Date.parse('2026-10-17T12:00:00.000Z');
const MASTER = randomBytes(32);
const IP = '203.0.113.7';
const FAST = 1_000;
const HOUR = 3600;
const DAY = 24 * HOUR;
const SUBJECT = 'Choose a new Funancial password';

let clock = T0;
const advance = (seconds: number) => {
  clock += seconds * 1000;
};
// What `forgot` left to do after it answered: the lookup, the link and the mail run in the background.
let pending: Promise<unknown>[] = [];
const settled = async () => {
  await Promise.all(pending);
};
beforeEach(() => {
  clock = T0;
  pending = [];
});
const background = (promise: Promise<unknown>) => void pending.push(promise);

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

function setup(through: (store: KvStore) => KvStore = (store) => store) {
  const store = memoryKvStore(() => clock);
  const mail = fakeMailer();
  const accounts = createAccounts({
    store: through(store),
    masterKey: MASTER,
    now: () => clock,
    mailer: mail,
    waitUntil: background,
  });
  return { store, accounts, mail };
}

const b64 = (bytes: number) => randomBytes(bytes).toString('base64');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const out = <T = Record<string, unknown>>(r: Result) => r.body as T;
const GONE = { status: 410, body: { error: 'gone' } };
const OK = { status: 200, body: { ok: true } };

/** An account with random keys, which is all a test needs where the data key isn't looked at. */
async function join(accounts: Accounts, over: Record<string, unknown> = {}, ip = IP) {
  const authKey = b64(32);
  const res = await accounts.signup(
    {
      username: 'Ada',
      email: 'Ada@Example.com',
      authKey,
      dek: b64(32),
      wrappedPw: { iv: b64(12), ciphertext: b64(48) },
      ...over,
    },
    ip,
  );
  return { res, authKey, token: out<{ deviceToken?: string }>(res)?.deviceToken ?? '' };
}

/** An account made the way the phone makes it, so a reset can be checked against the real data key. */
async function joinAsPhone(accounts: Accounts, password = 'correct horse battery') {
  const keys = await deriveAccountKeys('Ada', password, FAST);
  const dek = await newDek();
  const res = await accounts.signup(
    {
      username: 'Ada',
      email: 'ada@example.com',
      authKey: keys.authKey,
      dek: dek.raw,
      wrappedPw: await wrapDek(dek.raw, keys.kek),
    },
    IP,
  );
  expect(res.status).toBe(200);
  return { keys, dek, token: out<{ deviceToken: string }>(res).deviceToken };
}

/** What a friend does at the reset page: derive the new keys, then hand over `authKey` and `kek`. */
async function newPassword(password = 'a brand new password') {
  const keys = await deriveAccountKeys('ada', password, FAST);
  return { authKey: keys.authKey, kek: await exportKek(keys.kek), keys };
}

const tokenIn = (text: string) => /token=([A-Za-z0-9_-]{43})$/m.exec(text)?.[1] ?? '';
/** Asks for a link for `who` and returns the token the (fake) email carried. */
async function linkFor(accounts: Accounts, mail: ReturnType<typeof fakeMailer>, who = 'ada') {
  const before = mail.sent.length;
  expect(await accounts.forgot(who, IP)).toEqual(OK);
  await settled();
  const token = tokenIn(mail.sent[before]?.text ?? '');
  expect(token).toHaveLength(43);
  return token;
}

const logIn = (a: Accounts, authKey: string, username = 'ada') =>
  a.login({ username, authKey }, IP);
const put = (a: Accounts, token: string, baseVersion: number) =>
  a.putCopy(token, { baseVersion, iv: b64(12), ciphertext: b64(200) });
const resetKeys = () => ({ authKey: b64(32), kek: b64(32) });

describe('forgot', () => {
  it('emails a known username a one-use link, in the words of Call 15', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    expect(await accounts.forgot('Ada', IP)).toEqual(OK);
    await settled();

    expect(mail.sent).toHaveLength(1);
    const [email] = mail.sent;
    const token = tokenIn(email?.text ?? '');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(email).toEqual({
      to: 'ada@example.com',
      subject: SUBJECT,
      // No name in it: the page says which account the link is for.
      text:
        'Hi,\n\ntap the link to choose a new Funancial password. It works for 30 minutes.\n\n' +
        `https://funancial.vercel.app/reset?token=${token}\n\n` +
        "If you didn't ask for this, ignore this email.",
    });
    expect(email?.text).not.toContain('ada');
  });

  it('emails a known email address too, in any spelling of it or of the name', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    for (const who of ['ADA@example.COM', 'ada@example.com', 'ＡＤＡ']) {
      expect(await accounts.forgot(who, IP)).toEqual(OK);
    }
    await settled();
    expect(mail.sent.map((m) => m.to)).toEqual(Array(3).fill('ada@example.com'));
    // Each link is its own.
    expect(new Set(mail.sent.map((m) => tokenIn(m.text))).size).toBe(3);
  });

  it('answers an unknown name or email exactly as it answers a known one, and sends nothing', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    const known = await accounts.forgot('ada', IP);
    for (const who of ['nobody', 'nobody@example.com']) {
      expect(await accounts.forgot(who, IP)).toEqual(known);
    }
    expect(known).toEqual(OK);
    await settled();
    expect(mail.sent).toHaveLength(1);
  });

  it('answers at once for a known name while the mail is never sent, and the same as for an unknown one', async () => {
    // The mailer never settles, as a stalled Gmail would not: the answer must not wait for it.
    const stalled: Mailer = { send: () => new Promise<void>(() => {}) };
    const accounts = createAccounts({
      store: memoryKvStore(() => clock),
      masterKey: MASTER,
      now: () => clock,
      mailer: stalled,
      waitUntil: background,
    });
    await join(accounts);
    const late = new Promise<string>((resolve) => setTimeout(() => resolve('waited'), 500));

    const known = await Promise.race([accounts.forgot('ada', IP), late]);
    const unknown = await Promise.race([accounts.forgot('nobody', IP), late]);
    expect(known).toEqual(OK);
    expect(unknown).toEqual(OK);
    // The work is handed over to run after the answer.
    expect(pending).toHaveLength(2);
  });

  it('hands the lookup, the link and the mail to waitUntil, and they still happen', async () => {
    const { store, accounts, mail } = setup();
    await join(accounts);
    expect(await accounts.forgot('ada', IP)).toEqual(OK);
    expect(pending).toHaveLength(1);
    await settled();
    expect(mail.sent).toHaveLength(1);
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:r:'))).toHaveLength(1);
  });

  it('waits for the work itself where there is no waitUntil', async () => {
    const mail = fakeMailer();
    const accounts = createAccounts({
      store: memoryKvStore(() => clock),
      masterKey: MASTER,
      now: () => clock,
      mailer: mail,
    });
    await join(accounts);
    expect(await accounts.forgot('ada', IP)).toEqual(OK);
    expect(mail.sent).toHaveLength(1);
  });

  it('sends one email per account when an address names two', async () => {
    const { accounts, mail } = setup();
    await join(accounts, { username: 'ada' });
    await join(accounts, { username: 'grace' }, '198.51.100.9');
    expect(await accounts.forgot('ada@example.com', IP)).toEqual(OK);
    await settled();

    expect(mail.sent).toHaveLength(2);
    expect(mail.sent.every((m) => m.to === 'ada@example.com' && m.subject === SUBJECT)).toBe(true);
    // Each link opens its own account.
    const names = [];
    for (const m of mail.sent) {
      const info = await accounts.resetInfo(tokenIn(m.text), IP);
      names.push(out<{ username: string }>(info).username);
    }
    expect(names.sort()).toEqual(['ada', 'grace']);
  });

  it('mails at most 3 accounts for one address in one request', async () => {
    const { accounts, mail } = setup();
    for (const [i, name] of ['ada', 'grace', 'alan', 'edsger', 'barbara'].entries()) {
      await join(accounts, { username: name }, `198.51.100.${i + 1}`);
    }
    expect(await accounts.forgot('ada@example.com', IP)).toEqual(OK);
    await settled();
    expect(mail.sent).toHaveLength(3);
  });

  it('stops sending after 300 emails a day, still answering 200, and says so in the log', async () => {
    const spies = (['error', 'log', 'info', 'warn', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const { store, accounts, mail } = setup();
    await join(accounts);
    // 299 sent already today.
    for (let i = 0; i < 299; i++) await rateLimit(store, 'forgot:global', 'all', 300, DAY);

    expect(await accounts.forgot('ada', IP)).toEqual(OK);
    await settled();
    expect(mail.sent).toHaveLength(1);
    expect(spies[0]).not.toHaveBeenCalled();

    // The 301st is not sent, and its link is not made either.
    expect(await accounts.forgot('ada', IP)).toEqual(OK);
    await settled();
    expect(mail.sent).toHaveLength(1);
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:r:'))).toHaveLength(1);
    expect(spies[0]?.mock.calls).toEqual([['[api] reset email skipped: cap']]);

    // A day later it sends again.
    advance(DAY + 1);
    expect(await accounts.forgot('ada', IP)).toEqual(OK);
    await settled();
    expect(mail.sent).toHaveLength(2);
    spies.forEach((spy) => spy.mockRestore());
  });

  it('counts only emails actually sent against the daily cap', async () => {
    const { store, accounts } = setup();
    await join(accounts);
    await accounts.forgot('nobody', IP);
    await accounts.forgot('ada', IP);
    await accounts.forgot('ada@example.com', IP);
    await settled();
    expect(store.dump()['rl:forgot:global:all']).toBe(2);
  });

  it('keeps only a hash of the token, which lives 30 minutes', async () => {
    const { store, accounts, mail } = setup();
    await join(accounts);
    const token = await linkFor(accounts, mail);

    const key = `acct:r:${sha(token)}`;
    const { authSalt } = store.dump()['acct:u:ada'] as { authSalt: string };
    expect(store.dump()[key]).toEqual({
      username: 'ada',
      createdAt: '2026-10-17T12:00:00.000Z',
      authSalt,
    });
    expect(await store.ttl(key)).toBe(1800);
    expect(JSON.stringify(store.dump())).not.toContain(token);
  });

  it('gives 429 for the 4th request for one name in an hour, known or not, and the hour resets it', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    for (const who of ['ada', 'nobody']) {
      for (let i = 0; i < 3; i++) expect((await accounts.forgot(who, IP)).status).toBe(200);
    }
    const known = await accounts.forgot('ada', IP);
    expect(known).toEqual({ status: 429, body: { error: 'too many attempts' }, retryAfter: HOUR });
    // Saying nothing of the account: an unknown name gets the same.
    expect(await accounts.forgot('nobody', IP)).toEqual(known);
    await settled();
    expect(mail.sent).toHaveLength(3);

    advance(HOUR + 1);
    expect(await accounts.forgot('ada', IP)).toEqual(OK);
    await settled();
    expect(mail.sent).toHaveLength(4);
  });

  it('gives 429 for the 11th request from one address in an hour, whatever the names', async () => {
    const { accounts } = setup();
    for (let i = 0; i < 10; i++) expect((await accounts.forgot(`user${i}`, IP)).status).toBe(200);
    expect(await accounts.forgot('user10', IP)).toEqual({
      status: 429,
      body: { error: 'too many attempts' },
      retryAfter: HOUR,
    });
    expect((await accounts.forgot('user10', '198.51.100.2')).status).toBe(200);
  });

  it('refuses what is neither a username nor an email with 400, and does not count it', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    const bad: unknown[] = [
      undefined,
      null,
      5,
      {},
      [],
      '',
      'ab',
      'a b c',
      'ada@',
      '@x.com',
      'x'.repeat(300),
    ];
    for (const who of bad)
      expect(await accounts.forgot(who, IP)).toEqual({
        status: 400,
        body: { error: 'bad request' },
      });
    await settled();
    expect(mail.sent).toHaveLength(0);
    for (let i = 0; i < 3; i++) expect((await accounts.forgot('ada', IP)).status).toBe(200);
  });

  it('says not configured, and nothing else, where there is no mailer', async () => {
    const store = memoryKvStore(() => clock);
    const accounts = createAccounts({ store, masterKey: MASTER, now: () => clock });
    await join(accounts);
    expect(await accounts.forgot('ada', IP)).toEqual({
      status: 503,
      body: { error: 'not configured' },
    });
    expect(await accounts.forgot('nobody', IP)).toEqual(await accounts.forgot('ada', IP));
  });

  it('answers 200 even when the email could not be sent, so a failure does not tell a known name from an unknown one', async () => {
    const spies = (['error', 'log', 'info', 'warn', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const failing: Mailer = {
      send: async (to, _subject, text) => {
        throw Object.assign(new Error(`535 refused ${to} ${text}`), { code: 'EAUTH' });
      },
    };
    const store = memoryKvStore(() => clock);
    const accounts = createAccounts({
      store,
      masterKey: MASTER,
      now: () => clock,
      mailer: failing,
      waitUntil: background,
    });
    await join(accounts);

    expect(await accounts.forgot('ada', IP)).toEqual(OK);
    expect(await accounts.forgot('nobody', IP)).toEqual(OK);
    await settled();

    // The owner can see that mail failed, and why in a word; nothing of the address or the link.
    const [error, ...others] = spies;
    expect(error?.mock.calls).toEqual([['[api] reset email failed:', 'EAUTH']]);
    for (const spy of others) expect(spy).not.toHaveBeenCalled();
    spies.forEach((spy) => spy.mockRestore());
  });

  it('stops at the first send that fails, so a stalled Gmail cannot take the time of every account', async () => {
    const spies = (['error', 'log', 'info', 'warn', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const attempts: string[] = [];
    const failing: Mailer = {
      send: async (to) => {
        attempts.push(to);
        throw Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
      },
    };
    const accounts = createAccounts({
      store: memoryKvStore(() => clock),
      masterKey: MASTER,
      now: () => clock,
      mailer: failing,
      waitUntil: background,
    });
    for (const [i, name] of ['ada', 'grace', 'alan'].entries()) {
      await join(accounts, { username: name }, `198.51.100.${i + 1}`);
    }

    expect(await accounts.forgot('ada@example.com', IP)).toEqual(OK);
    await settled();
    expect(attempts).toHaveLength(1);
    expect(spies[0]?.mock.calls).toEqual([['[api] reset email failed:', 'ETIMEDOUT']]);
    spies.forEach((spy) => spy.mockRestore());
  });

  it('answers 200, and logs one word, when the lookup itself fails after the answer', async () => {
    const spies = (['error', 'log', 'info', 'warn', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const secret = b64(32);
    const { accounts, mail } = setup((s) =>
      around(s, 'smembers', async () => {
        throw new Error(`connection refused for ${secret}`);
      }),
    );
    await join(accounts);
    expect(await accounts.forgot('ada@example.com', IP)).toEqual(OK);
    await settled();
    expect(mail.sent).toHaveLength(0);
    expect(spies[0]?.mock.calls).toEqual([['[api] reset email failed:', 'unknown']]);
    expect(JSON.stringify(spies.map((s) => s.mock.calls))).not.toContain(secret);
    spies.forEach((spy) => spy.mockRestore());
  });

  it('skips an address-set entry whose account is gone or has another address', async () => {
    const { store, accounts, mail } = setup();
    const { token } = await join(accounts);
    await join(accounts, { username: 'grace', email: 'grace@example.com' }, '198.51.100.9');
    await store.sadd('acct:e:ada@example.com', 'grace'); // a stale entry
    await store.sadd('acct:e:ada@example.com', 'ghost'); // an account that was deleted
    expect(await accounts.deleteAccount(token)).toEqual({ status: 204 });
    await store.sadd('acct:e:ada@example.com', 'ada');

    expect(await accounts.forgot('ada@example.com', IP)).toEqual(OK);
    await settled();
    expect(mail.sent).toHaveLength(0);
  });
});

describe('resetInfo', () => {
  it('names the account the link is for', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    const token = await linkFor(accounts, mail);
    expect(await accounts.resetInfo(token, IP)).toEqual({ status: 200, body: { username: 'ada' } });
    // Asking does not use the link up.
    expect((await accounts.resetInfo(token, IP)).status).toBe(200);
  });

  it('gives 410 after 30 minutes', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    const token = await linkFor(accounts, mail);
    advance(1799);
    expect((await accounts.resetInfo(token, IP)).status).toBe(200);
    advance(2);
    expect(await accounts.resetInfo(token, IP)).toEqual(GONE);
    expect(await accounts.reset(token, b64(32), b64(32), IP)).toEqual(GONE);
  });

  it('gives 410 once the link has been used', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    const token = await linkFor(accounts, mail);
    expect(await accounts.reset(token, b64(32), b64(32), IP)).toEqual({ status: 204 });
    expect(await accounts.resetInfo(token, IP)).toEqual(GONE);
  });

  it('gives 410 for a token nobody was given, and for anything that is not a token', async () => {
    const { accounts } = setup();
    await join(accounts);
    const bad: unknown[] = [randomBytes(32).toString('base64url'), 'short', '', null, undefined, 7];
    for (const token of bad) expect(await accounts.resetInfo(token, IP)).toEqual(GONE);
  });

  it('gives 410 when the account has been deleted', async () => {
    const { accounts, mail } = setup();
    const { token: device } = await join(accounts);
    const token = await linkFor(accounts, mail);
    expect(await accounts.deleteAccount(device)).toEqual({ status: 204 });
    expect(await accounts.resetInfo(token, IP)).toEqual(GONE);
    expect(await accounts.reset(token, b64(32), b64(32), IP)).toEqual(GONE);
  });

  it('gives 410 when the name was deleted and made again, and never touches the new account', async () => {
    const { store, accounts, mail } = setup();
    const { token: device } = await join(accounts);
    const token = await linkFor(accounts, mail);
    await accounts.deleteAccount(device);
    advance(60);
    const again = await join(accounts, {}, '198.51.100.2');
    expect(again.res.status).toBe(200);
    const before = JSON.stringify(store.dump()['acct:u:ada']);

    expect(await accounts.resetInfo(token, IP)).toEqual(GONE);
    expect(await accounts.reset(token, b64(32), b64(32), IP)).toEqual(GONE);
    expect(JSON.stringify(store.dump()['acct:u:ada'])).toBe(before);
    expect((await logIn(accounts, again.authKey)).status).toBe(200);
  });

  it('limits asking: the 21st in an hour is 429', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    const token = await linkFor(accounts, mail);
    for (let i = 0; i < 20; i++) expect((await accounts.resetInfo(token, IP)).status).toBe(200);
    expect(await accounts.resetInfo(token, IP)).toEqual({
      status: 429,
      body: { error: 'too many attempts' },
      retryAfter: HOUR,
    });
    expect((await accounts.resetInfo(token, '198.51.100.2')).status).toBe(200);
  });
});

describe('reset', () => {
  it('changes the password, keeps the data key, and leaves the active phone uploading', async () => {
    const { store, accounts, mail } = setup();
    const { keys: old, dek, token: device } = await joinAsPhone(accounts);
    expect((await put(accounts, device, 0)).status).toBe(200);
    const token = await linkFor(accounts, mail);
    const fresh = await newPassword();
    const before = store.dump()['acct:u:ada'] as Record<string, unknown>;

    expect(await accounts.reset(token, fresh.authKey, fresh.kek, IP)).toEqual({ status: 204 });

    // The active phone's token and copy are untouched: it keeps uploading from where it was.
    const after = store.dump()['acct:u:ada'] as Record<string, unknown>;
    expect(after.deviceTokenHash).toBe(before.deviceTokenHash);
    expect(after.wrappedServer).toEqual(before.wrappedServer);
    expect(after.keyId).toBe(before.keyId);
    expect(after.createdAt).toBe(before.createdAt);
    expect((await put(accounts, device, 1)).status).toBe(200);

    // The old password no longer logs in; the new one does, and opens the same data key.
    expect(await logIn(accounts, old.authKey)).toEqual({
      status: 401,
      body: { error: 'denied' },
    });
    const res = await logIn(accounts, fresh.authKey);
    expect(res.status).toBe(200);
    const opened = await unwrapDek(
      out<{ wrappedPw: { iv: string; ciphertext: string } }>(res).wrappedPw,
      fresh.keys.kek,
    );
    expect(opened.raw).toBe(dek.raw);
    // And the copy came along.
    expect(out<{ copy: { version: number } }>(res).copy.version).toBe(2);
    // The old kek opens nothing any more.
    await expect(
      unwrapDek(out<{ wrappedPw: { iv: string; ciphertext: string } }>(res).wrappedPw, old.kek),
    ).rejects.toThrow();
  });

  it('stores neither the new key nor the kek, and burns the token', async () => {
    const { store, accounts, mail } = setup();
    await join(accounts);
    const token = await linkFor(accounts, mail);
    const { authKey, kek } = resetKeys();
    const before = store.dump()['acct:u:ada'] as Record<string, unknown>;

    expect(await accounts.reset(token, authKey, kek, IP)).toEqual({ status: 204 });

    const dump = store.dump();
    const all = JSON.stringify(dump);
    for (const secret of [authKey, kek, token]) expect(all).not.toContain(secret);
    expect(dump[`acct:r:${sha(token)}`]).toBeUndefined();
    const after = dump['acct:u:ada'] as Record<string, unknown>;
    expect(after.authHash).not.toBe(before.authHash);
    expect(after.authSalt).not.toBe(before.authSalt);
    expect(after.wrappedPw).not.toEqual(before.wrappedPw);
  });

  it('works once: a second use gives 410 and changes nothing', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    const token = await linkFor(accounts, mail);
    const first = resetKeys();
    expect(await accounts.reset(token, first.authKey, first.kek, IP)).toEqual({ status: 204 });

    expect(await accounts.reset(token, b64(32), b64(32), IP)).toEqual(GONE);
    expect((await logIn(accounts, first.authKey)).status).toBe(200);
  });

  it('lets only one of two simultaneous uses win', async () => {
    const { accounts, mail } = setup(lagged);
    await join(accounts);
    const token = await linkFor(accounts, mail);
    const a = resetKeys();
    const b = resetKeys();
    const results = await Promise.all([
      accounts.reset(token, a.authKey, a.kek, IP),
      accounts.reset(token, b.authKey, b.kek, IP),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 410]);
    const winner = results[0]?.status === 204 ? a : b;
    const loser = winner === a ? b : a;
    expect((await logIn(accounts, loser.authKey)).status).toBe(401);
    expect((await logIn(accounts, winner.authKey)).status).toBe(200);
  });

  it('does not call its own claim taken when a retried write finds it already made', async () => {
    // The client retries a SET NX whose first try took effect but whose answer was lost.
    const { accounts, mail } = setup((s) =>
      around(s, 'setNx', async ([key], run) => {
        const won = await run();
        return String(key).startsWith('acct:ru:') ? false : won;
      }),
    );
    await join(accounts);
    const token = await linkFor(accounts, mail);
    expect(await accounts.reset(token, b64(32), b64(32), IP)).toEqual({ status: 204 });
    expect(await accounts.reset(token, b64(32), b64(32), IP)).toEqual(GONE);
  });

  it('refuses a malformed key with 400 and leaves the link usable', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    const token = await linkFor(accounts, mail);
    const ok = resetKeys();
    const bad: Array<[unknown, unknown]> = [
      [undefined, ok.kek],
      [ok.authKey, undefined],
      ['x', ok.kek],
      [ok.authKey, 'x'],
      [b64(16), ok.kek],
      [ok.authKey, b64(16)],
      [ok.authKey, b64(48)],
      [7, {}],
    ];
    for (const [authKey, kek] of bad) {
      expect(await accounts.reset(token, authKey, kek, IP)).toEqual({
        status: 400,
        body: { error: 'bad request' },
      });
    }
    expect(await accounts.reset(token, ok.authKey, ok.kek, IP)).toEqual({ status: 204 });
  });

  it('gives 410 for a token nobody was given, and for anything that is not a token', async () => {
    const { accounts } = setup();
    await join(accounts);
    const { authKey, kek } = resetKeys();
    const bad: unknown[] = [randomBytes(32).toString('base64url'), 'short', '', null, undefined, 7];
    for (const token of bad) expect(await accounts.reset(token, authKey, kek, IP)).toEqual(GONE);
  });

  it('throws for a master key that is not the one that wrapped the account, and the link stays usable', async () => {
    const { store, accounts, mail } = setup();
    await join(accounts);
    const token = await linkFor(accounts, mail);
    const before = JSON.stringify(store.dump()['acct:u:ada']);

    const wrongKey = createAccounts({ store, masterKey: randomBytes(32), now: () => clock });
    await expect(wrongKey.reset(token, b64(32), b64(32), IP)).rejects.toBeInstanceOf(
      MasterKeyMismatch,
    );
    expect(JSON.stringify(store.dump()['acct:u:ada'])).toBe(before);

    // Once the owner puts the right key back, the same link works.
    expect(await accounts.reset(token, b64(32), b64(32), IP)).toEqual({ status: 204 });
  });

  it('gives the link back when the store fails part-way, so the friend can try again', async () => {
    let failOnce = true;
    const { accounts, mail } = setup((s) =>
      around(s, 'compareAndSet', async ([key], run) => {
        if (failOnce && key === 'acct:u:ada' && clock > T0) {
          failOnce = false;
          throw new Error('connection reset');
        }
        return run();
      }),
    );
    await join(accounts);
    const token = await linkFor(accounts, mail);
    advance(5); // so the write that fails is the reset's own
    const { authKey, kek } = resetKeys();
    await expect(accounts.reset(token, authKey, kek, IP)).rejects.toThrow('connection reset');
    expect(await accounts.reset(token, authKey, kek, IP)).toEqual({ status: 204 });
    expect((await logIn(accounts, authKey)).status).toBe(200);
  });

  it('kills an older link once a newer one has been used', async () => {
    const { accounts, mail } = setup();
    await join(accounts);
    const first = await linkFor(accounts, mail);
    const second = await linkFor(accounts, mail);
    expect(second).not.toBe(first);
    expect((await accounts.resetInfo(first, IP)).status).toBe(200);

    expect(await accounts.reset(second, b64(32), b64(32), IP)).toEqual({ status: 204 });
    expect(await accounts.resetInfo(first, IP)).toEqual(GONE);
    expect(await accounts.reset(first, b64(32), b64(32), IP)).toEqual(GONE);
  });

  it('kills a link made before a password change', async () => {
    const { accounts, mail } = setup();
    const { authKey, token: device } = await join(accounts);
    const link = await linkFor(accounts, mail);
    const changed = await accounts.changePassword(device, {
      oldAuthKey: authKey,
      newAuthKey: b64(32),
      newWrappedPw: { iv: b64(12), ciphertext: b64(48) },
    });
    expect(changed).toEqual({ status: 204 });

    expect(await accounts.resetInfo(link, IP)).toEqual(GONE);
    expect(await accounts.reset(link, b64(32), b64(32), IP)).toEqual(GONE);
  });

  it('leaves a link alone when someone logs in, which does not change the password', async () => {
    const { accounts, mail } = setup();
    const { authKey } = await join(accounts);
    const link = await linkFor(accounts, mail);
    expect((await logIn(accounts, authKey)).status).toBe(200);
    expect((await accounts.resetInfo(link, IP)).status).toBe(200);
  });

  it('limits attempts: the 21st in an hour is 429, from that address only', async () => {
    const { accounts } = setup();
    await join(accounts);
    for (let i = 0; i < 20; i++) {
      expect(
        (await accounts.reset(randomBytes(32).toString('base64url'), b64(32), b64(32), IP)).status,
      ).toBe(410);
    }
    expect(
      await accounts.reset(randomBytes(32).toString('base64url'), b64(32), b64(32), IP),
    ).toEqual({
      status: 429,
      body: { error: 'too many attempts' },
      retryAfter: HOUR,
    });
    expect(
      (
        await accounts.reset(
          randomBytes(32).toString('base64url'),
          b64(32),
          b64(32),
          '198.51.100.2',
        )
      ).status,
    ).toBe(410);
  });

  it('gives 410, and leaves the new account alone, when the name is made again while a reset is under way', async () => {
    const hook: { swap?: () => Promise<void> } = {};
    const { store, accounts, mail } = setup((s) =>
      around(s, 'setNx', async ([key], run) => {
        const won = await run();
        // Just after the reset has claimed its link, before it changes anything.
        if (String(key).startsWith('acct:ru:')) await hook.swap?.();
        return won;
      }),
    );
    const { token: device } = await join(accounts);
    const token = await linkFor(accounts, mail);
    let again: Awaited<ReturnType<typeof join>> | undefined;
    hook.swap = async () => {
      await accounts.deleteAccount(device);
      advance(60);
      again = await join(accounts, {}, '198.51.100.2');
    };

    expect(await accounts.reset(token, b64(32), b64(32), IP)).toEqual(GONE);
    expect(again?.res.status).toBe(200);
    const after = store.dump()['acct:u:ada'] as { deviceTokenHash: string };
    expect(after.deviceTokenHash).toBe(sha(again?.token ?? ''));
    expect((await logIn(accounts, again?.authKey ?? '')).status).toBe(200);
  });

  it('writes a wrappedPw the phone opens: ciphertext then the 16-byte tag, under a fresh IV', async () => {
    const { store, accounts, mail } = setup();
    const { dek } = await joinAsPhone(accounts);
    const token = await linkFor(accounts, mail);
    const fresh = await newPassword();
    await accounts.reset(token, fresh.authKey, fresh.kek, IP);

    const stored = (store.dump()['acct:u:ada'] as { wrappedPw: { iv: string; ciphertext: string } })
      .wrappedPw;
    expect(stored.iv).toMatch(/^[A-Za-z0-9+/]{16}$/);
    expect(Buffer.from(stored.ciphertext, 'base64')).toHaveLength(48);
    expect((await unwrapDek(stored, fresh.keys.kek)).raw).toBe(dek.raw);
  });
});

describe('account writes are compare-and-set', () => {
  const BUSY = { status: 409, body: { error: 'busy' } };
  const newWrapped = () => ({ iv: b64(12), ciphertext: b64(48) });

  /**
   * Holds the first write to the account record after a request has read it, so the test can let
   * another request land in between, then lets it go on.
   */
  function holdFirstWrite() {
    let hit!: () => void;
    let open!: () => void;
    const reached = new Promise<void>((resolve) => (hit = resolve));
    const opened = new Promise<void>((resolve) => (open = resolve));
    let held = false;
    const hold = async (args: unknown[], run: () => Promise<unknown>) => {
      if (args[0] === 'acct:u:ada' && !held) {
        held = true;
        hit();
        await opened;
      }
      return run();
    };
    return {
      through: (s: KvStore) => around(around(s, 'set', hold), 'compareAndSet', hold),
      /** Resolves once a request is held (or after a second, so a test that never gets there fails). */
      reached: () => Promise.race([reached, new Promise((resolve) => setTimeout(resolve, 1000))]),
      open,
    };
  }
  const tokenPointers = (store: { dump(): Record<string, unknown> }) =>
    Object.keys(store.dump()).filter((k) => k.startsWith('acct:t:'));

  it('gives no token to a log-in with the old password when a reset lands between its read and its write', async () => {
    const held = holdFirstWrite();
    const { store, accounts, mail } = setup(held.through);
    const { authKey: oldKey } = await join(accounts);
    const link = await linkFor(accounts, mail);
    const tokensBefore = tokenPointers(store);
    const deviceBefore = (store.dump()['acct:u:ada'] as { deviceTokenHash: string })
      .deviceTokenHash;

    // The log-in has read the record, with the old password in it, and waits to write.
    const login = logIn(accounts, oldKey);
    await held.reached();
    const fresh = resetKeys();
    expect(await accounts.reset(link, fresh.authKey, fresh.kek, IP)).toEqual({ status: 204 });
    held.open();

    // It retries, finds the password is no longer the one it was given, and is turned away like
    // any wrong password: no token, none left behind, and the phone in use is untouched.
    expect(await login).toEqual({ status: 401, body: { error: 'denied' } });
    expect(tokenPointers(store)).toEqual(tokensBefore);
    expect((store.dump()['acct:u:ada'] as { deviceTokenHash: string }).deviceTokenHash).toBe(
      deviceBefore,
    );

    // The new password works, the old one does not.
    expect((await logIn(accounts, fresh.authKey)).status).toBe(200);
    expect((await logIn(accounts, oldKey)).status).toBe(401);
  });

  it('turns a password change with the old key away when a reset lands between its read and its write', async () => {
    const held = holdFirstWrite();
    const { store, accounts, mail } = setup(held.through);
    const { authKey: oldKey, token: device } = await join(accounts);
    const link = await linkFor(accounts, mail);
    const chosen = b64(32);

    const change = accounts.changePassword(device, {
      oldAuthKey: oldKey,
      newAuthKey: chosen,
      newWrappedPw: newWrapped(),
    });
    await held.reached();
    const fresh = resetKeys();
    expect(await accounts.reset(link, fresh.authKey, fresh.kek, IP)).toEqual({ status: 204 });
    held.open();

    expect(await change).toEqual({ status: 401, body: { error: 'denied' } });
    // The reset's password stands; the one the change was to set was never written.
    expect((await logIn(accounts, chosen)).status).toBe(401);
    expect((await logIn(accounts, fresh.authKey)).status).toBe(200);
    expect(tokenPointers(store)).toHaveLength(1);
  });

  it('turns a reset away when a password change lands between its read and its write, and gives its link back', async () => {
    const held = holdFirstWrite();
    const { store, accounts, mail } = setup(held.through);
    const { authKey: oldKey, token: device } = await join(accounts);
    const link = await linkFor(accounts, mail);
    const fresh = resetKeys();

    const reset = accounts.reset(link, fresh.authKey, fresh.kek, IP);
    await held.reached();
    const chosen = b64(32);
    expect(
      await accounts.changePassword(device, {
        oldAuthKey: oldKey,
        newAuthKey: chosen,
        newWrappedPw: newWrapped(),
      }),
    ).toEqual({ status: 204 });
    held.open();

    // The link was made for a password that has since changed, so it is dead.
    expect(await reset).toEqual(GONE);
    expect(await accounts.resetInfo(link, IP)).toEqual(GONE);
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:ru:'))).toEqual([]);
    // The change stands; the reset's password was never written.
    expect((await logIn(accounts, fresh.authKey)).status).toBe(401);
    expect((await logIn(accounts, chosen)).status).toBe(200);
  });

  it('reads again and writes on top of what another writer changed meanwhile', async () => {
    let calls = 0;
    const { store, accounts } = setup((s) =>
      around(s, 'compareAndSet', async ([key], run) => {
        if (key === 'acct:u:ada' && ++calls === 1) {
          // Another request changes the record after this one read it.
          const now = (await s.get('acct:u:ada')) as Record<string, unknown>;
          await s.set('acct:u:ada', { ...now, deviceTokenHash: 'taken-over' });
        }
        return run();
      }),
    );
    const { authKey, token } = await join(accounts);
    const wrappedPw = newWrapped();

    expect(
      await accounts.changePassword(token, {
        oldAuthKey: authKey,
        newAuthKey: b64(32),
        newWrappedPw: wrappedPw,
      }),
    ).toEqual({ status: 204 });
    expect(calls).toBe(2);
    expect(store.dump()['acct:u:ada']).toMatchObject({ deviceTokenHash: 'taken-over', wrappedPw });
  });

  it('gives up after 3 tries with 409 busy, and changes nothing', async () => {
    let calls = 0;
    let losing = true;
    const { store, accounts, mail } = setup((s) =>
      around(s, 'compareAndSet', async (_args, run) => {
        calls++;
        return losing ? false : run();
      }),
    );
    const { authKey, token } = await join(accounts);
    const link = await linkFor(accounts, mail);
    const before = JSON.stringify(store.dump()['acct:u:ada']);
    const tokens = Object.keys(store.dump()).filter((k) => k.startsWith('acct:t:'));

    expect(
      await accounts.changePassword(token, {
        oldAuthKey: authKey,
        newAuthKey: b64(32),
        newWrappedPw: newWrapped(),
      }),
    ).toEqual(BUSY);
    expect(calls).toBe(3);

    // A log-in takes no new token, and the old phone's still works.
    expect(await logIn(accounts, authKey)).toEqual(BUSY);
    expect(Object.keys(store.dump()).filter((k) => k.startsWith('acct:t:'))).toEqual(tokens);

    // A reset gives its link back.
    const fresh = resetKeys();
    expect(await accounts.reset(link, fresh.authKey, fresh.kek, IP)).toEqual(BUSY);
    expect(JSON.stringify(store.dump()['acct:u:ada'])).toBe(before);
    expect((await put(accounts, token, 0)).status).toBe(200);

    losing = false;
    expect(await accounts.reset(link, fresh.authKey, fresh.kek, IP)).toEqual({ status: 204 });
  });

  it('wins on the third try', async () => {
    let losses = 2;
    const { accounts } = setup((s) =>
      around(s, 'compareAndSet', async (_args, run) => (losses-- > 0 ? false : run())),
    );
    const { authKey } = await join(accounts);
    expect((await logIn(accounts, authKey)).status).toBe(200);
  });

  describe('when the reply to a write that landed is lost', () => {
    // The Upstash client sends a request again when its fetch threw. If the first EVAL had applied
    // and only its reply was lost, the second finds the key already changed and answers 0. Here the
    // first compare-and-set applies and still reports that it didn't, the same.
    const lostReply = (s: KvStore) => {
      let first = true;
      return around(s, 'compareAndSet', async (_args, run) => {
        const wrote = await run();
        if (!first) return wrote;
        first = false;
        return false;
      });
    };

    it('keeps the token a log-in made, so it works and the old phone is replaced', async () => {
      const { store, accounts } = setup(lostReply);
      const { authKey, token: oldToken } = await join(accounts);

      const res = await logIn(accounts, authKey);
      expect(res.status).toBe(200);
      const token = out<{ deviceToken: string }>(res).deviceToken;
      // Its pointer is there (and the old one is gone), not removed as if the write had lost.
      expect(tokenPointers(store)).toEqual([`acct:t:${sha(token)}`]);
      expect((await put(accounts, token, 0)).status).toBe(200);
      expect((await put(accounts, oldToken, 1)).status).toBe(401);
    });

    it('answers 204 for a password change that took effect', async () => {
      const { accounts } = setup(lostReply);
      const { authKey, token } = await join(accounts);
      const chosen = b64(32);

      expect(
        await accounts.changePassword(token, {
          oldAuthKey: authKey,
          newAuthKey: chosen,
          newWrappedPw: newWrapped(),
        }),
      ).toEqual({ status: 204 });
      expect((await logIn(accounts, chosen)).status).toBe(200);
      expect((await logIn(accounts, authKey)).status).toBe(401);
    });

    it('answers 204 for a reset that took effect, and the link is spent', async () => {
      const { accounts, mail } = setup(lostReply);
      const { authKey: oldKey } = await join(accounts);
      const link = await linkFor(accounts, mail);
      const fresh = resetKeys();

      expect(await accounts.reset(link, fresh.authKey, fresh.kek, IP)).toEqual({ status: 204 });
      expect((await logIn(accounts, fresh.authKey)).status).toBe(200);
      expect((await logIn(accounts, oldKey)).status).toBe(401);
      expect(await accounts.resetInfo(link, IP)).toEqual(GONE);
    });
  });
});

describe('secrets', () => {
  const spied = () =>
    (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
  afterEach(() => vi.restoreAllMocks());

  it('logs nothing, and returns no token, kek or key, on any failure path', async () => {
    const spies = spied();
    const { accounts, mail } = setup();
    await join(accounts);
    const token = await linkFor(accounts, mail);
    const guess = randomBytes(32).toString('base64url');
    const { authKey, kek } = resetKeys();

    const results: Result[] = [
      await accounts.forgot(7, IP),
      await accounts.forgot('nobody', IP),
      await accounts.resetInfo(guess, IP),
      await accounts.resetInfo('short', IP),
      await accounts.reset(guess, authKey, kek, IP),
      await accounts.reset(token, 'x', kek, IP),
      await accounts.reset(token, authKey, 'x', IP),
    ];
    expect(await accounts.reset(token, authKey, kek, IP)).toEqual({ status: 204 });
    results.push(
      await accounts.reset(token, authKey, kek, IP),
      await accounts.resetInfo(token, IP),
    );
    for (let i = 0; i < 20; i++) results.push(await accounts.resetInfo(guess, IP));

    expect(results.some((r) => r.status === 429)).toBe(true);
    const seen = JSON.stringify(results);
    for (const secret of [token, guess, authKey, kek, MASTER.toString('base64')]) {
      expect(seen).not.toContain(secret);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('the routes', () => {
  const TOKEN = 'test-token';
  const ORIGIN = 'http://localhost:5173';
  const mail = fakeMailer();
  type Handler = (req: Request) => Promise<Response>;

  const call = (
    handler: Handler,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    return handler(new Request(`http://localhost${path}`, init));
  };
  const shared = { 'X-Funancial-Token': TOKEN };
  const account = () => ({
    username: 'ada',
    email: 'ada@example.com',
    authKey: b64(32),
    dek: b64(32),
    wrappedPw: { iv: b64(12), ciphertext: b64(48) },
  });

  /** The work `forgot` handed to Vercel after it answered. */
  const afterAnswer = () =>
    Promise.all(vi.mocked(waitUntil).mock.calls.map(([promise]) => promise));

  beforeEach(() => {
    mail.sent.length = 0;
    vi.mocked(waitUntil).mockClear();
    vi.mocked(kvStoreFromEnv).mockReturnValue(memoryKvStore());
    vi.mocked(gmailMailerFromEnv).mockReturnValue(mail);
    vi.stubEnv('FUNANCIAL_ACCESS_TOKEN', TOKEN);
    vi.stubEnv('SERVER_MASTER_KEY', b64(32));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /** Signs up and asks for a link, all through the routes; returns the link's token. */
  async function aLink() {
    expect((await call(signupPOST, 'POST', '/api/signup', account(), shared)).status).toBe(200);
    const res = await call(forgotPOST, 'POST', '/api/forgot', { who: 'ada' }, shared);
    expect(res.status).toBe(200);
    await afterAnswer();
    return tokenIn(mail.sent[0]?.text ?? '');
  }

  it('/api/forgot wants the shared token, like the rest, and answers the preflight', async () => {
    const wrong: Array<Record<string, string>> = [
      {},
      { 'X-Funancial-Token': 'nope' },
      { 'X-Funancial-Token': '' },
    ];
    for (const headers of wrong) {
      const res = await call(forgotPOST, 'POST', '/api/forgot', { who: 'ada' }, headers);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
    expect(kvStoreFromEnv).not.toHaveBeenCalled();
    const pre = forgotOPTIONS(
      new Request('http://localhost/api/forgot', {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN },
      }),
    );
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('/api/forgot answers 200 {ok:true}, known or not, with the reply uncached', async () => {
    expect((await call(signupPOST, 'POST', '/api/signup', account(), shared)).status).toBe(200);
    for (const who of ['ada', 'ada@example.com', 'nobody']) {
      const res = await call(forgotPOST, 'POST', '/api/forgot', { who }, shared);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.text()).toBe('{"ok":true}');
    }
    await afterAnswer();
    expect(mail.sent).toHaveLength(2);
    expect((await call(forgotPOST, 'POST', '/api/forgot', { who: 7 }, shared)).status).toBe(400);
    expect((await call(forgotPOST, 'POST', '/api/forgot', 'not json', shared)).status).toBe(400);
  });

  it('/api/forgot answers before a stalled mailer finishes, handing its work to waitUntil', async () => {
    expect((await call(signupPOST, 'POST', '/api/signup', account(), shared)).status).toBe(200);
    vi.mocked(gmailMailerFromEnv).mockReturnValue({ send: () => new Promise<void>(() => {}) });
    const late = new Promise<string>((resolve) => setTimeout(() => resolve('waited'), 1000));

    const res = await Promise.race([
      call(forgotPOST, 'POST', '/api/forgot', { who: 'ada' }, shared),
      late,
    ]);
    expect(res).toBeInstanceOf(Response);
    expect(await (res as Response).text()).toBe('{"ok":true}');
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it('/api/forgot says 503 not configured without Gmail, while the other routes carry on', async () => {
    vi.mocked(gmailMailerFromEnv).mockReturnValue(null);
    const res = await call(forgotPOST, 'POST', '/api/forgot', { who: 'ada' }, shared);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"error":"not configured"}');
    expect((await call(signupPOST, 'POST', '/api/signup', account(), shared)).status).toBe(200);
  });

  it('/api/reset needs no shared token, GET or POST; every other account route still does', async () => {
    const token = await aLink();

    // No X-Funancial-Token at all, and the service has none configured either.
    vi.stubEnv('FUNANCIAL_ACCESS_TOKEN', '');
    const info = await call(resetGET, 'GET', `/api/reset?token=${token}`);
    expect(info.status).toBe(200);
    expect(info.headers.get('Cache-Control')).toBe('no-store');
    expect(await info.json()).toEqual({ username: 'ada' });

    const done = await call(resetPOST, 'POST', '/api/reset', {
      token,
      newAuthKey: b64(32),
      kek: b64(32),
    });
    expect(done.status).toBe(204);
    expect(await done.text()).toBe('');

    vi.stubEnv('FUNANCIAL_ACCESS_TOKEN', TOKEN);
    const used = await call(resetGET, 'GET', `/api/reset?token=${token}`);
    expect(used.status).toBe(410);
    expect(await used.text()).toBe('{"error":"gone"}');
    for (const [handler, path] of [
      [signupPOST, '/api/signup'],
      [forgotPOST, '/api/forgot'],
    ] as const) {
      expect((await call(handler, 'POST', path, account())).status, path).toBe(401);
    }
  });

  it('/api/reset answers 410 for a missing or unknown token, and 400 for a body that is not JSON', async () => {
    for (const path of ['/api/reset', '/api/reset?token=', `/api/reset?token=${b64(32)}`]) {
      const res = await call(resetGET, 'GET', path);
      expect(res.status, path).toBe(410);
    }
    const res = await call(resetPOST, 'POST', '/api/reset', 'not json');
    expect(res.status).toBe(400);
    expect(await call(resetPOST, 'POST', '/api/reset', {})).toMatchObject({ status: 410 });
    expect(await call(resetPOST, 'POST', '/api/reset', null)).toMatchObject({ status: 410 });
  });

  it('/api/reset counts attempts by address: Retry-After on the 21st', async () => {
    const send = (ip: string) =>
      call(
        resetGET,
        'GET',
        `/api/reset?token=${randomBytes(32).toString('base64url')}`,
        undefined,
        {
          'X-Forwarded-For': ip,
        },
      );
    for (let i = 0; i < 20; i++) expect((await send('203.0.113.9')).status).toBe(410);
    const limited = await send('203.0.113.9');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('3600');
    expect(await limited.json()).toEqual({ error: 'too many attempts' });
    expect((await send('203.0.113.10')).status).toBe(410);
  });

  it('/api/reset answers 503 not configured when the master key is not the one that wrapped the account', async () => {
    const token = await aLink();
    vi.stubEnv('SERVER_MASTER_KEY', b64(32));
    const spies = spied();
    const res = await call(resetPOST, 'POST', '/api/reset', {
      token,
      newAuthKey: b64(32),
      kek: b64(32),
    });
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"error":"not configured"}');
    expect(JSON.stringify(spies.map((s) => s.mock.calls))).not.toContain(token);
  });

  function spied() {
    return (['error', 'log', 'info', 'warn', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
  }

  it('log nothing, and return no secret, on the failure paths of /api/forgot and /api/reset', async () => {
    const token = await aLink();
    const spies = spied();
    const guess = randomBytes(32).toString('base64url');
    const kek = b64(32);
    const newAuthKey = b64(32);

    const failures: Response[] = [
      await call(forgotPOST, 'POST', '/api/forgot', { who: 7 }, shared),
      await call(forgotPOST, 'POST', '/api/forgot', 'not json', shared),
      await call(forgotPOST, 'POST', '/api/forgot', { who: 'ada' }, { 'X-Funancial-Token': 'x' }),
      await call(resetGET, 'GET', `/api/reset?token=${guess}`),
      await call(resetPOST, 'POST', '/api/reset', { token: guess, newAuthKey, kek }),
      await call(resetPOST, 'POST', '/api/reset', { token, newAuthKey: 'x', kek }),
      await call(resetPOST, 'POST', '/api/reset', '{"token":'),
      await call(resetPOST, 'POST', '/api/reset', 'x'.repeat(1_500_001)),
    ];
    for (let i = 0; i < 21; i++)
      failures.push(await call(resetGET, 'GET', `/api/reset?token=${guess}`));
    // And the service not set up.
    vi.mocked(kvStoreFromEnv).mockReturnValue(null);
    failures.push(
      await call(forgotPOST, 'POST', '/api/forgot', { who: 'ada' }, shared),
      await call(resetGET, 'GET', `/api/reset?token=${token}`),
      await call(resetPOST, 'POST', '/api/reset', { token, newAuthKey, kek }),
    );

    expect(failures.some((res) => res.status === 429)).toBe(true);
    const seen = JSON.stringify(
      await Promise.all(
        failures.map(async (res) => [res.status, [...res.headers], await res.text()]),
      ),
    );
    for (const secret of [token, guess, kek, newAuthKey]) expect(seen).not.toContain(secret);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('answer 503 with only the kind of error logged when the store fails', async () => {
    const secret = b64(32);
    const failing = Object.fromEntries(
      [
        'get',
        'set',
        'setNx',
        'compareAndSet',
        'del',
        'incr',
        'expire',
        'ttl',
        'sadd',
        'smembers',
        'srem',
      ].map((name) => [
        name,
        async () => {
          throw new Error(`connection refused for token ${secret}`);
        },
      ]),
    ) as unknown as KvStore;
    vi.mocked(kvStoreFromEnv).mockReturnValue(failing);
    const spies = spied();
    const token = randomBytes(32).toString('base64url');

    const results = [
      await call(forgotPOST, 'POST', '/api/forgot', { who: 'ada' }, shared),
      await call(resetGET, 'GET', `/api/reset?token=${token}`),
      await call(resetPOST, 'POST', '/api/reset', { token, newAuthKey: b64(32), kek: b64(32) }),
    ];
    for (const res of results) {
      expect(res.status).toBe(503);
      expect(await res.text()).toBe('{"error":"unavailable"}');
    }
    expect(spies[0]).toHaveBeenCalledTimes(3);
    const logged = JSON.stringify(spies.map((s) => s.mock.calls));
    for (const text of [secret, token, 'connection refused']) expect(logged).not.toContain(text);
  });
});

describe('the Gmail mailer', () => {
  beforeEach(() => {
    createTransport.mockReset().mockReturnValue({ sendMail });
    sendMail.mockReset().mockResolvedValue({});
  });
  afterEach(() => vi.unstubAllEnvs());

  // The real function, not the route tests' stub of it.
  const real = async () =>
    (await vi.importActual<typeof import('./mailer.js')>('./mailer.js')).gmailMailerFromEnv;

  it('sends from "Funancial <GMAIL_USER>" through Gmail, reading the environment when it is called', async () => {
    const gmailMailerFromEnv = await real();
    vi.stubEnv('GMAIL_USER', 'owner@gmail.com');
    vi.stubEnv('GMAIL_APP_PASSWORD', 'app-password-value');
    const mailer = gmailMailerFromEnv();
    await mailer?.send('ada@example.com', 'Subject line', 'Body text');

    // A stalled Gmail must end in the caller's catch well before the function's 10 s are up.
    expect(createTransport).toHaveBeenCalledWith({
      service: 'gmail',
      auth: { user: 'owner@gmail.com', pass: 'app-password-value' },
      connectionTimeout: 3000,
      greetingTimeout: 3000,
      socketTimeout: 3000,
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Funancial <owner@gmail.com>',
      to: 'ada@example.com',
      subject: 'Subject line',
      text: 'Body text',
    });
  });

  it('is null, and builds nothing, when either setting is missing', async () => {
    const gmailMailerFromEnv = await real();
    for (const [user, pass] of [
      ['', 'pw'],
      ['owner@gmail.com', ''],
      ['', ''],
    ]) {
      vi.stubEnv('GMAIL_USER', user);
      vi.stubEnv('GMAIL_APP_PASSWORD', pass);
      expect(gmailMailerFromEnv()).toBeNull();
    }
    expect(createTransport).not.toHaveBeenCalled();
  });
});
