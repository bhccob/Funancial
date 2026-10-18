import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveAccountKeys, openCopy, UnsupportedError, unwrapDek } from '@/data/accountCrypto';
import { readBackup } from '@/data/backup';
import { base64ToBytes } from '@/data/crypto';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { toastStore } from '@/lib/toast';
import type { CopyBody } from '@/services/account';
import { answers, fakeAccountApi, lostReply, unreachable } from '@/test/fakeAccountApi';
import { makeExpense, makeProfile } from '@/test/fixtures';
import { freshRealStore, realStoreDeps } from '@/test/realStore';
import {
  AccountError,
  backoff,
  BUSY_RETRY,
  createAccountActions,
  forgotProblem,
  SAVE_NOTICE,
  type AccountActions,
} from './accountActions';
import { createAppStore } from './appStore';

const ME = { username: 'Robin', email: 'robin@example.com', password: 'a long enough password' };
/** Argon2id at its smallest: 8 KiB, one pass. */
const FAST = { memorySize: 8, iterations: 1, parallelism: 1 };

/** The browser's `online` event, and the app going to the background, which node has neither of. */
let network = new EventTarget();
let pauseListeners = new Set<() => void>();
const platform = {
  onPause(cb: () => void) {
    pauseListeners.add(cb);
    return () => void pauseListeners.delete(cb);
  },
};
const pause = () => pauseListeners.forEach((cb) => cb());
const goOnline = () => network.dispatchEvent(new Event('online'));

beforeEach(() => {
  network = new EventTarget();
  pauseListeners = new Set();
  toastStore.setState({ toasts: [] });
  const target = network;
  vi.stubGlobal('addEventListener', target.addEventListener.bind(target));
  vi.stubGlobal('removeEventListener', target.removeEventListener.bind(target));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const realSetTimeout = globalThis.setTimeout;
/** Lets what is already under way (sealing, storage) run on the real clock. */
const quiet = () => new Promise<void>((resolve) => void realSetTimeout(resolve, 40));
/** Moves the fake clock on, then lets what that set going run, so a check that nothing happened means it. */
async function elapse(ms: number) {
  vi.advanceTimersByTime(ms);
  await quiet();
}

/** Time moves only when a test says so; the storage underneath keeps its own clock. */
const clock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

/** Every toast shown from now on, even one that has gone by the time the test looks. */
function collectToasts() {
  const shown: string[] = [];
  toastStore.subscribe((s, prev) => {
    for (const t of s.toasts) if (!prev.toasts.includes(t)) shown.push(t.message);
  });
  return shown;
}

/**
 * Holds the next `importKey`, which is the first thing an upload does, until the returned function
 * is called; with `fail`, it then fails instead of importing.
 */
function holdNextImport(fail?: Error) {
  const real = crypto.subtle.importKey.bind(crypto.subtle) as (
    ...a: unknown[]
  ) => Promise<CryptoKey>;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  vi.spyOn(crypto.subtle, 'importKey').mockImplementationOnce((async (...args: unknown[]) => {
    await held;
    if (fail) throw fail;
    return real(...args);
  }) as typeof crypto.subtle.importKey);
  return release;
}

const loaded = (a: AccountActions) => vi.waitFor(() => expect(a.view.getState().loaded).toBe(true));

async function follow(
  store: Awaited<ReturnType<typeof freshRealStore>>['store'],
  server = fakeAccountApi(),
) {
  const actions = createAccountActions(store, server.api, platform, { kdf: FAST });
  const stop = actions.start();
  await loaded(actions);
  return { actions, server, stop };
}

async function setup() {
  const t = await freshRealStore();
  return { ...t, ...(await follow(t.store)) };
}

const linkedState = (a: AccountActions) => a.view.getState().state;
const puts = (server: ReturnType<typeof fakeAccountApi>) => server.sent('putCopy') as CopyBody[];
const waitForPuts = (server: ReturnType<typeof fakeAccountApi>, n: number) =>
  vi.waitFor(() => expect(puts(server)).toHaveLength(n));
const lunch = (id: string) => makeExpense({ id, amount: 12_50 });

/** What a copy holds once opened with the account's data key. */
async function opened(body: CopyBody, dekRaw: string) {
  const key = await crypto.subtle.importKey('raw', base64ToBytes(dekRaw), 'AES-GCM', false, [
    'decrypt',
  ]);
  return (await openCopy(body, key)) as DataSnapshot;
}

function snapshotWith(...ids: string[]): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ name: 'Robin' })];
  data.tables.expense = ids.map(lunch);
  return data;
}

