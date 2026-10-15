import { describe, expect, it, vi } from 'vitest';
import { InvalidBackupError } from '@/data/backup';
import { dexieStorage } from '@/data/db';
import { browserKeyring } from '@/data/keyring';
import { WrongSecretError } from '@/data/keys';
import type { SyncMessage } from '@/lib/broadcast';
import type { SafeStorage } from '@/lib/safeStorage';
import { buildDemoSnapshot } from '@/data/demoSeed';
import { makeExpense, makeSubscription } from '@/test/fixtures';
import { memoryStorage } from '@/test/memoryStorage';
import { createAppStore, type AppDeps } from './appStore';

function memorySafeStorage(): SafeStorage {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => (map.set(k, v), true),
    remove: (k) => void map.delete(k),
  };
}

function testDeps(overrides: Partial<AppDeps> = {}) {
  const prefix = `test-${crypto.randomUUID()}`;
  let clock = Date.parse('2026-10-14T10:00:00.000Z');
  const posts: SyncMessage[] = [];
  const deps: AppDeps = {
    kdfIterations: 1_000,
    today: () => '2026-10-14',
    now: () => clock,
    safeStorage: memorySafeStorage(),
    channel: { post: (m) => void posts.push(m) },
    storageStatus: async () => true,
    requestPersistence: async () => true,
    storage: dexieStorage(prefix),
    keyring: browserKeyring,
    biometric: null,
    ...overrides,
  };
  return { deps, posts, advance: (ms: number) => void (clock += ms) };
}

async function freshStore() {
  const t = testDeps();
  const store = createAppStore(t.deps);
  await store.getState().boot();
  await store.getState().startFresh();
  return { ...t, store };
}

async function reboot(deps: AppDeps) {
  const store = createAppStore(deps);
  await store.getState().boot();
  return store;
}

describe('first run', () => {
  it('boots to welcome, then startFresh unlocks with default settings', async () => {
    const { deps } = testDeps();
    const store = createAppStore(deps);
    await store.getState().boot();
    expect(store.getState()).toMatchObject({ phase: 'welcome', lockMode: null, persisted: true });

    await store.getState().startFresh();
    const s = store.getState();
    expect(s).toMatchObject({ phase: 'unlocked', lockMode: 'device', namespace: 'real' });
    expect(s.data.tables.settings).toEqual([
      {
        id: 'settings',
        createdAt: '2026-10-14T10:00:00.000Z',
        updatedAt: '2026-10-14T10:00:00.000Z',
        weekStartsOn: 1,
        warningTone: 'motivational',
        autoLockMinutes: 5,
        lastBackupAt: null,
      },
    ]);
  });

  it('shows the storage-unavailable screen when the database cannot open', async () => {
    const { deps } = testDeps({
      storage: { open: () => Promise.reject(new Error('blocked')), remove: async () => {} },
    });
    const store = createAppStore(deps);
    await store.getState().boot();
    expect(store.getState().phase).toBe('unavailable');
  });
});

describe('device mode', () => {
  it('reopens without a prompt and keeps data', async () => {
    const { deps, store } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'e1' }));
    const again = await reboot(deps);
    expect(again.getState().phase).toBe('unlocked');
    expect(again.getState().data.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });

  it('cannot be locked, since there is nothing to unlock with', async () => {
    const { store } = await freshStore();
    store.getState().lock();
    expect(store.getState().phase).toBe('unlocked');
  });
});

describe('records', () => {
  it('put updates in place, remove deletes, both persist', async () => {
    const { deps, store } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'e1', note: 'first' }));
    await store.getState().put('expense', makeExpense({ id: 'e1', note: 'edited' }));
    await store.getState().put('expense', makeExpense({ id: 'e2' }));
    await store.getState().remove('expense', 'e2');
    expect(store.getState().data.tables.expense.map((e) => [e.id, e.note])).toEqual([
      ['e1', 'edited'],
    ]);
    const again = await reboot(deps);
    expect(again.getState().data.tables.expense.map((e) => [e.id, e.note])).toEqual([
      ['e1', 'edited'],
    ]);
  });
});

