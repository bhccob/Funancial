import { z } from 'zod';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  canonicalUsername,
  deriveAccountKeys,
  KDF_PARAMS,
  type KdfParams,
  newDek,
  openCopy,
  sealCopy,
  UnsupportedError,
  unwrapDek,
  wrapDek,
} from '@/data/accountCrypto';
import { base64ToBytes, DecryptError } from '@/data/crypto';
import { migrateSnapshot, SchemaVersionError, type DataSnapshot } from '@/domain/snapshot';
import { toast } from '@/lib/toast';
import type { Platform } from '@/platform/types';
import {
  Conflict,
  LoggedIn,
  NetworkError,
  Saved,
  SignedUp,
  type AccountApi,
  type Reply,
} from '@/services/account';
import type { AppState } from './appStore';

/** Where the account link is kept, encrypted, in the vault's metadata: never in the snapshot. */
const SLOT = 'funancial.account';

/** Calm and plain: the phone is fine, only the copy is behind. Shown once until a copy is saved again. */
export const SAVE_NOTICE =
  "Saving your copy isn't working right now. Your data is safe on this phone.";

/** A copy is saved this long after the last change. */
const SAVE_DELAY_MS = 30_000;
/** Waits after `busy` (another write from this version is in flight) and after a service failure. */
export const BUSY_RETRY = { first: 5_000, cap: 60_000 };
const FAILURE_RETRY = { first: 30_000, cap: 300_000 };
/** Stale answers in a row that one upload follows before it waits for a later try. */
const MAX_REBASES = 3;

export type AccountState = {
  username: string;
  /** `null` where the service did not say (an older service does not send it on log-in). */
  email: string | null;
  deviceToken: string;
  /** The data key's raw bytes, base64. Locks every copy; never leaves this phone except at sign-up. */
  dek: string;
  /** The version of the copy the service holds, which the next upload builds on. */
  version: number;
  savedAt: string | null;
  /** `moved`: another phone logged in, so this one no longer saves. */
  status: 'linked' | 'moved';
  /** Changes since the last saved copy. Kept, so a restart does not forget them. */
  dirty: boolean;
  /** The service refused the copy as too large. No more tries until the data changes. */
  tooBig: boolean;
};

const AccountStateSchema = z.object({
  username: z.string(),
  email: z.string().nullable(),
  deviceToken: z.string(),
  dek: z.string(),
  version: z.int().min(0),
  savedAt: z.string().nullable(),
  status: z.enum(['linked', 'moved']),
  dirty: z.boolean(),
  tooBig: z.boolean().default(false),
});

/** What the screens read: `loaded` is false until this unlock's state has been read (no account then reads as unknown). */
export type AccountView = { loaded: boolean; state: AccountState | null };

export type AccountErrorCode =
  | 'offline'
  | 'taken'
  | 'wrong'
  | 'limited'
  | 'busy'
  | 'unavailable'
  | 'invalid'
  | 'too-new'
  | 'damaged'
  | 'unsupported'
  | 'unreadable'
  | 'moved'
  | 'locked'
  | 'demo'
  | 'linked'
  | 'unlinked';

const MESSAGES: Record<AccountErrorCode, string> = {
  offline: "You're offline. Try again when you're connected.",
  taken: 'That username is taken. Try another one.',
  wrong: "That username and password don't match.",
  limited: 'Too many tries. Try again in a little while.',
  busy: 'Funcial is busy right now. Try again in a moment.',
  unavailable: "Funcial's service isn't answering right now. Try again in a moment.",
  invalid: 'Check what you typed and try again.',
  'too-new': "Your account's copy was saved by a newer Funcial. Update the app, then log in again.",
  damaged: "Your account's copy couldn't be opened. Try again later.",
  unsupported: "This phone's browser engine is too old to save or restore your copy.",
  unreadable:
    "Your account's copy couldn't be opened on this phone. Nothing was changed. Try again later, or update Android System WebView.",
  moved:
    "Your account moved to another phone, so this one can't change its password. Log in again first.",
  locked: 'Unlock Funcial first.',
  demo: "Demo money can't have an account.",
  linked: 'This phone already has an account.',
  unlinked: 'This phone has no account.',
};

