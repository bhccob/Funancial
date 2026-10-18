import { dexieStorage } from '@/data/db';
import { browserKeyring } from '@/data/keyring';
import type { Platform } from './types';

async function persistentStorageStatus(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Runs `cb` each time the page's visibility becomes `state`. Returns an unsubscribe. */
function onVisibility(state: DocumentVisibilityState, cb: () => void): () => void {
  const onChange = () => {
    if (document.visibilityState === state) cb();
  };
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/** The browser: IndexedDB and a non-extractable device key. */
export function createWebPlatform(): Platform {
  return {
    kind: 'web',
    storage: dexieStorage(),
    keyring: browserKeyring,
    storageStatus: persistentStorageStatus,
    requestPersistence: requestPersistentStorage,
    onPause: (cb) => onVisibility('hidden', cb),
    onResume: (cb) => onVisibility('visible', cb),
    appVersion: async () => null,
    biometric: null,
    notifier: null,
  };
}
