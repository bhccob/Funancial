import { storedKeyring } from '@/data/keyring';
import { sqliteStorage } from '@/data/sqliteStorage';
import type { Platform } from '../types';
import { androidBiometric } from './biometric';
import { androidFiles } from './files';
import { listen } from './listen';
import { createAndroidNotifier } from './notifier';
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
    onPause: (cb) =>
      listen((run) => App.addListener('pause', run), cb, 'the app going to the background'),
    onResume: (cb) => listen((run) => App.addListener('resume', run), cb, 'the app coming back'),
    appVersion: async () => {
      // `build` is the versionCode (a string over the bridge), `version` the versionName.
      const { build, version } = await App.getInfo();
      return { code: Number(build), name: version };
    },
    biometric: androidBiometric,
    notifier: createAndroidNotifier(),
  };
}