describe('sign-up', () => {
  it('keeps the link encrypted in the metadata, outside the data', async () => {
    const { actions, deps, store } = await setup();
    await actions.signUp(ME);

    const backend = await deps.storage.open('real');
    const stored = await backend.meta.get<unknown>('funancial.account');
    await backend.close();
    expect(stored).toEqual({ iv: expect.any(String), data: expect.any(String) });
    const text = JSON.stringify(stored);
    for (const plain of ['robin', 'example.com', 'deviceToken', 'username']) {
      expect(text).not.toContain(plain);
    }
    // The data holds none of it.
    const state = linkedState(actions)!;
    const dataText = JSON.stringify(store.getState().data);
    for (const secret of [state.dek, state.deviceToken, 'funancial.account']) {
      expect(dataText).not.toContain(secret);
    }
  });

  it('is read back after a restart', async () => {
    const { actions, deps, server } = await setup();
    await actions.signUp(ME);
    const again = createAppStore(deps);
    await again.getState().boot();
    const next = await follow(again, server);
    expect(linkedState(next.actions)).toEqual(linkedState(actions));
  });

  it('sends the keys the service needs, not the password, and canonical names', async () => {
    const { actions, server } = await setup();
    await actions.signUp({ ...ME, username: '  Robin ', email: ' robin@example.com ' });
    const [body] = server.sent('signUp') as Array<Record<string, unknown>>;
    expect(body).toMatchObject({ username: 'robin', email: 'robin@example.com' });
    expect(Object.keys(body!).sort()).toEqual(
      ['authKey', 'dek', 'email', 'username', 'wrappedPw'].sort(),
    );
    expect(JSON.stringify(body)).not.toContain(ME.password);
    // wrappedPw opens with the password's key, to the dek that was sent.
    const { kek } = await deriveAccountKeys('robin', ME.password, FAST);
    const wrapped = await unwrapDek(body!.wrappedPw as { iv: string; ciphertext: string }, kek);
    expect(wrapped.raw).toBe(body!.dek);
    expect(linkedState(actions)).toMatchObject({ username: 'robin', dek: body!.dek });
  });

  it('uploads version 0 at once, then a change 30 s after it', async () => {
    const { actions, server, store } = await setup();
    await actions.signUp(ME);
    expect(puts(server)).toHaveLength(1);
    expect(puts(server)[0]).toMatchObject({ baseVersion: 0 });
    expect(linkedState(actions)).toMatchObject({ version: 1, dirty: false, status: 'linked' });
    expect(linkedState(actions)!.savedAt).not.toBeNull();

    clock();
    await store.getState().put('expense', lunch('e1'));
    await elapse(29_999);
    expect(puts(server)).toHaveLength(1);
    await elapse(1);
    await waitForPuts(server, 2);
    expect(puts(server)[1]).toMatchObject({ baseVersion: 1 });
    await vi.waitFor(() =>
      expect(linkedState(actions)).toMatchObject({ version: 2, dirty: false }),
    );
  });

  it('waits 30 s after the last change, not the first', async () => {
    const { actions, server, store } = await setup();
    await actions.signUp(ME);
    clock();
    await store.getState().put('expense', lunch('e1'));
    await elapse(20_000);
    await store.getState().put('expense', lunch('e2'));
    await elapse(29_999);
    expect(puts(server)).toHaveLength(1);
    await elapse(1);
    await waitForPuts(server, 2);
    const copy = await opened(puts(server)[1]!, linkedState(actions)!.dek);
    expect(copy.tables.expense.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('uploads nothing when nothing changed', async () => {
    const { actions, server } = await setup();
    await actions.signUp(ME);
    clock();
    await actions.saveNow();
    pause();
    goOnline();
    await elapse(10 * 60_000);
    await actions.saveNow();
    expect(puts(server)).toHaveLength(1);
  });

  it('uploads when the app goes to the background, without waiting', async () => {
    const { actions, server, store } = await setup();
    await actions.signUp(ME);
    clock();
    await store.getState().put('expense', lunch('e1'));
    pause();
    await waitForPuts(server, 2);
  });

  it('takes one request at a time: a second tap does not start a second sign-up', async () => {
    const { actions, server } = await setup();
    const first = actions.signUp(ME);
    await expect(actions.signUp(ME)).rejects.toMatchObject({ code: 'busy' });
    await first;
    expect(server.sent('signUp')).toHaveLength(1);
    expect(linkedState(actions)).toMatchObject({ status: 'linked' });
  });

  it('refuses a bad username, email or password before asking the service', async () => {
    const { actions, server } = await setup();
    for (const bad of [
      { ...ME, username: 'ab' },
      { ...ME, username: 'has space' },
      { ...ME, email: 'nobody' },
      { ...ME, password: 'short' },
    ]) {
      await expect(actions.signUp(bad)).rejects.toMatchObject({ code: 'invalid' });
    }
    expect(server.calls).toEqual([]);
    expect(linkedState(actions)).toBeNull();
  });

  it('says a taken name is taken, without trying to log in', async () => {
    const { actions, server } = await setup();
    await server.seed({ username: 'robin', password: 'someone elses password' });
    await expect(actions.signUp(ME)).rejects.toMatchObject({ code: 'taken' });
    expect(server.sent('logIn')).toEqual([]);
    expect(linkedState(actions)).toBeNull();
  });

  it('after a lost answer, a name that is its own is not taken', async () => {
    const { actions, server } = await setup();
    server.script('signUp', lostReply);
    await actions.signUp(ME);
    expect(server.sent('signUp')).toHaveLength(2);
    // The account the first try made, with its data key.
    expect(linkedState(actions)).toMatchObject({
      status: 'linked',
      dek: server.accounts.get('robin')!.dek,
      deviceToken: server.accounts.get('robin')!.token,
    });
    expect(puts(server)).toHaveLength(1);
  });

  it('after a lost answer, a name that is someone else is taken', async () => {
    const { actions, server } = await setup();
    server.script('signUp', unreachable);
    await server.seed({ username: 'robin', password: 'someone elses password' });
    await expect(actions.signUp(ME)).rejects.toMatchObject({ code: 'taken' });
    expect(linkedState(actions)).toBeNull();
  });

  it('after a lost answer, an account that already has a copy is not claimed', async () => {
    const { actions, server } = await setup();
    server.script('signUp', unreachable);
    await server.seed({ username: 'robin', password: ME.password, snapshot: snapshotWith('x') });
    await expect(actions.signUp(ME)).rejects.toMatchObject({ code: 'taken' });
    expect(linkedState(actions)).toBeNull();
    expect(puts(server)).toEqual([]);
  });

  it('says offline when nothing answers twice, and keeps no link', async () => {
    const { actions, server } = await setup();
    server.script('signUp', unreachable, unreachable);
    await expect(actions.signUp(ME)).rejects.toMatchObject({ code: 'offline' });
    expect(linkedState(actions)).toBeNull();
  });

  it('tells a rate limit with its wait, and nothing about the account', async () => {
    const { actions, server } = await setup();
    server.script('signUp', answers(429, { error: 'too many attempts' }, 1800));
    const error = await actions.signUp(ME).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AccountError);
    expect((error as AccountError).message).toBe('Too many tries. Try again in 30 minutes.');
  });

  it('keeps no link when the service is down, and the data is as it was', async () => {
    const { actions, server, store } = await setup();
    await store.getState().put('expense', lunch('e1'));
    server.script('signUp', answers(503, { error: 'not configured' }));
    await expect(actions.signUp(ME)).rejects.toMatchObject({ code: 'unavailable' });
    expect(linkedState(actions)).toBeNull();
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('demo', () => {
  it('never signs up and never uploads', async () => {
    const { actions, server, store } = await setup();
    await store.getState().startDemo();
    await expect(actions.signUp(ME)).rejects.toMatchObject({ code: 'demo' });
    await expect(actions.logIn(ME, { replace: true })).rejects.toMatchObject({ code: 'demo' });
    clock();
    await store.getState().put('expense', lunch('d1'));
    pause();
    goOnline();
    await elapse(10 * 60_000);
    await actions.saveNow();
    expect(server.calls).toEqual([]);
    expect(actions.view.getState()).toEqual({ loaded: false, state: null });
  });

  it('keeps nothing in the demo even when asked to store something', async () => {
    const { store } = await setup();
    await store.getState().startDemo();
    await expect(store.getState().putPrivate('funancial.account', { x: 1 })).rejects.toThrow(
      "Demo data can't keep an account.",
    );
  });

  it('a linked phone that goes into the demo uploads nothing from it, and has its link back after', async () => {
    const { actions, server, store } = await setup();
    await actions.signUp(ME);
    await store.getState().startDemo();
    clock();
    await store.getState().put('expense', lunch('d1'));
    await elapse(10 * 60_000);
    await actions.saveNow();
    expect(puts(server)).toHaveLength(1);

    vi.useRealTimers();
    await store.getState().exitDemo();
    await loaded(actions);
    expect(linkedState(actions)).toMatchObject({ username: 'robin', status: 'linked' });
  });
});

describe('log-in', () => {
  const creds = { username: 'Robin', password: ME.password };

  it('on an empty install restores the account copy through the restore path and links', async () => {
    const { actions, server, store, deps } = await setup();
    await server.seed({
      username: 'robin',
      password: ME.password,
      snapshot: snapshotWith('a', 'b'),
    });
    await expect(actions.logIn(creds, { replace: false })).resolves.toBe('done');
    expect(
      store
        .getState()
        .data.tables.expense.map((e) => e.id)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(store.getState().data.tables.profile[0]!.name).toBe('Robin');
    expect(linkedState(actions)).toMatchObject({
      username: 'robin',
      email: 'seed@example.com',
      status: 'linked',
      version: 1,
      dirty: false,
      deviceToken: server.accounts.get('robin')!.token,
    });
    // The restore went through the repository: it is there after a restart.
    const again = createAppStore(deps);
    await again.getState().boot();
    expect(
      again
        .getState()
        .data.tables.expense.map((e) => e.id)
        .sort(),
    ).toEqual(['a', 'b']);
    // Nothing goes back up: the copy is what the phone holds.
    clock();
    await elapse(60_000);
    await actions.saveNow();
    expect(puts(server)).toEqual([]);
  });

  it('on a phone with data asks first and changes nothing, not even at the service', async () => {
    const { actions, server, store } = await setup();
    await store.getState().put('expense', lunch('mine'));
    await server.seed({
      username: 'robin',
      password: ME.password,
      snapshot: snapshotWith('theirs'),
    });
    const before = server.accounts.get('robin')!.token;

    await expect(actions.logIn(creds, { replace: false })).resolves.toBe('needs-confirm');
    expect(server.calls).toEqual([]);
    expect(server.accounts.get('robin')!.token).toBe(before);
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['mine']);
    expect(linkedState(actions)).toBeNull();
  });

  it('on a phone with data restores once confirmed', async () => {
    const { actions, server, store } = await setup();
    await store.getState().put('expense', lunch('mine'));
    await server.seed({
      username: 'robin',
      password: ME.password,
      snapshot: snapshotWith('theirs'),
    });
    await expect(actions.logIn(creds, { replace: true })).resolves.toBe('done');
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['theirs']);
    expect(linkedState(actions)).toMatchObject({ username: 'robin', status: 'linked' });
  });

  it('with no copy yet keeps the data on the phone and uploads it as the first copy', async () => {
    const { actions, server, store } = await setup();
    await store.getState().put('expense', lunch('mine'));
    await server.seed({ username: 'robin', password: ME.password });
    await expect(actions.logIn(creds, { replace: true })).resolves.toBe('done');
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['mine']);
    await waitForPuts(server, 1);
    expect(puts(server)[0]).toMatchObject({ baseVersion: 0 });
  });

  const COULD_NOT_OPEN =
    "Your account's copy couldn't be opened on this phone. Nothing was changed. Try again later, or update Android System WebView.";
  const unreadable = {
    iv: 'AAAAAAAAAAAAAAAA',
    ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    version: 3,
    savedAt: '2026-10-01T08:00:00.000Z',
  };

  it.each([
    ['a phone with data', true],
    ['an empty install', false],
  ])('never replaces a copy it could not open: %s', async (_name, withData) => {
    const { actions, server, store } = await setup();
    if (withData) await store.getState().put('expense', lunch('mine'));
    await server.seed({ username: 'robin', password: ME.password, copy: unreadable });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(actions.logIn(creds, { replace: true })).rejects.toMatchObject({
      code: 'unreadable',
      message: COULD_NOT_OPEN,
    });
    expect(linkedState(actions)).toBeNull();
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(withData ? ['mine'] : []);

    clock();
    pause();
    goOnline();
    await elapse(10 * 60_000);
    await actions.saveNow();
    expect(puts(server)).toEqual([]);
    expect(server.accounts.get('robin')!.copy).toEqual(unreadable);
    // Only the name of what went wrong is logged, not the error with whatever it holds.
    expect(logged).toHaveBeenCalledWith(expect.any(String), 'OperationError');
  });

  it('says so, and changes nothing, when this phone cannot unpack a copy', async () => {
    const { actions, server, store } = await setup();
    await store.getState().put('expense', lunch('mine'));
    await server.seed({
      username: 'robin',
      password: ME.password,
      snapshot: snapshotWith('theirs'),
    });
    const copy = { ...server.accounts.get('robin')!.copy! };
    vi.stubGlobal('DecompressionStream', undefined);

    await expect(actions.logIn(creds, { replace: true })).rejects.toMatchObject({
      code: 'unsupported',
      message: new UnsupportedError().message,
    });
    expect(linkedState(actions)).toBeNull();
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['mine']);
    expect(puts(server)).toEqual([]);
    expect(server.accounts.get('robin')!.copy).toEqual(copy);
  });

  it('takes the time of the copy as the time it was saved', async () => {
    const { actions, server } = await setup();
    await server.seed({
      username: 'robin',
      password: ME.password,
      snapshot: snapshotWith('a'),
      savedAt: '2026-09-30T08:00:00.000Z',
    });
    await actions.logIn(creds, { replace: false });
    expect(linkedState(actions)!.savedAt).toBe('2026-09-30T08:00:00.000Z');
  });

  it('keeps the email the service returns, and none when it returns none', async () => {
    const { actions, server } = await setup();
    await server.seed({
      username: 'robin',
      password: ME.password,
      snapshot: snapshotWith('a'),
      email: 'robin@work.example',
    });
    await actions.logIn(creds, { replace: false });
    expect(linkedState(actions)!.email).toBe('robin@work.example');
    await actions.unlink();

    server.script('logIn', (real) => {
      const answer = real();
      return { ...answer, body: { ...(answer.body as object), email: null } };
    });
    await actions.logIn(creds, { replace: true });
    expect(linkedState(actions)!.email).toBeNull();
  });

  it('reads only a denied 401 as a wrong password: any other is the service failing', async () => {
    const { actions, server } = await setup();
    server.script(
      'logIn',
      answers(401, { error: 'unauthorized' }),
      answers(401),
      answers(401, { error: 'denied' }),
    );
    await expect(actions.logIn(creds, { replace: true })).rejects.toMatchObject({
      code: 'unavailable',
    });
    await expect(actions.logIn(creds, { replace: true })).rejects.toMatchObject({
      code: 'unavailable',
    });
    await expect(actions.logIn(creds, { replace: true })).rejects.toMatchObject({
      code: 'wrong',
      message: "That username and password don't match.",
    });
  });

  it('a copy from a newer Funcial links nothing and changes nothing', async () => {
    const { actions, server, store } = await setup();
    const newer = { ...snapshotWith('x'), schemaVersion: 999 };
    await server.seed({ username: 'robin', password: ME.password, snapshot: newer });
    await expect(actions.logIn(creds, { replace: false })).rejects.toMatchObject({
      code: 'too-new',
    });
    expect(linkedState(actions)).toBeNull();
    expect(store.getState().data.tables.expense).toEqual([]);
  });

  it('answers a wrong password and an unknown user the same way', async () => {
    const { actions, server, store } = await setup();
    await store.getState().put('expense', lunch('mine'));
    await server.seed({ username: 'robin', password: ME.password, snapshot: snapshotWith('x') });
    const wrong = await actions
      .logIn({ ...creds, password: 'not the password' }, { replace: true })
      .catch((e: unknown) => e as AccountError);
    const unknown = await actions
      .logIn({ username: 'nobody', password: ME.password }, { replace: true })
      .catch((e: unknown) => e as AccountError);
    expect(wrong).toMatchObject({ code: 'wrong' });
    expect(unknown).toMatchObject({ code: 'wrong' });
    expect((wrong as AccountError).message).toBe((unknown as AccountError).message);
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['mine']);
    expect(linkedState(actions)).toBeNull();
  });

  it('says to wait when rate limited, and busy when the account keeps changing', async () => {
    const { actions, server } = await setup();
    server.script(
      'logIn',
      answers(429, { error: 'too many attempts' }, 120),
      answers(409, { error: 'busy' }),
    );
    await expect(actions.logIn(creds, { replace: true })).rejects.toMatchObject({
      code: 'limited',
      message: 'Too many tries. Try again in 2 minutes.',
    });
    await expect(actions.logIn(creds, { replace: true })).rejects.toMatchObject({ code: 'busy' });
    expect(linkedState(actions)).toBeNull();
  });

  it('at the welcome screen gives the new install its vault only once the account answers', async () => {
    const { deps } = realStoreDeps();
    const store = createAppStore(deps);
    await store.getState().boot();
    expect(store.getState().phase).toBe('welcome');
    const server = fakeAccountApi();
    const actions = createAccountActions(store, server.api, platform, { kdf: FAST });
    actions.start();
    await server.seed({ username: 'robin', password: ME.password, snapshot: snapshotWith('a') });

    await expect(
      actions.logIn({ ...creds, password: 'wrong wrong wrong' }, { replace: false }),
    ).rejects.toMatchObject({ code: 'wrong' });
    expect(store.getState().phase).toBe('welcome');

    await expect(actions.logIn(creds, { replace: false })).resolves.toBe('done');
    expect(store.getState().phase).toBe('unlocked');
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['a']);
    expect(linkedState(actions)).toMatchObject({ username: 'robin', status: 'linked' });
    await loaded(actions);
    expect(linkedState(actions)).toMatchObject({ username: 'robin' });
  });

  it('links nothing when the restore fails: the copy is not on the phone, so nothing may go up', async () => {
    const { actions, server, store } = await setup();
    await store.getState().put('expense', lunch('mine'));
    await server.seed({
      username: 'robin',
      password: ME.password,
      snapshot: snapshotWith('theirs'),
    });
    store.setState({ restoreSnapshot: vi.fn().mockRejectedValue(new Error('disk full')) });
    await expect(actions.logIn(creds, { replace: true })).rejects.toThrow('disk full');
    expect(linkedState(actions)).toBeNull();
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['mine']);
    expect(puts(server)).toEqual([]);
  });

  it('a sign-up that finishes after the app locked links nothing', async () => {
    const { actions, server, store } = await setup();
    await store.getState().setSecret('2468', 'pin');
    let answer = () => {};
    server.script(
      'signUp',
      (real) =>
        new Promise((resolve) => {
          answer = () => resolve(real());
        }),
    );
    const signing = actions.signUp(ME);
    signing.catch(() => {});
    await vi.waitFor(() => expect(server.sent('signUp')).toHaveLength(1));
    store.getState().lock();
    answer();
    await expect(signing).rejects.toMatchObject({ code: 'locked' });
    expect(actions.view.getState()).toEqual({ loaded: false, state: null });
  });

  it('refuses while this phone is linked', async () => {
    const { actions, server } = await setup();
    await actions.signUp(ME);
    await server.seed({ username: 'other', password: ME.password });
    await expect(
      actions.logIn({ username: 'other', password: ME.password }, { replace: true }),
    ).rejects.toMatchObject({ code: 'linked' });
  });
});

