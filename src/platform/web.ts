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
  save: async (fileName, text, mime) => downloadText(fileName, text, mime),
};

/** The browser: IndexedDB, a non-extractable device key, downloads. */
export function createWebPlatform(): Platform {
  return {
    kind: 'web',
    storage: dexieStorage(),
    keyring: browserKeyring,
    storageStatus: persistentStorageStatus,
    requestPersistence: requestPersistentStorage,
    files: webFiles,
    onResume(cb) {
      const onVisibility = () => {
        if (document.visibilityState === 'visible') cb();
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
