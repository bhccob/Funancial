import { dexieStorage } from '@/data/db';
import { browserKeyring } from '@/data/keyring';
import type { SyncMessage } from '@/lib/broadcast';
import type { SafeStorage } from '@/lib/safeStorage';
import { createAppStore, type AppDeps } from '@/store/appStore';

/** A real store over fake-indexeddb with a fixed clock and fast key derivation. */
export function realStoreDeps(overrides: Partial<AppDeps> = {}) {
  const prefix = `test-${crypto.randomUUID()}`;
  const map = new Map<string, string>();
  const safeStorage: SafeStorage = {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => (map.set(k, v), true),
    remove: (k) => void map.delete(k),
  };
  const posts: SyncMessage[] = [];
  const deps: AppDeps = {
    kdfIterations: 1_000,
    today: () => '2026-10-14',
    now: () => Date.parse('2026-10-14T10:00:00.000Z'),
    safeStorage,
    channel: { post: (m) => void posts.push(m) },
    storageStatus: async () => true,
    requestPersistence: async () => true,
    storage: dexieStorage(prefix),
    keyring: browserKeyring,
    ...overrides,
  };
  return { deps, posts };
}

export async function freshRealStore(overrides: Partial<AppDeps> = {}) {
  const { deps, posts } = realStoreDeps(overrides);
  const store = createAppStore(deps);
  await store.getState().boot();
  await store.getState().startFresh();
  return { store, deps, posts };
}