describe('another phone logs in', () => {
  async function linked() {
    const t = await setup();
    await t.actions.signUp(ME);
    clock();
    return t;
  }
  const takeOver = (server: ReturnType<typeof fakeAccountApi>) =>
    server.api.logIn({ username: 'robin', authKey: server.accounts.get('robin')!.authKey });

  it('stops this phone saving, and leaves its data alone', async () => {
    const { actions, server, store } = await linked();
    await takeOver(server);
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await vi.waitFor(() => expect(linkedState(actions)!.status).toBe('moved'));
    expect(puts(server)).toHaveLength(2);

    await store.getState().put('expense', lunch('e2'));
    pause();
    goOnline();
    await elapse(10 * 60_000);
    await actions.saveNow();
    expect(puts(server)).toHaveLength(2);
    expect(
      store
        .getState()
        .data.tables.expense.map((e) => e.id)
        .sort(),
    ).toEqual(['e1', 'e2']);
  });

  it('is remembered after a restart', async () => {
    const { actions, server, store, deps } = await linked();
    await takeOver(server);
    await store.getState().put('expense', lunch('e1'));
    pause();
    await vi.waitFor(() => expect(linkedState(actions)!.status).toBe('moved'));
    await vi.waitFor(async () => {
      const again = createAppStore(deps);
      await again.getState().boot();
      const next = await follow(again, server);
      expect(linkedState(next.actions)!.status).toBe('moved');
    });
  });

  it('is not a takeover when the service says the copy is stale: this phone re-bases and goes on', async () => {
    const { actions, server, store } = await linked();
    server.accounts.get('robin')!.copy!.version = 5;
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 3);
    expect(puts(server).map((p) => p.baseVersion)).toEqual([0, 1, 5]);
    await vi.waitFor(() =>
      expect(linkedState(actions)).toMatchObject({ status: 'linked', version: 6, dirty: false }),
    );
  });

  it('is not a takeover when the service is busy: it tries again in a moment', async () => {
    const { actions, server, store } = await linked();
    server.script('putCopy', answers(409, { error: 'busy', version: 1 }));
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 2);
    // Polling for the answer moves the fake clock a little, so the edges are given some room.
    await elapse(4_000);
    expect(puts(server)).toHaveLength(2);
    await elapse(2_000);
    await waitForPuts(server, 3);
    await vi.waitFor(() =>
      expect(linkedState(actions)).toMatchObject({ status: 'linked', version: 2 }),
    );
  });

  it('ignores a refusal meant for a token this phone has since replaced', async () => {
    const { actions, server, store } = await linked();
    let refuse = () => {};
    server.script(
      'putCopy',
      () =>
        new Promise((resolve) => {
          refuse = () => resolve({ status: 401, body: { error: 'moved' }, retryAfter: null });
        }),
    );
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 2);

    // Meanwhile the phone logs in again, which replaces the token.
    await actions.unlink();
    await actions.logIn({ username: 'robin', password: ME.password }, { replace: true });
    const fresh = linkedState(actions)!.deviceToken;
    refuse();
    await actions.saveNow();
    expect(linkedState(actions)).toMatchObject({ status: 'linked', deviceToken: fresh });
  });

  it('backs off no further than 60 s', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map((n) => backoff(BUSY_RETRY, n))).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000,
    ]);
  });
});

