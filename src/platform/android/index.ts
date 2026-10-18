import { storedKeyring } from '@/data/keyring';
import { sqliteStorage } from '@/data/sqliteStorage';
import type { Platform } from '../types';
import { androidBiometric } from './biometric';
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
    onPause: (cb) =>
      listen((run) => App.addListener('pause', run), cb, 'the app going to the background'),
    onResume: (cb) => listen((run) => App.addListener('resume', run), cb, 'the app coming back'),
    appVersion: async () => {
      // `build` is the versionCode (a string over the bridge), `version` the versionName. A
      // build number that is not a whole number above 0 is no version, so no update is offered.
      const { build, version } = await App.getInfo();
      const code = Number(build);
      return Number.isInteger(code) && code > 0 ? { code, name: version } : null;
    },
    biometric: androidBiometric,
    notifier: createAndroidNotifier(),
  };
}