describe('PIN lock', () => {
  it('locks on reboot; wrong PIN is refused; right PIN opens the data', async () => {
    const { deps, store, posts } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'e1' }));
    await store.getState().setSecret('2468', 'pin');
    expect(store.getState().lockMode).toBe('pin');
    expect(posts).toContainEqual({ type: 'reload', reason: 'secret' });

    const again = await reboot(deps);
    expect(again.getState()).toMatchObject({ phase: 'locked', lockMode: 'pin' });
    expect(again.getState().data.tables.expense).toEqual([]);
    expect(await again.getState().unlock('1357')).toBe('wrong');
    expect(again.getState().phase).toBe('locked');
    expect(await again.getState().unlock('2468')).toBe('ok');
    expect(again.getState().data.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });

  it('lock() forgets the data until unlocked again', async () => {
    const { store } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'e1' }));
    await store.getState().setSecret('2468', 'pin');
    store.getState().lock();
    expect(store.getState().phase).toBe('locked');
    expect(store.getState().data.tables.expense).toEqual([]);
    await expect(store.getState().put('expense', makeExpense())).rejects.toThrow();
    expect(await store.getState().unlock('2468')).toBe('ok');
    expect(store.getState().data.tables.expense).toHaveLength(1);
  });

  it('throttles for 30 seconds after 5 wrong attempts', async () => {
    const { deps, store, advance } = await freshStore();
    await store.getState().setSecret('2468', 'pin');
    const again = await reboot(deps);
    for (let i = 0; i < 4; i++) expect(await again.getState().unlock('0000')).toBe('wrong');
    expect(again.getState().lockedUntil).toBeNull();
    expect(await again.getState().unlock('0000')).toBe('wrong');
    expect(again.getState().lockedUntil).toBe(Date.parse('2026-10-14T10:00:30.000Z'));

    expect(await again.getState().unlock('2468')).toBe('throttled');
    advance(29_999);
    expect(await again.getState().unlock('2468')).toBe('throttled');
    advance(2);
    expect(await again.getState().unlock('2468')).toBe('ok');
    expect(again.getState()).toMatchObject({ failedAttempts: 0, lockedUntil: null });
  });

  it('verifies the current secret without changing anything', async () => {
    const { store } = await freshStore();
    await store.getState().setSecret('correct horse', 'passphrase');
    expect(await store.getState().verifySecret('wrong horse')).toBe(false);
    expect(await store.getState().verifySecret('correct horse')).toBe(true);
    expect(store.getState().phase).toBe('unlocked');
  });

  it('clearSecret returns to device mode', async () => {
    const { deps, store } = await freshStore();
    await store.getState().setSecret('2468', 'pin');
    await store.getState().clearSecret();
    expect((await reboot(deps)).getState()).toMatchObject({
      phase: 'unlocked',
      lockMode: 'device',
    });
  });

  it('rejects an invalid secret', async () => {
    const { store } = await freshStore();
    await expect(store.getState().setSecret('12', 'pin')).rejects.toThrow('Use 4 to 8 digits.');
    expect(store.getState().lockMode).toBe('device');
  });
});

describe('demo mode', () => {
  it('runs on separate data and leaving it keeps real data untouched', async () => {
    const { deps, store, posts } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'mine' }));

    await store.getState().startDemo();
    expect(store.getState()).toMatchObject({
      namespace: 'demo',
      phase: 'unlocked',
      lockMode: 'device',
    });
    expect(store.getState().data.tables.expense.length).toBeGreaterThan(100);
    expect(deps.safeStorage.get('funancial.namespace')).toBe('demo');

    await store.getState().exitDemo();
    expect(store.getState()).toMatchObject({ namespace: 'real', phase: 'unlocked' });
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['mine']);
    expect(posts.filter((m) => m.reason === 'namespace')).toHaveLength(2);
  });

  it('refuses to lock demo data', async () => {
    const { store } = await freshStore();
    await store.getState().startDemo();
    await expect(store.getState().setSecret('2468', 'pin')).rejects.toThrow();
    await expect(store.getState().clearSecret()).rejects.toThrow();
  });
});