describe('retries', () => {
  async function linked() {
    const t = await setup();
    await t.actions.signUp(ME);
    clock();
    return t;
  }

  it('tries again when the phone is back online, not on a timer', async () => {
    const { server, store } = await linked();
    server.script('putCopy', unreachable);
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 2);
    await elapse(60 * 60_000);
    expect(puts(server)).toHaveLength(2);
    goOnline();
    await waitForPuts(server, 3);
  });

  it('tries again when the app goes to the background', async () => {
    const { actions, server, store } = await linked();
    server.script('putCopy', unreachable);
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 2);
    pause();
    await waitForPuts(server, 3);
    await vi.waitFor(() => expect(linkedState(actions)).toMatchObject({ dirty: false }));
  });

  it('says nothing for a lost connection: the data is only waiting', async () => {
    const { server, store } = await linked();
    server.script('putCopy', unreachable);
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 2);
    expect(toastStore.getState().toasts).toEqual([]);
  });

  it('says the copy is not saving once while the service is down, not on every try', async () => {
    const { server, store } = await linked();
    const shown: string[] = [];
    toastStore.subscribe((s, prev) => {
      for (const t of s.toasts) if (!prev.toasts.includes(t)) shown.push(t.message);
    });
    server.script(
      'putCopy',
      answers(503, { error: 'not configured' }),
      answers(503, { error: 'unavailable' }),
      answers(502, { error: 'upstream' }),
    );
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 2);
    await elapse(30_000);
    await waitForPuts(server, 3);
    await elapse(60_000);
    await waitForPuts(server, 4);
    await elapse(120_000);
    await waitForPuts(server, 5);
    expect(shown).toEqual([SAVE_NOTICE]);
    // The data never moved.
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['e1']);

    // Once a copy is saved again the next trouble is worth saying.
    server.script('putCopy', answers(503));
    await store.getState().put('expense', lunch('e2'));
    await elapse(30_000);
    await waitForPuts(server, 6);
    await vi.waitFor(() => expect(shown).toEqual([SAVE_NOTICE, SAVE_NOTICE]));
  });

  it('waits out a rate limit as long as it says', async () => {
    const { server, store } = await linked();
    server.script('putCopy', answers(429, { error: 'too many attempts' }, 90));
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 2);
    await elapse(88_000);
    expect(puts(server)).toHaveLength(2);
    await elapse(3_000);
    await waitForPuts(server, 3);
  });

  it('does not retry a copy the service refuses as too large, but says so once', async () => {
    const { server, store } = await linked();
    server.script('putCopy', answers(413, { error: 'too large' }));
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 2);
    await elapse(60 * 60_000);
    expect(puts(server)).toHaveLength(2);
  });
});