/** What a screen shows for a failed account action: `message` is plain words, `code` says which. */
export class AccountError extends Error {
  readonly code: AccountErrorCode;
  constructor(code: AccountErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = 'AccountError';
    this.code = code;
  }
}

const USERNAME = /^[a-z0-9._-]{3,30}$/;

/** The rules the service and the reset page keep, as a sentence to show, or `null` when the input is fine. */
export const usernameProblem = (name: string): string | null =>
  USERNAME.test(canonicalUsername(name.trim()))
    ? null
    : 'Use 3 to 30 letters, numbers, dots, dashes or underscores.';
export const emailProblem = (email: string): string | null =>
  z.email().max(254).safeParse(email.trim()).success ? null : 'Enter a valid email address.';
export const passwordProblem = (password: string): string | null =>
  password.length >= 10 ? null : 'Use at least 10 characters.';
/** What "forgot password" takes: a username or an email address, as the service reads them. */
export const forgotProblem = (who: string): string | null =>
  usernameProblem(who) === null || emailProblem(who) === null
    ? null
    : 'Enter your username or your email address.';

/** Anything but the default settings. A phone with nothing else is an empty install. */
export function hasData(data: DataSnapshot): boolean {
  return Object.entries(data.tables).some(([name, rows]) => name !== 'settings' && rows.length > 0);
}

