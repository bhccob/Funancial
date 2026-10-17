import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import type { Mailer } from './mailer.js';
import { rateLimit } from './rateLimit.js';
import type { KvStore } from './store.js';

/** A locked AES-GCM payload, both parts base64; the ciphertext ends with the 16-byte tag. */
export type Sealed = { iv: string; ciphertext: string };

/** What a handler answers: the route turns it into a response, with `Retry-After` for a 429. */
export type Result = { status: number; body?: unknown; retryAfter?: number };

/** `acct:u:{username}`. Holds no password, `authKey`, `kek`, raw data key or plain device token. */
export type Account = {
  username: string;
  email: string;
  /** scrypt of the `authKey`, with `authSalt`; both base64. */
  authHash: string;
  authSalt: string;
  /** The data key locked with the password's `kek`; the server can't open it. */
  wrappedPw: Sealed;
  /** The data key locked with `SERVER_MASTER_KEY`, for an email reset; bound to the account (`serverAad`). */
  wrappedServer: Sealed;
  /** Which master key wrapped `wrappedServer` (see `masterKeyId`). */
  keyId: string;
  /** SHA-256 hex of the current device token. */
  deviceTokenHash: string;
  /** Record format. */
  version: number;
  createdAt: string;
};

/** `createdAt` is the account's: a copy left by an earlier account of the same name never counts. */
type Copy = Sealed & { version: number; savedAt: string; createdAt: string };

export type AccountDeps = {
  store: KvStore;
  masterKey: Uint8Array;
  now: () => number;
  mailer?: Mailer;
  /**
   * Keeps the request's function alive for the promise after the answer has gone (Vercel's
   * `waitUntil`). Without it `forgot` does its work before it answers.
   */
  waitUntil?: (promise: Promise<unknown>) => void;
};

export type Accounts = ReturnType<typeof createAccounts>;

/** The most ciphertext a copy may carry, in bytes (the base64 that stores it is a third longer). */
const MAX_COPY_BYTES = 1_000_000;
const TAG_BYTES = 16;
const LOGIN_WINDOW = 15 * 60;
/** How long a name's failed log-ins are remembered after the last one: longer than the longest wait. */
const LOGIN_FAILS_SECONDS = 15 * 60;
/** Failed log-ins a name has before it must wait, 15 s, doubling with each one after, at most 10 min. */
const LOGIN_FREE_FAILS = 5;
const loginWait = (fails: number) => Math.min(600, 15 * 2 ** (fails - LOGIN_FREE_FAILS));
const HOUR = 60 * 60;
const DAY = 24 * HOUR;
/** Reset emails the owner's Gmail sends a day, for everyone: it is not for anyone to use as a relay. */
const SENDS_PER_DAY = 300;
/** Accounts one email address can be mailed about in one request. */
const MAIL_PER_ADDRESS = 3;
/** Tries at writing the account record against others changing it, before it answers busy. */
const WRITE_TRIES = 3;
/**
 * How long a writer's claim on a version lasts; one that died mid-write is let go after this. Safe
 * only because a function is cut off after `maxDuration` (10 s, in vercel.json): no live writer
 * outlasts its claim.
 */
const CLAIM_SECONDS = 60;
/** How long an emailed reset link works. */
const RESET_SECONDS = 30 * 60;
/** Where the link in a reset email points (the page is site/reset). */
const SITE = 'https://funancial.vercel.app';

const USERNAME = /^[a-z0-9._-]{3,30}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * The username as the phone spells it (`canonicalUsername` in src/data/accountCrypto.ts): NFKC,
 * lower-case, NFKC again. Copied rather than imported, as the service can't load the app's sources.
 */
export function canonicalUsername(name: string): string {
  return name.normalize('NFKC').toLowerCase().normalize('NFKC');
}

// Exact shapes, so what is stored is what the phone's crypto produced: a 32-byte key, a 12-byte IV, a
// data key wrapped (32 bytes plus the tag). Strict: a field nobody sends is refused, not dropped.
const key32 = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);
const iv = z.string().regex(/^[A-Za-z0-9+/]{16}$/);
const wrappedKey = z.strictObject({ iv, ciphertext: z.string().regex(/^[A-Za-z0-9+/]{64}$/) });
const username = z.string().max(100).transform(canonicalUsername).pipe(z.string().regex(USERNAME));
const email = z
  .string()
  .max(254)
  .pipe(z.email())
  .transform((e) => e.toLowerCase());