describe('a copy stays clean', () => {
  it('holds the data and nothing about the account, in an upload or a backup', async () => {
    const { actions, server, store } = await setup();
    await store.getState().put('profile', makeProfile({ name: 'Robin' }));
    await store.getState().put('expense', lunch('e1'));
    await actions.signUp(ME);
    const state = linkedState(actions)!;

    const body = puts(server)[0]!;
    const text = JSON.stringify(body);
    for (const secret of [
      state.dek,
      state.deviceToken,
      'funancial.account',
      'robin',
      'example.com',
    ]) {
      expect(text).not.toContain(secret);
    }
    // Opened with the account's key, it is the snapshot: the same tables, no more.
    const copy = await opened(body, state.dek);
    expect(copy).toEqual(store.getState().data);
    expect(JSON.stringify(copy)).not.toMatch(/funancial\.account|deviceToken/);

    const { text: backup } = await store.getState().createBackup('backup passphrase');
    for (const secret of [state.dek, state.deviceToken, 'funancial.account']) {
      expect(backup).not.toContain(secret);
    }
    const restored = await readBackup(backup, 'backup passphrase');
    expect(JSON.stringify(restored)).not.toContain(state.dek);
    expect(store.getState().exportPlain().text).not.toContain(state.dek);
  });

  it('keeps a .funbak restore working, and uploads what it restored', async () => {
    const { actions, server, store } = await setup();
    await actions.signUp(ME);
    const { text } = await store.getState().createBackup('backup passphrase');
    clock();
    await store.getState().put('expense', lunch('later'));
    await store.getState().restoreBackup(text, 'backup passphrase');
    expect(store.getState().data.tables.expense).toEqual([]);
    pause();
    await waitForPuts(server, 2);
    expect((await opened(puts(server)[1]!, linkedState(actions)!.dek)).tables.expense).toEqual([]);
  });
});

