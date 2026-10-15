import { dexieStorage } from '@/data/db';
import { browserKeyring } from '@/data/keyring';
import { downloadText } from '@/lib/download';
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

/** Files leave the browser as downloads. */
export const webFiles: Platform['files'] = {
  save: async (fileName, text, mime) => {
    downloadText(fileName, text, mime);
    return 'saved';
  },
};

/** Runs `cb` each time the page's visibility becomes `state`. Returns an unsubscribe. */
function onVisibility(state: DocumentVisibilityState, cb: () => void): () => void {
  const onChange = () => {
    if (document.visibilityState === state) cb();
  };
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/** The browser: IndexedDB, a non-extractable device key, downloads. */
export function createWebPlatform(): Platform {
  return {
    kind: 'web',
    storage: dexieStorage(),
    keyring: browserKeyring,
    storageStatus: persistentStorageStatus,
    requestPersistence: requestPersistentStorage,
    files: webFiles,
    onPause: (cb) => onVisibility('hidden', cb),
    onResume: (cb) => onVisibility('visible', cb),
    biometric: null,
    notifier: null,
  };
}