const signupBody = z.strictObject({
  username,
  email,
  authKey: key32,
  dek: key32,
  wrappedPw: wrappedKey,
});
const loginBody = z.strictObject({ username, authKey: key32 });
const copyBody = z.strictObject({
  baseVersion: z.int().min(0),
  iv,
  ciphertext: z
    .string()
    .regex(/^[A-Za-z0-9+/]{24,}={0,2}$/)
    .refine((s) => s.length % 4 === 0),
});
// A username or an email address; only an address has an "@".
const forgotBody = z.strictObject({ who: z.union([email, username]) });
// The token is checked apart: any that is not a live link's is answered as an expired one (410).
const resetInfoBody = z.strictObject({ token: z.unknown() });
const resetBody = z.strictObject({ token: z.unknown(), newAuthKey: key32, kek: key32 });
const passwordBody = z.strictObject({
  oldAuthKey: key32,
  newAuthKey: key32,
  newWrappedPw: wrappedKey,
});

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
/** Constant-time; compares bytes, so a stored value as long in letters but not in bytes is unequal, not a throw. */
function sameText(a: string, b: string) {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
}

// Defence in depth only: `authKey` is already 256 bits out of the phone's Argon2id (64 MiB, 3 passes),
// which is the memory-hard step and what a guess at the password costs.
const hashAuth = (authKey: string, salt: Uint8Array) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(authKey, salt, 32, { N: 16384, r: 8, p: 1 }, (err, hash) =>
      err ? reject(err) : resolve(hash),
    ),
  );

// What an unknown username is checked against, so it costs a log-in the same scrypt as a real one.
const DUMMY_SALT = randomBytes(16);
const DUMMY_HASH = randomBytes(32);

/** AES-256-GCM in WebCrypto's layout, which the phone reads: the ciphertext, then the tag. */
function wrap(key: Uint8Array, plain: Uint8Array, aad?: Uint8Array): Sealed {
  const ivBytes = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, ivBytes, { authTagLength: TAG_BYTES });
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return { iv: ivBytes.toString('base64'), ciphertext: ciphertext.toString('base64') };
}

/** Throws when `key` didn't lock it, it was changed, or `aad` isn't what it was locked with. */
function unwrap(key: Uint8Array, sealed: Sealed, aad?: Uint8Array): Buffer {
  const all = Buffer.from(sealed.ciphertext, 'base64');
  if (all.length < TAG_BYTES) throw new Error('sealed data is too short');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'), {
    authTagLength: TAG_BYTES,
  });
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(all.subarray(all.length - TAG_BYTES));
  return Buffer.concat([
    decipher.update(all.subarray(0, all.length - TAG_BYTES)),
    decipher.final(),
  ]);
}

/** Names a master key without revealing it: the first 8 bytes of an HMAC of a fixed label, as hex. */
export function masterKeyId(masterKey: Uint8Array): string {
  return createHmac('sha256', masterKey)
    .update('funancial key id')
    .digest()
    .subarray(0, 8)
    .toString('hex');
}

/** Thrown when an account's data key was wrapped under a different master key than this one. */
export class MasterKeyMismatch extends Error {
  constructor() {
    super('the master key is not the one that wrapped this account');
    this.name = 'MasterKeyMismatch';
  }
}

type Owner = Pick<Account, 'username' | 'email' | 'createdAt'>;

/**
 * What `wrappedServer` is bound to, as AES-GCM additional data: a JSON array, so no two accounts
 * encode alike. A data key moved into another record, or a record whose email was changed, won't open.
 */
const serverAad = ({ username, email, createdAt }: Owner) =>
  Buffer.from(JSON.stringify([username, email, createdAt]));

/**
 * The account's raw data key, opened with the master key; throws `MasterKeyMismatch` for another key,
 * and throws when the record's name, email or `createdAt` isn't the one it was locked for.
 */
export function unwrapServer(
  account: Pick<Account, 'wrappedServer' | 'keyId'> & Owner,
  masterKey: Uint8Array,
) {
  if (account.keyId !== masterKeyId(masterKey)) throw new MasterKeyMismatch();
  return unwrap(masterKey, account.wrappedServer, serverAad(account));
}

