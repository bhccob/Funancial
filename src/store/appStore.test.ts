import { describe, expect, it } from 'vitest';
import { InvalidBackupError } from '@/data/backup';
import { deleteDb, openDb, type FunancialDb } from '@/data/db';
import { WrongSecretError } from '@/data/keys';
import type { SyncMessage } from '@/lib/broadcast';
import type { SafeStorage } from '@/lib/safeStorage';
import { makeExpense } from '@/test/fixtures';
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
    storage: memorySafeStorage(),
    channel: { post: (m) => void posts.push(m) },
    requestPersistence: async () => true,
    db: { open: (ns) => openDb(ns, prefix), remove: (ns) => deleteDb(ns, prefix) },
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
    const blocked = { open: () => Promise.reject(new Error('blocked')) } as unknown as FunancialDb;
    const { deps } = testDeps({ db: { open: () => blocked, remove: async () => {} } });
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
    expect(deps.storage.get('funancial.namespace')).toBe('demo');

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
  it('creates a dated backup and records when it was made', async () => {
    const { store } = await freshStore();
    const { fileName, text } = await store.getState().createBackup('correct horse');
    expect(fileName).toMatch(/^funancial-backup-\d{4}-\d{2}-\d{2}\.funbak$/);
    expect(JSON.parse(text).format).toBe('funancial-backup');
    expect(store.getState().data.tables.settings[0]?.lastBackupAt).toBe('2026-10-14T10:00:00.000Z');
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