const importDek = (raw: string) =>
  crypto.subtle.importKey('raw', base64ToBytes(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);

export const backoff = ({ first, cap }: { first: number; cap: number }, failures: number) =>
  Math.min(cap, first * 2 ** Math.max(0, failures - 1));

function minutesText(seconds: number | null): string {
  const minutes = Math.ceil((seconds ?? 0) / 60);
  return minutes <= 1 ? 'a minute' : `${minutes} minutes`;
}

/** The `error` the service named in its answer, if it named one. */
const errorName = (reply: Reply): unknown => (reply.body as { error?: unknown } | null)?.error;

/**
 * The error to show for an answer that was not the one wanted. `wrong`: what a 401 that says `denied`
 * means for this call. Any other 401 (the shared token, say) is the service failing, not the person.
 */
function failed(reply: Reply, wrong?: string): AccountError {
  switch (reply.status) {
    case 400:
      return new AccountError('invalid');
    case 401:
      return wrong && errorName(reply) === 'denied'
        ? new AccountError('wrong', wrong)
        : new AccountError('unavailable');
    case 409:
      return new AccountError(errorName(reply) === 'taken' ? 'taken' : 'busy');
    case 429:
      return new AccountError(
        'limited',
        `Too many tries. Try again in ${minutesText(reply.retryAfter)}.`,
      );
    default:
      return new AccountError('unavailable');
  }
}

/** An answer, or `offline` where nothing came back. */
async function reach(send: () => Promise<Reply>): Promise<Reply> {
  try {
    return await send();
  } catch (e) {
    if (e instanceof NetworkError) throw new AccountError('offline');
    throw e;
  }
}

export type AccountActions = ReturnType<typeof createAccountActions>;

/**
 * The phone's side of an account: links this phone to one, keeps a locked copy of the data on the
 * service, and takes the data back on a new phone. One lives for the app's lifetime; `start()` has it
 * follow the store.
 *
 * It uploads about 30 s after the last change, when the app goes to the background and when the phone
 * is back online, only when something changed since the last good upload. The link (token and data
 * key) is read when the real data opens and dropped when it closes, and the demo has none: it never
 * signs up, never loads a link, never uploads. Whatever goes wrong with the service, the data on the
 * phone is never touched; a copy only ever goes up.
 */
export function createAccountActions(
  store: StoreApi<AppState>,
  api: AccountApi,
  platform: Pick<Platform, 'onPause'>,
  { kdf = KDF_PARAMS }: { kdf?: KdfParams } = {},
) {
  const view = createStore<AccountView>()(() => ({ loaded: false, state: null }));
  const app = () => store.getState();
  const current = () => view.getState().state;
  const open = () => app().phase === 'unlocked' && app().namespace === 'real';
  const offline = () => globalThis.navigator?.onLine === false;

  /** Changes each time the real data opens or closes, so an answer that arrives later can tell it is too late. */
  let session = 0;
  /** Counts data changes, to tell an upload whether more came in while it was on its way. */
  let changes = 0;
  /** Counts writes of the link, so a read that began earlier does not overwrite them. */
  let writes = 0;
  let failures = 0;
  let noticed = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const stopTimers = () => {
    clearTimeout(saveTimer);
    clearTimeout(retryTimer);
  };

  // ---- the link, kept encrypted in the vault's metadata

  let writing: Promise<unknown> = Promise.resolve();
  /** Shows `next` at once and writes it down behind earlier writes; rejects when the write fails. */
  function commit(next: AccountState | null): Promise<void> {
    writes++;
    view.setState({ state: next });
    const write = writing.then(() =>
      next ? app().putPrivate(SLOT, next) : app().deletePrivate(SLOT),
    );
    writing = write.catch(() => {});
    return write;
  }

  /** For the uploads' own bookkeeping: if it is not written down, the next upload re-bases and carries on. */
  function patch(change: Partial<AccountState>) {
    const state = current();
    if (!state) return;
    commit({ ...state, ...change }).catch((e: unknown) =>
      console.error('Saving the account link failed', e),
    );
  }

  async function load() {
    const mine = ++session;
    const at = writes;
    let found: AccountState | null = null;
    try {
      const stored = await app().getPrivate<unknown>(SLOT);
      const parsed = AccountStateSchema.safeParse(stored);
      found = parsed.success ? parsed.data : null;
    } catch (e) {
      console.error('Reading the account link failed', e);
    }
    if (mine !== session) return;
    // A link written while this was reading (a log-in right after the app opened) is newer.
    view.setState(writes === at ? { loaded: true, state: found } : { loaded: true });
    if (current()?.status === 'linked' && current()?.dirty) void flush();
  }

  function unload() {
    session++;
    stopTimers();
    failures = 0;
    noticed = false;
    view.setState({ loaded: false, state: null });
  }

  // ---- saving the copy

  function notice() {
    if (noticed) return;
    noticed = true;
    toast('warning', SAVE_NOTICE);
  }

  function retryIn(ms: number) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void flush(), ms);
  }

  function armSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  function changed() {
    const state = current();
    if (!state || state.status !== 'linked' || !open()) return;
    changes++;
    if (!state.dirty || state.tooBig) patch({ dirty: true, tooBig: false });
    armSave();
  }

  /** Acts on the service's answer to an upload. True when the upload should go again from a new version. */
  function answered(reply: Reply, seen: number): boolean {
    if (reply.status === 200) {
      const saved = Saved.safeParse(reply.body);
      if (saved.success) {
        failures = 0;
        noticed = false;
        clearTimeout(retryTimer);
        const more = changes !== seen;
        patch({ version: saved.data.version, savedAt: saved.data.savedAt, dirty: more });
        if (more) armSave();
        return false;
      }
    }
    if (reply.status === 401 && errorName(reply) === 'moved') {
      // Another phone logged in: this one is no longer the account's. Its data stays as it is.
      // (Any other 401 is the service failing, such as a shared token it no longer accepts.)
      stopTimers();
      patch({ status: 'moved' });
      return false;
    }
    const conflict = reply.status === 409 ? Conflict.safeParse(reply.body) : null;
    if (conflict?.success && conflict.data.error === 'stale') {
      // With this phone's own token a stale base can only mean its earlier upload landed.
      patch({ version: conflict.data.version });
      return true;
    }
    if (conflict?.success && conflict.data.error === 'busy') {
      retryIn(backoff(BUSY_RETRY, ++failures));
    } else if (reply.status === 429) {
      retryIn(Math.min(Math.max(reply.retryAfter ?? 60, 1), 900) * 1_000);
    } else if (reply.status === 413) {
      // Waiting would not make it smaller: it is tried again when the data changes.
      patch({ tooBig: true });
      notice();
    } else if (reply.status === 400) {
      notice();
    } else {
      retryIn(backoff(FAILURE_RETRY, ++failures));
      notice();
    }
    return false;
  }

  async function attempt() {
    for (let rebases = 0; rebases < MAX_REBASES; rebases++) {
      const state = current();
      if (!state || state.status !== 'linked' || !state.dirty || state.tooBig) return;
      if (!open() || offline()) return;
      const mine = session;
      const token = state.deviceToken;
      // Both read now, before any wait: what is sealed is the data that was open when this began (and
      // holds everything announced up to `seen`), never what a lock or a switch to the demo left.
      const seen = changes;
      const data = app().data;
      let reply: Reply;
      try {
        const sealedCopy = await sealCopy(data, await importDek(state.dek));
        // The data may have closed while this was being sealed: then it is not this phone's to send.
        if (mine !== session || !open() || current()?.deviceToken !== token) return;
        reply = await api.putCopy(token, { baseVersion: state.version, ...sealedCopy });
      } catch (e) {
        // Nothing came back: the phone's next signal, or the app going to the background, tries again.
        if (e instanceof NetworkError) return;
        if (mine !== session) return;
        console.error('Preparing the copy failed', e instanceof Error ? e.name : e);
        return notice();
      }
      // A log-in or a lock since: the answer is for a link this phone no longer holds.
      if (mine !== session || current()?.deviceToken !== token) return;
      if (!answered(reply, seen)) return;
    }
    // Stale answers over and over: ask again, but less and less often.
    retryIn(backoff(FAILURE_RETRY, ++failures));
  }

  let running: Promise<void> | null = null;
  let again = false;
  /** Saves a copy now if something changed since the last one. Never rejects. */
  function flush(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await attempt();
        } while (again);
      } catch (e) {
        console.error('Saving the copy failed', e);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  // ---- what the person does

  let working = false;
  /** One of these at a time: a second tap before the first answers must not start a second sign-up. */
  function exclusive<A extends unknown[], R>(job: (...args: A) => Promise<R>) {
    return async (...args: A): Promise<R> => {
      if (working) throw new AccountError('busy', 'Funcial is still working on your last tap.');
      working = true;
      try {
        return await job(...args);
      } finally {
        working = false;
      }
    };
  }

  function requireOpen() {
    if (app().namespace === 'demo') throw new AccountError('demo');
    // Not before the link has been read: then "no account" might only mean "not read yet".
    if (app().phase !== 'unlocked' || !view.getState().loaded) throw new AccountError('locked');
  }

  async function signUp({
    username,
    email,
    password,
  }: {
    username: string;
    email: string;
    password: string;
  }): Promise<void> {
    requireOpen();
    if (current()) throw new AccountError('linked');
    const problem = usernameProblem(username) ?? emailProblem(email) ?? passwordProblem(password);
    if (problem) throw new AccountError('invalid', problem);

    const name = canonicalUsername(username.trim());
    const address = email.trim();
    const mine = session;
    // Slow on purpose: once per submit.
    const { authKey, kek } = await deriveAccountKeys(name, password, kdf);
    const dek = await newDek();
    const body = {
      username: name,
      email: address,
      authKey,
      dek: dek.raw,
      wrappedPw: await wrapDek(dek.raw, kek),
    };

    let reply = await api.signUp(body).catch((e: unknown) => {
      if (e instanceof NetworkError) return null;
      throw e;
    });
    const lostReply = reply === null;
    reply ??= await reach(() => api.signUp(body));

    let deviceToken: string | undefined;
    let dekRaw = dek.raw;
    if (reply.status === 200) {
      const parsed = SignedUp.safeParse(reply.body);
      if (!parsed.success) throw new AccountError('unavailable');
      deviceToken = parsed.data.deviceToken;
    } else if (lostReply && failed(reply).code === 'taken') {
      // The first try may have landed with its answer lost: then this name is ours, with the same
      // keys. An account of ours has no copy yet; one that has is someone's, and the name is taken.
      const again = await reach(() => api.logIn({ username: name, authKey }));
      // Not our password: the name is someone else's. Anything else is the service, not the name.
      if (again.status !== 200) {
        throw errorName(again) === 'denied' ? new AccountError('taken') : failed(again);
      }
      const parsed = LoggedIn.safeParse(again.body);
      if (!parsed.success) throw new AccountError('unavailable');
      const key = parsed.data.copy
        ? null
        : await unwrapDek(parsed.data.wrappedPw, kek).catch(() => null);
      if (!key) throw new AccountError('taken');
      deviceToken = parsed.data.deviceToken;
      dekRaw = key.raw;
    } else {
      throw failed(reply);
    }

    if (mine !== session) throw new AccountError('locked');
    await commit({
      username: name,
      email: address,
      deviceToken,
      dek: dekRaw,
      version: 0,
      savedAt: null,
      status: 'linked',
      dirty: true,
      tooBig: false,
    });
    await flush();
  }

  /**
   * Takes the account to this phone. On a phone that has data it first returns `needs-confirm`
   * and does nothing at all (not even ask the service, as a log-in moves the account here); the
   * screen asks, and calls again with `replace: true`. An empty phone at the welcome screen gets its
   * vault once the account has answered, so a wrong password leaves it as it was.
   */
  async function logIn(
    { username, password }: { username: string; password: string },
    { replace }: { replace: boolean },
  ): Promise<'needs-confirm' | 'done'> {
    const fresh = app().phase === 'welcome' && app().namespace === 'real';
    if (!fresh) requireOpen();
    if (current()?.status === 'linked') throw new AccountError('linked');
    const name = canonicalUsername(username.trim());
    if (!USERNAME.test(name)) throw new AccountError('wrong');
    if (!fresh && !replace && hasData(app().data)) return 'needs-confirm';

    const mine = session;
    const { authKey, kek } = await deriveAccountKeys(name, password, kdf);
    const reply = await reach(() => api.logIn({ username: name, authKey }));
    if (reply.status !== 200) throw failed(reply, MESSAGES.wrong);
    const parsed = LoggedIn.safeParse(reply.body);
    if (!parsed.success) throw new AccountError('unavailable');
    const { deviceToken, wrappedPw, copy } = parsed.data;

    // From here the service has made this phone the active one.
    let dek: Awaited<ReturnType<typeof unwrapDek>>;
    try {
      dek = await unwrapDek(wrappedPw, kek);
    } catch {
      throw new AccountError('damaged');
    }
    let snapshot: DataSnapshot | null = null;
    if (copy) {
      try {
        snapshot = migrateSnapshot(await openCopy(copy, dek));
      } catch (e) {
        // A copy this phone can't open is never replaced, and nothing links to it: it may open on
        // another phone, or after an update, and the data here is kept as it is.
        if (e instanceof SchemaVersionError) throw new AccountError('too-new');
        if (e instanceof UnsupportedError) throw new AccountError('unsupported', e.message);
        if (e instanceof DecryptError) {
          const cause = (e.cause as { name?: unknown } | null | undefined)?.name;
          console.error(
            'The account copy would not open',
            typeof cause === 'string' ? cause : 'unknown',
          );
          throw new AccountError('unreadable');
        }
        throw new AccountError('damaged');
      }
    }

    if (mine !== session) throw new AccountError('locked');
    if (fresh) await app().startFresh();
    // The data first: a link with the old data still in place would upload it over the copy.
    if (snapshot) await app().restoreSnapshot(snapshot);
    await commit({
      username: name,
      email: parsed.data.email ?? null,
      deviceToken,
      dek: dek.raw,
      version: copy?.version ?? 0,
      savedAt: snapshot ? (copy?.savedAt ?? new Date().toISOString()) : null,
      status: 'linked',
      dirty: !snapshot,
      tooBig: false,
    });
    if (!snapshot) void flush();
    return 'done';
  }

  async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    requireOpen();
    const state = current();
    if (!state || state.status !== 'linked') throw new AccountError('unlinked');
    const problem = passwordProblem(newPassword);
    if (problem) throw new AccountError('invalid', problem);

    const old = await deriveAccountKeys(state.username, oldPassword, kdf);
    const next = await deriveAccountKeys(state.username, newPassword, kdf);
    const newWrappedPw = await wrapDek(state.dek, next.kek);
    const reply = await reach(() =>
      api.changePassword(state.deviceToken, {
        oldAuthKey: old.authKey,
        newAuthKey: next.authKey,
        newWrappedPw,
      }),
    );
    if (reply.status === 401 && errorName(reply) === 'moved') {
      stopTimers();
      patch({ status: 'moved' });
      throw new AccountError('moved');
    }
    if (reply.status !== 204) throw failed(reply, "That isn't your current password.");
  }

  /**
   * Asks the service to email a reset link. It answers any valid username or email alike (200) and
   * anything else with 400, so both read as sent: the screen must not tell whether there is an account.
   */
  async function forgot(who: string): Promise<void> {
    const reply = await reach(() => api.forgot({ who: who.trim() }));
    if (reply.status === 200 || reply.status === 400) return;
    throw failed(reply);
  }

  /**
   * Removes the account and its copy from the service and stops saving. The data on the phone stays.
   * `deleted`: the service removed them. `moved`: this phone's token no longer counted (another phone
   * logged in, or the account is gone), so nothing was deleted; the account, if there is one, is on
   * the other phone. The link is forgotten either way.
   */
  async function deleteAccount(): Promise<'deleted' | 'moved'> {
    requireOpen();
    const state = current();
    if (!state) throw new AccountError('unlinked');
    // No copy may go up while the account is being taken down.
    stopTimers();
    const reply = await reach(() => api.deleteAccount(state.deviceToken));
    // A `moved` 401 is a token that no longer counts (the account moved, or is gone): nothing was
    // deleted. Any other 401 is the service failing, and the link stays.
    const moved = reply.status === 401 && errorName(reply) === 'moved';
    if (reply.status !== 204 && !moved) throw failed(reply);
    await commit(null);
    return moved ? 'moved' : 'deleted';
  }

  /** Keeps using this phone without an account: forgets the link, and leaves the service alone. */
  async function unlink(): Promise<void> {
    requireOpen();
    stopTimers();
    await commit(null);
  }

  /** Starts following the store, the app going to the background and the network. Returns a stop. */
  function start(): () => void {
    const stops = [
      store.subscribe((s, prev) => {
        if (s.phase === prev.phase && s.namespace === prev.namespace) return;
        if (s.phase === 'unlocked' && s.namespace === 'real') void load();
        else unload();
      }),
      app().onDataChange(changed),
      platform.onPause(() => void flush()),
    ];
    const online = () => {
      clearTimeout(retryTimer);
      void flush();
    };
    globalThis.addEventListener?.('online', online);
    if (open()) void load();
    return () => {
      globalThis.removeEventListener?.('online', online);
      stops.forEach((stop) => stop());
      unload();
    };
  }

  return {
    view,
    start,
    signUp: exclusive(signUp),
    logIn: exclusive(logIn),
    changePassword: exclusive(changePassword),
    deleteAccount: exclusive(deleteAccount),
    unlink: exclusive(unlink),
    forgot,
    /** Saves a copy now if something changed since the last one. Resolves when that is done; never rejects. */
    saveNow: flush,
  };
}
