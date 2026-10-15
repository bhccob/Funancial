import { storedKeyring } from '@/data/keyring';
import { sqliteStorage } from '@/data/sqliteStorage';
import type { Platform } from '../types';
import { androidFiles } from './files';
import { listen } from './listen';
import { installShell } from './shell';
import { capacitorSqlDriver } from './sqlite';

/**
 * The Android app: an encrypted SQLCipher database holds the records and the vault, so the
 * device key is kept as bytes inside it. App storage is never evicted, so it counts as persistent.
 */
export async function createAndroidPlatform(): Promise<Platform> {
  const [{ App }, driver] = await Promise.all([import('@capacitor/app'), capacitorSqlDriver()]);
  await installShell();
  return {
    kind: 'android',
    storage: sqliteStorage(driver),
    keyring: storedKeyring,
    storageStatus: async () => true,
    requestPersistence: async () => true,
    files: androidFiles,
    onPause: (cb) => listen(() => App.addListener('pause', cb), 'the app going to the background'),
    onResume: (cb) => listen(() => App.addListener('resume', cb), 'the app coming back'),
  };
}