describe('a restart or a lock', () => {
  it('does not forget changes that were waiting to upload', async () => {
    const { actions, server, store, deps, stop } = await setup();
    await actions.signUp(ME);
    clock();
    await store.getState().put('expense', lunch('e1'));
    stop();
    expect(puts(server)).toHaveLength(1);

    const again = createAppStore(deps);
    await again.getState().boot();
    const next = createAccountActions(again, server.api, platform, { kdf: FAST });
    next.start();
    await waitForPuts(server, 2);
    expect(linkedState(next)!.dirty).toBe(false);
  });

  it('holds the upload while locked and sends it after the unlock', async () => {
    const { actions, server, store } = await setup();
    await store.getState().setSecret('2468', 'pin');
    await actions.signUp(ME);
    clock();
    await store.getState().put('expense', lunch('e1'));
    store.getState().lock();
    expect(actions.view.getState()).toEqual({ loaded: false, state: null });
    await elapse(10 * 60_000);
    expect(puts(server)).toHaveLength(1);

    vi.useRealTimers();
    await store.getState().unlock('2468');
    await waitForPuts(server, 2);
    expect(
      (await opened(puts(server)[1]!, linkedState(actions)!.dek)).tables.expense.map((e) => e.id),
    ).toEqual(['e1']);
  });
});

describe('changing the password', () => {
  async function linked() {
    const t = await setup();
    await t.actions.signUp(ME);
    return t;
  }

  it('re-locks the same data key with the new password and moves the service on', async () => {
    const { actions, server } = await linked();
    const next = 'another long password';
    await actions.changePassword(ME.password, next);

    const [body] = server.sent('changePassword') as Array<{
      oldAuthKey: string;
      newAuthKey: string;
      newWrappedPw: { iv: string; ciphertext: string };
    }>;
    const { kek, authKey } = await deriveAccountKeys('robin', next, FAST);
    expect(body!.newAuthKey).toBe(authKey);
    expect((await unwrapDek(body!.newWrappedPw, kek)).raw).toBe(linkedState(actions)!.dek);
    expect(JSON.stringify(body)).not.toContain(next);

    // The new password logs in on another phone, and the old one no longer does.
    const other = await freshRealStore();
    const phone2 = await follow(other.store, server);
    await expect(
      phone2.actions.logIn({ username: 'robin', password: ME.password }, { replace: false }),
    ).rejects.toMatchObject({ code: 'wrong' });
    await expect(
      phone2.actions.logIn({ username: 'robin', password: next }, { replace: false }),
    ).resolves.toBe('done');
    expect(linkedState(phone2.actions)!.dek).toBe(linkedState(actions)!.dek);
  });

  it('keeps everything when the old password is wrong', async () => {
    const { actions, server } = await linked();
    const before = { ...server.accounts.get('robin')! };
    await expect(
      actions.changePassword('not the password', 'another long password'),
    ).rejects.toMatchObject({ code: 'wrong', message: "That isn't your current password." });
    expect(server.accounts.get('robin')).toEqual(before);
    expect(linkedState(actions)!.status).toBe('linked');
  });

  it('wants a new password of at least 10 characters, without asking the service', async () => {
    const { actions, server } = await linked();
    await expect(actions.changePassword(ME.password, 'short')).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(server.sent('changePassword')).toEqual([]);
  });

  it('needs an account', async () => {
    const { actions } = await setup();
    await expect(actions.changePassword('x', 'another long password')).rejects.toMatchObject({
      code: 'unlinked',
    });
  });
});