describe('backup and restore', () => {
  it('creates a dated backup without yet recording it, since nothing is saved', async () => {
    const { store } = await freshStore();
    const { fileName, text } = await store.getState().createBackup('correct horse');
    expect(fileName).toMatch(/^funancial-backup-\d{4}-\d{2}-\d{2}\.funbak$/);
    expect(JSON.parse(text).format).toBe('funancial-backup');
    expect(store.getState().data.tables.settings[0]?.lastBackupAt).toBeNull();
  });

  it('records when the backup was saved, at that moment, and keeps it', async () => {
    const { deps, store, advance } = await freshStore();
    await store.getState().createBackup('correct horse');
    advance(90_000);

    await store.getState().markBackedUp();

    const settings = store.getState().data.tables.settings[0];
    expect(settings?.lastBackupAt).toBe('2026-10-14T10:01:30.000Z');
    expect(settings?.updatedAt).toBe('2026-10-14T10:01:30.000Z');
    expect((await reboot(deps)).getState().data.tables.settings[0]?.lastBackupAt).toBe(
      '2026-10-14T10:01:30.000Z',
    );
  });

  it('restores a backup, replacing data, and tells other tabs', async () => {
    const { deps, store, posts } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'e1' }));
    const { text } = await store.getState().createBackup('correct horse');
    await store.getState().remove('expense', 'e1');
    await store.getState().put('expense', makeExpense({ id: 'e2' }));

    await store.getState().restoreBackup(text, 'correct horse');
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['e1']);
    expect(posts).toContainEqual({ type: 'reload', reason: 'restore' });
    expect((await reboot(deps)).getState().data.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });

  it('leaves data untouched when a restore fails', async () => {
    const { deps, store, posts } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'keep' }));
    const { text } = await store.getState().createBackup('correct horse');
    const before = store.getState().data;

    await expect(store.getState().restoreBackup('garbage', 'correct horse')).rejects.toBeInstanceOf(
      InvalidBackupError,
    );
    await expect(store.getState().restoreBackup(text, 'wrong horse')).rejects.toBeInstanceOf(
      WrongSecretError,
    );
    expect(store.getState().data).toBe(before);
    expect(store.getState().phase).toBe('unlocked');
    expect(posts.some((m) => m.reason === 'restore')).toBe(false);
    expect((await reboot(deps)).getState().data.tables.expense.map((e) => e.id)).toEqual(['keep']);
  });

  it('exports a readable copy', async () => {
    const { store } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'e1', note: 'coffee' }));
    const { fileName, text } = store.getState().exportPlain();
    expect(fileName).toMatch(/^funancial-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(text).data.tables.expense[0].note).toBe('coffee');
  });
});

describe('delete all data', () => {
  it('wipes this device back to the welcome screen and tells other tabs', async () => {
    const { deps, store, posts } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'e1' }));
    await store.getState().deleteAllData();
    expect(store.getState()).toMatchObject({ phase: 'welcome', lockMode: null });
    expect(store.getState().data.tables.expense).toEqual([]);
    expect(posts).toContainEqual({ type: 'reload', reason: 'delete' });
    expect((await reboot(deps)).getState().phase).toBe('welcome');
  });
});

