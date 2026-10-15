import type { DeviceKeyring } from '@/data/keyring';
import type { StorageProvider } from '@/data/storage';

/**
 * Everything that differs between the browser and the Android app, chosen once at startup.
 * The UI and the store see only this.
 */
export interface Platform {
  kind: 'web' | 'android';
  /** Where the encrypted records and vault metadata live. */
  storage: StorageProvider;
  /** Where the vault's device-mode key lives. */
  keyring: DeviceKeyring;
  /** Whether storage is already persistent. Must not prompt. */
  storageStatus(): Promise<boolean>;
  /** Ask to keep our storage. May prompt; only call after a user action. */
  requestPersistence(): Promise<boolean>;
  /**
   * Hand a file to the person: a download on the web, the share sheet on Android. Resolves
   * `'cancelled'` when the person backed out of the share sheet, so nothing was saved; the web
   * cannot tell and always says `'saved'`.
   */
  files: {
    save(fileName: string, text: string, mime: string): Promise<'saved' | 'cancelled'>;
  };
  /** Runs `cb` each time the app goes to the background. Returns an unsubscribe. */
  onPause(cb: () => void): () => void;
  /** Runs `cb` each time the app comes back to the foreground. Returns an unsubscribe. */
  onResume(cb: () => void): () => void;
}