describe('turning the account off', () => {
  it('deletes the copy, forgets the link and stops uploading, keeping the data', async () => {
    const { actions, server, store, deps } = await setup();
    await store.getState().put('expense', lunch('e1'));
    await actions.signUp(ME);
    const token = linkedState(actions)!.deviceToken;
    await expect(actions.deleteAccount()).resolves.toBe('deleted');

    expect(server.sent('deleteAccount')).toHaveLength(1);
    expect(server.calls.find((c) => c.route === 'deleteAccount')!.token).toBe(token);
    expect(server.accounts.has('robin')).toBe(false);
    expect(linkedState(actions)).toBeNull();
    const backend = await deps.storage.open('real');
    expect(await backend.meta.get('funancial.account')).toBeUndefined();
    await backend.close();

    clock();
    await store.getState().put('expense', lunch('e2'));
    pause();
    await elapse(10 * 60_000);
    await actions.saveNow();
    expect(puts(server)).toHaveLength(1);
    expect(
      store
        .getState()
        .data.tables.expense.map((e) => e.id)
        .sort(),
    ).toEqual(['e1', 'e2']);
  });

  it('keeps the link when the service cannot be reached: the copy is still there', async () => {
    const { actions, server } = await setup();
    await actions.signUp(ME);
    server.script('deleteAccount', unreachable);
    await expect(actions.deleteAccount()).rejects.toMatchObject({ code: 'offline' });
    expect(linkedState(actions)!.status).toBe('linked');
    expect(server.accounts.has('robin')).toBe(true);
  });

  it('tells a phone that has moved nothing was deleted, and still forgets its link', async () => {
    const { actions, server } = await setup();
    await actions.signUp(ME);
    await server.api.logIn({ username: 'robin', authKey: server.accounts.get('robin')!.authKey });
    await expect(actions.deleteAccount()).resolves.toBe('moved');
    expect(linkedState(actions)).toBeNull();
    expect(server.accounts.has('robin')).toBe(true);
  });

  it('keeps using the phone without an account, leaving the service alone', async () => {
    const { actions, server } = await setup();
    await actions.signUp(ME);
    const calls = server.calls.length;
    await actions.unlink();
    expect(linkedState(actions)).toBeNull();
    expect(server.calls).toHaveLength(calls);
  });
});

/** A phone that is linked, with the clock in the test's hands. */
async function linkedPhone({ pin = false } = {}) {
  const t = await setup();
  if (pin) await t.store.getState().setSecret('2468', 'pin');
  await t.actions.signUp(ME);
  clock();
  return t;
}