describe('review fixes', () => {
  it('a second tab starting fresh never re-keys the vault', async () => {
    const { deps, posts } = testDeps();
    const a = createAppStore(deps);
    const b = createAppStore(deps);
    await a.getState().boot();
    await b.getState().boot();

    await a.getState().startFresh();
    expect(posts).toContainEqual({ type: 'reload', reason: 'start' });
    await a.getState().put('expense', makeExpense({ id: 'from-a' }));

    await b.getState().startFresh();
    expect(b.getState().phase).toBe('unlocked');
    expect(b.getState().data.tables.expense.map((e) => e.id)).toEqual(['from-a']);

    const again = await reboot(deps);
    expect(again.getState().data.tables.expense.map((e) => e.id)).toEqual(['from-a']);
    expect(again.getState().skipped).toEqual([]);
  });

  it('keeps the unlock throttle across a reload', async () => {
    const { deps, store } = await freshStore();
    await store.getState().setSecret('2468', 'pin');
    const first = await reboot(deps);
    for (let i = 0; i < 5; i++) await first.getState().unlock('0000');

    const second = await reboot(deps);
    expect(second.getState().lockedUntil).toBe(Date.parse('2026-10-14T10:00:30.000Z'));
    expect(await second.getState().unlock('2468')).toBe('throttled');
  });

  it('counts wrong attempts across a reload', async () => {
    const { deps, store } = await freshStore();
    await store.getState().setSecret('2468', 'pin');
    const first = await reboot(deps);
    for (let i = 0; i < 3; i++) await first.getState().unlock('0000');
    const second = await reboot(deps);
    await second.getState().unlock('0000');
    expect(second.getState().lockedUntil).toBeNull();
    await second.getState().unlock('0000');
    expect(second.getState().lockedUntil).not.toBeNull();
  });

  it('ignores a second attempt while one is being checked', async () => {
    const { deps, store } = await freshStore();
    await store.getState().setSecret('2468', 'pin');
    const again = await reboot(deps);
    for (let i = 0; i < 4; i++) await again.getState().unlock('0000');

    const results = await Promise.all([
      again.getState().unlock('0000'),
      again.getState().unlock('1111'),
    ]);
    expect(results).toEqual(['wrong', 'busy']);
    expect(again.getState().lockedUntil).toBe(Date.parse('2026-10-14T10:00:30.000Z'));
    expect(again.getState().checking).toBe(false);
  });

  it('boots without waiting on a storage-permission prompt, asking only after the user starts', async () => {
    const requestPersistence = vi.fn(() => new Promise<boolean>(() => {}));
    const { deps } = testDeps({ requestPersistence, storageStatus: async () => false });
    const store = createAppStore(deps);
    await store.getState().boot();
    expect(store.getState()).toMatchObject({ phase: 'welcome', persisted: false });
    expect(requestPersistence).not.toHaveBeenCalled();
    await store.getState().startFresh();
    expect(store.getState().phase).toBe('unlocked');
    expect(requestPersistence).toHaveBeenCalledTimes(1);
  });

  it('shows storage as protected once the browser grants it', async () => {
    const { deps } = testDeps({
      requestPersistence: async () => true,
      storageStatus: async () => false,
    });
    const store = createAppStore(deps);
    await store.getState().boot();
    await store.getState().startFresh();
    await vi.waitFor(() => expect(store.getState().persisted).toBe(true));
  });

  it('a failed demo start leaves real data in the real database', async () => {
    const { deps, store } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'mine' }));
    deps.today = () => {
      throw new Error('boom');
    };
    await expect(store.getState().startDemo()).rejects.toThrow('boom');
    deps.today = () => '2026-10-14';
    expect(store.getState()).toMatchObject({ namespace: 'real', phase: 'unlocked' });
    expect(deps.safeStorage.get('funancial.namespace')).toBeNull();

    await store.getState().put('expense', makeExpense({ id: 'after' }));
    const again = await reboot(deps);
    expect(again.getState().namespace).toBe('real');
    expect(
      again
        .getState()
        .data.tables.expense.map((e) => e.id)
        .sort(),
    ).toEqual(['after', 'mine']);
  });

  it('can erase everything from the lock screen when the PIN is forgotten', async () => {
    const { deps, store } = await freshStore();
    await store.getState().setSecret('2468', 'pin');
    const locked = await reboot(deps);
    expect(locked.getState().phase).toBe('locked');
    await locked.getState().deleteAllData();
    expect(locked.getState().phase).toBe('welcome');
  });
});

describe('review fixes: demo start failing midway', () => {
  it('rolls back to real data when the demo database cannot be prepared', async () => {
    const { deps, store } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'mine' }));
    const realStorage = deps.storage;
    deps.storage = {
      open: async (ns) => {
        if (ns === 'demo') throw new Error('quota exceeded');
        return realStorage.open(ns);
      },
      remove: realStorage.remove,
    };
    await expect(store.getState().startDemo()).rejects.toThrow('quota exceeded');
    expect(store.getState()).toMatchObject({ namespace: 'real', phase: 'unlocked' });
    expect(deps.safeStorage.get('funancial.namespace')).toBeNull();
    await store.getState().put('expense', makeExpense({ id: 'after' }));
    deps.storage = realStorage;
    const again = await reboot(deps);
    expect(again.getState().namespace).toBe('real');
    expect(
      again
        .getState()
        .data.tables.expense.map((e) => e.id)
        .sort(),
    ).toEqual(['after', 'mine']);
  });
});