/** The data key locked with a password's raw `kek`, as the phone's `wrapDek` does. */
export function rewrapPassword(dek: Uint8Array, kek: Uint8Array): Sealed {
  return wrap(kek, dek);
}

const fail = (status: number, error: string): Result => ({ status, body: { error } });
const badRequest = () => fail(400, 'bad request');
/**
 * The two 401s of an account route, told apart so the phone can act on each: `moved` is a device
 * token that no longer counts (another phone logged in, or the account is gone); `denied` is a
 * password that is wrong, or a name that is not one (one body for both, so a name can't be probed).
 * The shared token's own refusal, `unauthorized`, is answered before any of this runs (http.ts).
 */
const moved = () => fail(401, 'moved');
const denied = () => fail(401, 'denied');

const K = {
  user: (name: string) => `acct:u:${name}`,
  email: (address: string) => `acct:e:${address}`,
  copy: (name: string) => `acct:c:${name}`,
  token: (hash: string) => `acct:t:${hash}`,
  claim: (name: string, since: string, version: number) => `acct:cl:${name}:${since}:${version}`,
  /** A reset link, by the hash of its token. */
  reset: (hash: string) => `acct:r:${hash}`,
  /** Marks a reset link as taken by one request, so two at once can't both use it. */
  resetUsed: (hash: string) => `acct:ru:${hash}`,
};

const gone = (): Result => fail(410, 'gone');
const busy = (): Result => fail(409, 'busy');
/** What `patch` answers when the record kept changing under it. */
const BUSY = 'busy';

/**
 * What a reset link is for: the account's name, the `createdAt` of the account it was made for, the
 * `authSalt` it had then and the address it was mailed to. A new password gives a new salt, so a link
 * made before one is dead. `tag` (see `resetTag`) is what only the service can make: the database
 * alone can't write a link the service honours.
 */
type ResetLink = Pick<Account, 'username' | 'createdAt' | 'authSalt' | 'email'> & { tag: string };