describe('an upload being prepared when the data closes under it', () => {
  async function preparing() {
    const t = await linkedPhone({ pin: true });
    await t.store.getState().put('expense', lunch('e1'));
    return t;
  }
  /** Starts the upload and holds it at its first step, with the data still open. */
  async function started(fail?: Error) {
    const release = holdNextImport(fail);
    await elapse(30_000);
    return release;
  }

  it('is never sent once the app has locked: that is an empty snapshot over the copy', async () => {
    const { server, store } = await preparing();
    const release = await started();
    store.getState().lock();
    release();
    await quiet();
    expect(puts(server)).toHaveLength(1);
  });

  it('is never sent once the app has moved to the demo: that is demo money over the copy', async () => {
    const { server, store } = await preparing();
    const release = await started();
    await store.getState().startDemo();
    release();
    await quiet();
    expect(puts(server)).toHaveLength(1);
  });

  it('is never sent once everything was deleted', async () => {
    const { server, store } = await preparing();
    const release = await started();
    await store.getState().deleteAllData();
    release();
    await quiet();
    expect(puts(server)).toHaveLength(1);
    expect(store.getState().phase).toBe('welcome');
  });

  it('says nothing when it fails after the app locked', async () => {
    const { server, store } = await preparing();
    const shown = collectToasts();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const release = await started(new Error('boom'));
    store.getState().lock();
    release();
    await quiet();
    expect(puts(server)).toHaveLength(1);
    expect(shown).toEqual([]);
  });

  it('still goes up once the data is open again and has what it should', async () => {
    const { actions, server, store } = await preparing();
    const release = await started();
    store.getState().lock();
    release();
    await quiet();
    vi.useRealTimers();
    await store.getState().unlock('2468');
    await waitForPuts(server, 2);
    const copy = await opened(puts(server)[1]!, linkedState(actions)!.dek);
    expect(copy.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('a save whose answer was lost', () => {
  it('is found by the next try, which re-bases on it and loses nothing', async () => {
    const { actions, server, store } = await linkedPhone();
    server.script('putCopy', lostReply);
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 2);
    // The service has it; the phone was never told.
    expect(server.accounts.get('robin')!.copy!.version).toBe(2);
    expect(linkedState(actions)).toMatchObject({ version: 1, dirty: true, status: 'linked' });

    goOnline();
    await waitForPuts(server, 4);
    expect(puts(server).map((p) => p.baseVersion)).toEqual([0, 1, 1, 2]);
    await vi.waitFor(() =>
      expect(linkedState(actions)).toMatchObject({ version: 3, dirty: false, status: 'linked' }),
    );
    const stored = server.accounts.get('robin')!.copy!;
    const copy = await opened({ ...stored, baseVersion: 0 }, linkedState(actions)!.dek);
    expect(copy.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('the two 401s', () => {
  it('reads a refusal of the shared token as the service failing: it stays linked, says so once, tries again', async () => {
    const { actions, server, store } = await linkedPhone();
    const shown = collectToasts();
    server.script('putCopy', answers(401, { error: 'unauthorized' }), answers(401));
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 2);
    expect(linkedState(actions)!.status).toBe('linked');
    await elapse(36_000);
    await waitForPuts(server, 3);
    expect(linkedState(actions)!.status).toBe('linked');
    await elapse(70_000);
    await waitForPuts(server, 4);
    await vi.waitFor(() =>
      expect(linkedState(actions)).toMatchObject({ status: 'linked', version: 2, dirty: false }),
    );
    expect(shown).toEqual([SAVE_NOTICE]);
  });

  it('reads a 401 that says moved as a takeover', async () => {
    const { actions, server, store } = await linkedPhone();
    server.script('putCopy', answers(401, { error: 'moved' }));
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await vi.waitFor(() => expect(linkedState(actions)!.status).toBe('moved'));
  });

  it('turning the account off is done only by a 204 or a moved: a refused shared token keeps the link', async () => {
    const { actions, server } = await linkedPhone();
    server.script('deleteAccount', answers(401, { error: 'unauthorized' }));
    await expect(actions.deleteAccount()).rejects.toMatchObject({ code: 'unavailable' });
    expect(linkedState(actions)!.status).toBe('linked');
    expect(server.accounts.has('robin')).toBe(true);
  });

  it('a password change says moved, denied and a failing service three ways', async () => {
    const { actions, server } = await linkedPhone();
    const next = 'another long password';
    server.script(
      'changePassword',
      answers(401, { error: 'denied' }),
      answers(401, { error: 'unauthorized' }),
      answers(401, { error: 'moved' }),
    );
    await expect(actions.changePassword(ME.password, next)).rejects.toMatchObject({
      code: 'wrong',
      message: "That isn't your current password.",
    });
    await expect(actions.changePassword(ME.password, next)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(linkedState(actions)!.status).toBe('linked');
    await expect(actions.changePassword(ME.password, next)).rejects.toMatchObject({
      code: 'moved',
    });
    expect(linkedState(actions)!.status).toBe('moved');
  });

  it('a sign-up that finds its name taken after a lost answer reads the claim log-in the same way', async () => {
    const { actions, server } = await setup();
    server.script('signUp', unreachable);
    await server.seed({ username: 'robin', password: 'someone elses password' });
    server.script('logIn', answers(401, { error: 'unauthorized' }));
    await expect(actions.signUp(ME)).rejects.toMatchObject({ code: 'unavailable' });
    expect(linkedState(actions)).toBeNull();
  });
});

describe('smaller things', () => {
  it('waits longer and longer when the service keeps saying stale', async () => {
    const { server, store } = await linkedPhone();
    server.script(
      'putCopy',
      ...Array.from({ length: 12 }, (_, i) => answers(409, { error: 'stale', version: 1 + i })),
    );
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 4); // three in a row, then it waits
    await elapse(25_000);
    expect(puts(server)).toHaveLength(4);
    await elapse(10_000);
    await waitForPuts(server, 7);
    await elapse(50_000);
    expect(puts(server)).toHaveLength(7);
    await elapse(20_000);
    await waitForPuts(server, 10);
  });

  it('stops trying a copy that is too big until the data changes', async () => {
    const { actions, server, store } = await linkedPhone();
    server.script('putCopy', answers(413, { error: 'too large' }));
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await waitForPuts(server, 2);
    await vi.waitFor(() =>
      expect(linkedState(actions)).toMatchObject({ tooBig: true, dirty: true, status: 'linked' }),
    );
    pause();
    goOnline();
    await elapse(60 * 60_000);
    await actions.saveNow();
    expect(puts(server)).toHaveLength(2);

    // Smaller data is worth a try.
    await store.getState().remove('expense', 'e1');
    expect(linkedState(actions)!.tooBig).toBe(false);
    await elapse(30_000);
    await waitForPuts(server, 3);
    await vi.waitFor(() =>
      expect(linkedState(actions)).toMatchObject({ tooBig: false, dirty: false }),
    );
  });

  it('keeps that it was too big across a restart', async () => {
    const { actions, server, store, deps } = await linkedPhone();
    server.script('putCopy', answers(413, { error: 'too large' }));
    await store.getState().put('expense', lunch('e1'));
    await elapse(30_000);
    await vi.waitFor(() => expect(linkedState(actions)!.tooBig).toBe(true));
    vi.useRealTimers();
    await vi.waitFor(async () => {
      const again = createAppStore(deps);
      await again.getState().boot();
      expect(linkedState((await follow(again, server)).actions)!.tooBig).toBe(true);
    });
  });

  it('does not let a save timer fire while the account is being deleted', async () => {
    const { actions, server, store } = await linkedPhone();
    await store.getState().put('expense', lunch('e1'));
    let answer = () => {};
    server.script(
      'deleteAccount',
      (real) =>
        new Promise((resolve) => {
          answer = () => resolve(real());
        }),
    );
    const deleting = actions.deleteAccount();
    await vi.waitFor(() => expect(server.sent('deleteAccount')).toHaveLength(1));
    await elapse(60_000);
    expect(puts(server)).toHaveLength(1);
    answer();
    await deleting;
    expect(linkedState(actions)).toBeNull();
  });
});

describe('forgot password', () => {
  it('asks the service to email a link, with what was typed and nothing else', async () => {
    const { actions, server } = await setup();
    await expect(actions.forgot('  Robin@Example.com ')).resolves.toBeUndefined();
    expect(server.sent('forgot')).toEqual([{ who: 'Robin@Example.com' }]);
  });

  it('works from the welcome screen, before there is any vault', async () => {
    const { deps } = realStoreDeps();
    const store = createAppStore(deps);
    await store.getState().boot();
    expect(store.getState().phase).toBe('welcome');
    const server = fakeAccountApi();
    const actions = createAccountActions(store, server.api, platform, { kdf: FAST });
    await expect(actions.forgot('robin')).resolves.toBeUndefined();
    expect(server.sent('forgot')).toEqual([{ who: 'robin' }]);
  });

  it('reads a 400 as an answer like any other: the screen says the same line', async () => {
    const { actions, server } = await setup();
    server.script('forgot', answers(400, { error: 'invalid' }));
    await expect(actions.forgot('robin')).resolves.toBeUndefined();
  });

  it('tells a rate limit with its wait, and nothing about the account', async () => {
    const { actions, server } = await setup();
    server.script('forgot', answers(429, { error: 'too many attempts' }, 1800));
    await expect(actions.forgot('robin')).rejects.toMatchObject({
      code: 'limited',
      message: 'Too many tries. Try again in 30 minutes.',
    });
  });

  it('says the service is not answering when it is not configured or down', async () => {
    const { actions, server } = await setup();
    server.script('forgot', answers(503, { error: 'not configured' }));
    await expect(actions.forgot('robin')).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('says offline when nothing answers', async () => {
    const { actions, server } = await setup();
    server.script('forgot', unreachable);
    await expect(actions.forgot('robin')).rejects.toMatchObject({ code: 'offline' });
  });

  it('judges what was typed the way the service does, before asking it', () => {
    expect(forgotProblem('robin')).toBeNull();
    expect(forgotProblem(' Robin.Smith ')).toBeNull();
    expect(forgotProblem('robin@example.com')).toBeNull();
    expect(forgotProblem('')).toBe('Enter your username or your email address.');
    expect(forgotProblem('ro')).toBe('Enter your username or your email address.');
    expect(forgotProblem('robin@')).toBe('Enter your username or your email address.');
  });
});