describe('data changes across tabs', () => {
  it('put posts a data change', async () => {
    const { store, posts } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'e1' }));
    expect(posts).toContainEqual({ type: 'reload', reason: 'data' });
  });

  it('putMany saves several records and posts once', async () => {
    const { deps, store, posts } = await freshStore();
    const before = posts.length;
    await store.getState().putMany([
      { table: 'expense', record: makeExpense({ id: 'e1' }) },
      { table: 'expense', record: makeExpense({ id: 'e2' }) },
    ]);
    expect(posts.length - before).toBe(1);
    expect(
      (await reboot(deps))
        .getState()
        .data.tables.expense.map((e) => e.id)
        .sort(),
    ).toEqual(['e1', 'e2']);
  });

  it('refresh picks up another tab’s write', async () => {
    const { deps, store } = await freshStore();
    const other = await reboot(deps);
    await store.getState().put('expense', makeExpense({ id: 'from-a' }));
    expect(other.getState().data.tables.expense).toEqual([]);
    await other.getState().refresh();
    expect(other.getState().data.tables.expense.map((e) => e.id)).toEqual(['from-a']);
  });
});

describe('backup when storage is full', () => {
  it('does not fail a saved backup because its date could not be recorded', async () => {
    const { store } = await freshStore();
    const { fileName, text } = await store.getState().createBackup('correct horse');
    expect(fileName).toMatch(/^funancial-backup-\d{4}-\d{2}-\d{2}\.funbak$/);
    expect(JSON.parse(text).format).toBe('funancial-backup');

    store.setState({ put: vi.fn().mockRejectedValue(new Error('quota')) });
    await expect(store.getState().markBackedUp()).resolves.toBeUndefined();
  });
});

describe('sync', () => {
  it('materializes due subscription charges when the app opens', async () => {
    const { deps, store } = await freshStore();
    await store
      .getState()
      .put(
        'subscription',
        makeSubscription({ id: 's1', name: 'Tunely', amount: 10_99, nextRenewal: '2026-10-12' }),
      );
    const again = await reboot(deps);
    expect(again.getState().data.tables.expense.map((e) => e.id)).toEqual(['sub-s1-2026-10-12']);
    expect(again.getState().data.tables.subscription[0]?.nextRenewal).toBe('2026-11-12');
  });

  it('picks up a renewal when the day changes', async () => {
    let today = '2026-10-19';
    const t = testDeps({ today: () => today });
    const store = createAppStore(t.deps);
    await store.getState().boot();
    await store.getState().startFresh();
    await store
      .getState()
      .put('subscription', makeSubscription({ id: 's1', nextRenewal: '2026-10-20' }));
    expect(store.getState().today).toBe('2026-10-19');
    today = '2026-10-20';
    await store.getState().sync();
    expect(store.getState().today).toBe('2026-10-20');
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['sub-s1-2026-10-20']);
  });

  it('has nothing to generate for fresh demo data', async () => {
    const { store } = await freshStore();
    await store.getState().startDemo();
    expect(store.getState().data.tables.expense).toHaveLength(
      buildDemoSnapshot('2026-10-14').tables.expense.length,
    );
  });
});

describe('a sync failure while opening', () => {
  it('still opens the data instead of claiming storage is unavailable', async () => {
    const { deps, store } = await freshStore();
    await store.getState().put('expense', makeExpense({ id: 'e1' }));
    const again = createAppStore(deps);
    const failingSync = vi.fn(async () => {
      throw new Error('QuotaExceededError');
    });
    again.setState({ sync: failingSync });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    await again.getState().boot();
    quiet.mockRestore();
    expect(failingSync).toHaveBeenCalled();
    expect(again.getState().phase).toBe('unlocked');
    expect(again.getState().data.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('closing storage', () => {
  it('logs a backend that fails to close instead of hiding it', async () => {
    const backend = memoryStorage();
    const failure = new Error('disk gone');
    const { deps } = testDeps({
      storage: {
        open: async () => ({ ...backend, close: () => Promise.reject(failure) }),
        remove: async () => {},
      },
    });
    const store = createAppStore(deps);
    await store.getState().boot();

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await store.getState().boot(); // opening the next session closes the failing one
      expect(logged).toHaveBeenCalledWith('Closing storage failed', failure);
      expect(store.getState().phase).toBe('welcome');
    } finally {
      logged.mockRestore();
    }
  });
});
