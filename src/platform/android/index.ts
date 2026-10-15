import { storedKeyring } from '@/data/keyring';
import { sqliteStorage } from '@/data/sqliteStorage';
import type { Platform } from '../types';
import { webFiles } from '../web';
import { capacitorSqlDriver } from './sqlite';

/**
 * The Android app: an encrypted SQLCipher database holds the records and the vault, so the
 * device key is kept as bytes inside it. App storage is never evicted, so it counts as persistent.
 */
export async function createAndroidPlatform(): Promise<Platform> {
  const [{ App }, driver] = await Promise.all([import('@capacitor/app'), capacitorSqlDriver()]);
  return {
    kind: 'android',
    storage: sqliteStorage(driver),
    keyring: storedKeyring,
    storageStatus: async () => true,
    requestPersistence: async () => true,
    // Downloads until the share sheet arrives.
    files: webFiles,
    onResume(cb) {
      const listener = App.addListener('resume', cb);
      return () => void listener.then((l) => l.remove());
    },
  };
}