export function createAccounts({ store, masterKey, now, mailer, waitUntil }: AccountDeps) {
  if (masterKey.length !== 32) throw new Error('the master key must be 32 bytes');
  // A key of its own for reset tags, so the wrapping key is used for nothing else.
  const tagKey = Buffer.from(
    hkdfSync('sha256', masterKey, new Uint8Array(0), 'funancial reset tag', 32),
  );

  const stamp = () => new Date(now()).toISOString();
  const newToken = () => randomBytes(32).toString('base64url');

  /** Counts an attempt; the 429 to send when it is over, else null. It says nothing of any account. */
  async function throttle(bucket: string, subject: string, limit: number, windowSec: number) {
    const r = await rateLimit(store, bucket, subject, limit, windowSec);
    return r.ok ? null : { ...fail(429, 'too many attempts'), retryAfter: r.retryAfter };
  }

  /** The 429 for a name still waiting after failed log-ins, else null. Costs no scrypt. */
  async function loginWaiting(name: string): Promise<Result | null> {
    const left = await store.ttl(`rl:login:wait:${name}`);
    return left > 0 ? { ...fail(429, 'too many attempts'), retryAfter: left } : null;
  }

  /**
   * Counts a failed log-in against the name, whether or not it is an account's, so the answers and the
   * waits are the same for both: from the 5th failure on, the name waits (`loginWait`).
   */
  async function loginFailed(name: string): Promise<Result> {
    const key = `rl:login:fail:${name}`;
    // The count and its lifetime in one step: a function cut off between two would leave one for ever.
    const fails = await store.incr(key, LOGIN_FAILS_SECONDS);
    if (fails >= LOGIN_FREE_FAILS) {
      await store.setNx(`rl:login:wait:${name}`, fails, loginWait(fails));
    }
    return denied();
  }

  /** Whether `authKey` is the account's; an absent account costs the same work and never matches. */
  async function matches(account: Account | null, authKey: string) {
    const given = await hashAuth(
      authKey,
      account ? Buffer.from(account.authSalt, 'base64') : DUMMY_SALT,
    );
    const equal = timingSafeEqual(
      given,
      account ? Buffer.from(account.authHash, 'base64') : DUMMY_HASH,
    );
    return account !== null && equal;
  }

  /** The account's stored copy, or null: one left by an earlier account of the same name is no copy of this one. */
  async function ownCopy(account: Pick<Account, 'username' | 'createdAt'>) {
    const copy = await store.get<Copy>(K.copy(account.username));
    return copy && copy.createdAt === account.createdAt ? copy : null;
  }

  /** The account a Bearer device token belongs to, or null. */
  async function authed(token: string | null) {
    if (!token || !TOKEN.test(token)) return null;
    const hash = sha256(token);
    const name = await store.get<string>(K.token(hash));
    const account = typeof name === 'string' ? await store.get<Account>(K.user(name)) : null;
    return account && sameText(account.deviceTokenHash, hash) ? account : null;
  }

  /**
   * Changes fields on the stored record as it is now (not as a slow step earlier read it), and only if
   * nothing changed it between the read and the write: otherwise it reads again, up to 3 times, so no
   * request can write back an old copy of what another changed.
   *
   * `allowed` is what the caller was let do the change on: who it proved to be, the link it holds.
   * It is checked against the record each try has just read, never only the first: a reset or a
   * password change that lands in between must not let a request on the old password through.
   * Returns the record before; null if it's gone or `allowed` refuses it; `BUSY` if it never won.
   * (`allowed` is not asked about a write that already landed: it would now refuse its own.)
   */
  async function patch(
    name: string,
    fields: Partial<Account>,
    allowed: (current: Account) => boolean | Promise<boolean>,
  ) {
    let before: Account | undefined;
    for (let attempt = 0; attempt < WRITE_TRIES; attempt++) {
      const current = await store.get<Account>(K.user(name));
      if (!current) return null;
      // A write whose reply was lost (the client sends it again, and the key has already changed)
      // reports that it lost. Every caller's `fields` hold something it just made at random, so a
      // record that already holds them all is its own write: it won, and `before` is what it replaced.
      if (before && sameFields(current, fields)) return before;
      if (!(await allowed(current))) return null;
      if (await store.compareAndSet(K.user(name), current, { ...current, ...fields }))
        return current;
      before = current;
    }
    return BUSY;
  }

  const sameFields = (account: Account, fields: Partial<Account>) =>
    Object.entries(fields).every(
      ([key, value]) => JSON.stringify(account[key as keyof Account]) === JSON.stringify(value),
    );

  /** HMAC-SHA256 over a link's token hash and the account fields it is for, as JSON (unambiguous). */
  const resetTag = (hash: string, a: Omit<ResetLink, 'tag'>) =>
    createHmac('sha256', tagKey)
      .update(JSON.stringify([hash, a.username, a.createdAt, a.authSalt, a.email]))
      .digest('hex');

  /**
   * Whether a link still fits the account as it is now: the same email, `createdAt` and `authSalt`,
   * and a tag the service made for this token and those fields. Checked again on each write's try.
   */
  const linkFits = (hash: string, link: ResetLink, account: Account) =>
    link.email === account.email &&
    link.createdAt === account.createdAt &&
    link.authSalt === account.authSalt &&
    typeof link.tag === 'string' &&
    sameText(link.tag, resetTag(hash, account));

  /**
   * The account a reset token is for, if the link is unused and unexpired, the service made it, the
   * account is the one it was made for, and neither its password nor its email changed since. Any
   * other link is answered as an expired one.
   */
  async function liveReset(token: string) {
    const hash = sha256(token);
    const link = await store.get<ResetLink>(K.reset(hash));
    const account = link ? await store.get<Account>(K.user(link.username)) : null;
    // Another master key can't check the tag either: a setup problem to name, not an expired link.
    if (account && account.keyId !== masterKeyId(masterKey)) throw new MasterKeyMismatch();
    return link && account && linkFits(hash, link, account) ? { hash, link, account } : null;
  }

  /** Says in the log that a mail did not go, in one word: no address, no link, no message. */
  function logMailFailure(err: unknown) {
    const code = (err as { code?: unknown } | null)?.code;
    console.error(
      '[api] reset email failed:',
      typeof code === 'string' && /^[A-Z_]{3,20}$/.test(code) ? code : 'unknown',
    );
  }

  /**
   * Emails `account` a new link. False when the caller should go no further: the day's cap is used
   * up (nothing was made or sent) or this send failed (a stalled Gmail would take as long again for
   * the next, and the function has only so long).
   */
  async function sendLink(account: Account) {
    try {
      if (!(await rateLimit(store, 'forgot:global', 'all', SENDS_PER_DAY, DAY)).ok) {
        console.error('[api] reset email skipped: cap');
        return false;
      }
      const token = newToken();
      const hash = sha256(token);
      const fields = {
        username: account.username,
        createdAt: account.createdAt,
        authSalt: account.authSalt,
        email: account.email,
      };
      const link: ResetLink = { ...fields, tag: resetTag(hash, fields) };
      await store.set(K.reset(hash), link, RESET_SECONDS);
      await mailer?.send(
        account.email,
        'Choose a new Funancial password',
        'Hi,\n\ntap the link to choose a new Funancial password. It works for 30 minutes.\n\n' +
          `${SITE}/reset?token=${token}\n\n` +
          "If you didn't ask for this, ignore this email.",
      );
    } catch (err) {
      logMailFailure(err);
      return false;
    }
    return true;
  }

  /**
   * What `forgot` does after it has answered: finds the accounts `subject` (a username or an email
   * address) names, and mails each a link. Never rejects: whatever goes wrong is a line in the log,
   * as nothing here may reach the answer.
   */
  async function mailLinks(subject: string) {
    try {
      const byEmail = subject.includes('@');
      const names = byEmail ? await store.smembers(K.email(subject)) : [subject];
      let mailed = 0;
      for (const name of names) {
        if (mailed === MAIL_PER_ADDRESS) break;
        const account = await store.get<Account>(K.user(name));
        // A set can name an account that is gone, or one that has since taken another address.
        if (!account || (byEmail && account.email !== subject)) continue;
        mailed++;
        if (!(await sendLink(account))) break;
      }
    } catch (err) {
      logMailFailure(err);
    }
  }

  return {
    async signup(body: unknown, ip: string): Promise<Result> {
      const parsed = signupBody.safeParse(body);
      if (!parsed.success) return badRequest();
      const { username: name, email: address, authKey, dek, wrappedPw } = parsed.data;
      const over = await throttle('signup:ip', ip, 5, HOUR);
      if (over) return over;

      const token = newToken();
      const authSalt = randomBytes(16);
      const createdAt = stamp();
      const account: Account = {
        username: name,
        email: address,
        authHash: (await hashAuth(authKey, authSalt)).toString('base64'),
        authSalt: authSalt.toString('base64'),
        wrappedPw,
        wrappedServer: wrap(
          masterKey,
          Buffer.from(dek, 'base64'),
          serverAad({ username: name, email: address, createdAt }),
        ),
        keyId: masterKeyId(masterKey),
        deviceTokenHash: sha256(token),
        version: 1,
        createdAt,
      };
      // One step, so two sign-ups for a name can't both win. A retried write that already took
      // effect sees the name taken; this attempt's token hash is its nonce, so an account with it is ours.
      const created =
        (await store.setNx(K.user(name), account)) ||
        (await store.get<Account>(K.user(name)))?.deviceTokenHash === account.deviceTokenHash;
      if (!created) return fail(409, 'taken');
      try {
        await store.set(K.token(account.deviceTokenHash), name);
        await store.sadd(K.email(address), name);
      } catch (err) {
        // Better no account than one the phone was never told of and can't reach.
        await store.del(K.user(name), K.token(account.deviceTokenHash)).catch(() => {});
        throw err;
      }
      return { status: 200, body: { deviceToken: token } };
    },

    async login(body: unknown, ip: string): Promise<Result> {
      const parsed = loginBody.safeParse(body);
      if (!parsed.success) return badRequest();
      const { username: name, authKey } = parsed.data;
      // Both before the account is read or any scrypt runs.
      const over = (await throttle('login:ip', ip, 10, 60)) ?? (await loginWaiting(name));
      if (over) return over;

      const account = await store.get<Account>(K.user(name));
      if (!(await matches(account, authKey)) || !account) return loginFailed(name);

      // Read before anything changes, so a failed read never logs the old phone out.
      const firstRead = await ownCopy(account);

      // A new token ends the old phone's: that is the takeover. The pointer goes in first, so a
      // failure part-way leaves the old token working rather than none.
      const token = newToken();
      const hash = sha256(token);
      await store.set(K.token(hash), name);
      // The password is checked again on the record each try reads: a reset between would end it.
      const before = await patch(name, { deviceTokenHash: hash }, (now) => matches(now, authKey));
      if (before === BUSY || !before) {
        await store.del(K.token(hash));
        return before === BUSY ? busy() : denied();
      }
      await store.del(K.token(before.deviceTokenHash));
      // The log-in has happened: a count left behind only makes the next wait come sooner.
      await store.del(`rl:login:fail:${name}`).catch(() => {});

      // Read again: the old phone may have been acknowledged an upload since the first read, and the
      // new phone must start from it. If this read fails, the first one stands.
      const copy = await ownCopy(before).catch(() => firstRead);
      return {
        status: 200,
        body: {
          deviceToken: token,
          wrappedPw: before.wrappedPw,
          copy: copy
            ? {
                iv: copy.iv,
                ciphertext: copy.ciphertext,
                version: copy.version,
                savedAt: copy.savedAt,
              }
            : null,
          email: before.email,
        },
      };
    },

    async putCopy(token: string | null, body: unknown): Promise<Result> {
      const account = await authed(token);
      if (!account) return moved();
      const text = (body as { ciphertext?: unknown } | null)?.ciphertext;
      if (typeof text === 'string' && Buffer.byteLength(text, 'base64') > MAX_COPY_BYTES) {
        return fail(413, 'too large');
      }
      const parsed = copyBody.safeParse(body);
      if (!parsed.success) return badRequest();
      const { baseVersion, iv: ivText, ciphertext } = parsed.data;

      // The 409s say where the phone stands: `stale` means re-base on `version`, `busy` means
      // another write from this version is in flight (or stuck): try again later.
      const copyKey = K.copy(account.username);
      const stored = (await ownCopy(account))?.version ?? 0;
      if (baseVersion !== stored) return { status: 409, body: { error: 'stale', version: stored } };
      // Of two writers from the same version only the first claim wins. A retried write that already
      // took effect sees the claim taken, so the claim holds a nonce: finding ours means we won.
      const claim = K.claim(account.username, account.createdAt, baseVersion);
      const nonce = randomBytes(8).toString('hex');
      const won =
        (await store.setNx(claim, nonce, CLAIM_SECONDS)) || (await store.get(claim)) === nonce;
      if (!won) return { status: 409, body: { error: 'busy', version: stored } };

      try {
        const copy: Copy = {
          iv: ivText,
          ciphertext,
          version: baseVersion + 1,
          savedAt: stamp(),
          createdAt: account.createdAt,
        };
        await store.set(copyKey, copy);
        const now = await store.get<Account>(K.user(account.username));
        // Deleted while this was written: no copy may outlive its account.
        if (!now) {
          await store.del(copyKey);
          return moved();
        }
        // Taken over (or deleted and made again, which also gives a new token) meanwhile: this phone
        // has been replaced. The copy stays; the new phone's first upload is told its version (stale)
        // and goes on from it.
        if (now.deviceTokenHash !== account.deviceTokenHash) return moved();
        return { status: 200, body: { version: copy.version, savedAt: copy.savedAt } };
      } catch (err) {
        // A claim nobody will finish would turn the phone's next try into a wait; give it back.
        await store.del(claim).catch(() => {});
        throw err;
      }
    },

    async changePassword(token: string | null, body: unknown): Promise<Result> {
      const account = await authed(token);
      if (!account) return moved();
      const parsed = passwordBody.safeParse(body);
      if (!parsed.success) return badRequest();
      const { oldAuthKey, newAuthKey, newWrappedPw } = parsed.data;
      // The device token is no proof of the password, so guessing it here is limited like a log-in.
      const over = await throttle('password:user', account.username, 10, LOGIN_WINDOW);
      if (over) return over;
      if (!(await matches(account, oldAuthKey))) return denied();

      const authSalt = randomBytes(16);
      const changed = await patch(
        account.username,
        {
          authSalt: authSalt.toString('base64'),
          authHash: (await hashAuth(newAuthKey, authSalt)).toString('base64'),
          wrappedPw: newWrappedPw,
        },
        (now) => matches(now, oldAuthKey),
      );
      if (changed === BUSY) return busy();
      return changed ? { status: 204 } : denied();
    },

    /**
     * Emails a reset link to the account named by `who` (a username), or to each account that uses it
     * (an email address). Always `{ok:true}`, whether or not there is one; the limits count the name
     * asked about, not the account, so a 429 says nothing either. It answers before it has looked
     * for the account, so neither the answer nor its timing says whether there is one.
     */
    async forgot(body: unknown, ip: string): Promise<Result> {
      if (!mailer) return fail(503, 'not configured');
      const parsed = forgotBody.safeParse(body);
      if (!parsed.success) return badRequest();
      const subject = parsed.data.who;
      const over =
        (await throttle('forgot:ip', ip, 10, HOUR)) ??
        (await throttle('forgot:subject', subject, 3, HOUR));
      if (over) return over;

      // The answer is the same and as quick whether or not there is an account: the lookup, the
      // link and the mail come after it. A function stays alive for `waitUntil`.
      const work = mailLinks(subject);
      if (waitUntil) waitUntil(work);
      else await work;
      return { status: 200, body: { ok: true } };
    },

    /** Whose account a link (`{ token }`) is for, so the reset page can derive the right keys; 410 for any link that isn't live. */
    async resetInfo(body: unknown, ip: string): Promise<Result> {
      const parsed = resetInfoBody.safeParse(body);
      if (!parsed.success) return badRequest();
      const { token } = parsed.data;
      if (typeof token !== 'string' || !TOKEN.test(token)) return gone();
      const over = await throttle('reset:ip', ip, 20, HOUR);
      if (over) return over;
      const live = await liveReset(token);
      return live ? { status: 200, body: { username: live.account.username } } : gone();
    },

    /**
     * Sets a new password from a reset link and keeps the data: the data key is opened with the master
     * key and locked again with the page's `kek`. The device token and the copy are not touched, so the
     * phone in use goes on uploading. The link works once.
     */
    async reset(body: unknown, ip: string): Promise<Result> {
      const parsed = resetBody.safeParse(body);
      if (!parsed.success) return badRequest();
      const { token } = parsed.data;
      if (typeof token !== 'string' || !TOKEN.test(token)) return gone();
      const over = await throttle('reset:ip', ip, 20, HOUR);
      if (over) return over;
      const live = await liveReset(token);
      if (!live) return gone();

      // Of two requests with one link only the first claim wins. A retried write that already took
      // effect sees the claim taken, so the claim holds a nonce: finding ours means we won. A claim
      // nobody finishes holds until the link would have expired anyway.
      const used = K.resetUsed(live.hash);
      const nonce = randomBytes(8).toString('hex');
      const won =
        (await store.setNx(used, nonce, RESET_SECONDS)) || (await store.get(used)) === nonce;
      if (!won) return gone();

      let changed;
      try {
        const dek = unwrapServer(live.account, masterKey);
        const authSalt = randomBytes(16);
        changed = await patch(
          live.account.username,
          {
            authSalt: authSalt.toString('base64'),
            authHash: (await hashAuth(parsed.data.newAuthKey, authSalt)).toString('base64'),
            wrappedPw: rewrapPassword(dek, Buffer.from(parsed.data.kek, 'base64')),
          },
          // The link is for this account, this password and this email: a change in between kills it.
          (now) => linkFits(live.hash, live.link, now),
        );
      } catch (err) {
        // The friend can try the same link again.
        await store.del(used).catch(() => {});
        throw err;
      }
      if (!changed || changed === BUSY) {
        // Nothing was written: the link is dead (gone, or a password change), or can try again.
        await store.del(used).catch(() => {});
        return changed === BUSY ? busy() : gone();
      }
      // The claim already makes the link one-use; this tidies it away.
      await store.del(K.reset(live.hash)).catch(() => {});
      return { status: 204 };
    },

    async deleteAccount(token: string | null): Promise<Result> {
      const account = await authed(token);
      if (!account) return moved();
      await store.srem(K.email(account.email), account.username);
      // One call, last: the copy goes with the account, so an upload that lands part-way is removed
      // with it, and one that lands after finds no account and takes its own copy back. If anything
      // above fails the account is still there and the owner can ask again.
      await store.del(
        K.copy(account.username),
        K.token(account.deviceTokenHash),
        K.user(account.username),
      );
      return { status: 204 };
    },
  };
}
