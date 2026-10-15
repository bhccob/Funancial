import type { DeviceKeyring } from '@/data/keyring';
import type { StorageProvider } from '@/data/storage';
import type { Reminder } from '@/domain/notifications';

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
  /** Fingerprint or face unlock, where the device has it: `null` on the web. */
  biometric: BiometricVault | null;
  /** Reminders that arrive while the app is closed, where the phone can schedule them: `null` on the web. */
  notifier: Notifier | null;
}

/** A secret kept behind the device's fingerprint or face check. */
export interface BiometricVault {
  available(): Promise<boolean>;
  /** Keep `secret` behind the fingerprint/face check (Keystore, current enrolment only). May show the system prompt. */
  store(slot: string, secret: string): Promise<void>;
  /** Shows the system prompt. `changed`: enrolment changed or the copy is gone (plugin code 21). */
  read(
    slot: string,
  ): Promise<{ status: 'ok'; secret: string } | { status: 'cancelled' } | { status: 'changed' }>;
  forget(slot: string): Promise<void>;
}

/** Local notifications the phone shows by itself, on a schedule the app sets in advance. */
export interface Notifier {
  permission(): Promise<'granted' | 'denied' | 'prompt'>;
  /** Asks Android (13+) for notification permission. Only call after a user action. */
  request(): Promise<boolean>;
  /** Cancel the reminders this app scheduled and schedule these instead. */
  replace(reminders: Reminder[]): Promise<void>;
  /** One reminder a minute from now, to check they arrive. */
  sendTest(): Promise<void>;
  /** Runs `cb` with the screen a tapped reminder points at. Returns an unsubscribe. */
  onOpen(cb: (route: string) => void): () => void;
}
