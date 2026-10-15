import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  backupFileName,
  createBackup as encryptBackup,
  exportFileName,
  exportPlainJson,
  readBackup,
} from '@/data/backup';
import { base64ToBytes, bytesToBase64, type Bytes } from '@/data/crypto';
import type { Namespace } from '@/data/db';
import { buildDemoSnapshot } from '@/data/demoSeed';
import type { DeviceKeyring } from '@/data/keyring';
import {
  clearVaultSecret,
  createVault,
  getLockMode,
  setVaultSecret,
  unlockVault,
  validateSecret,
  VaultExistsError,
  WrongSecretError,
  type LockMode,
  type SecretKind,
} from '@/data/keys';
import { createRepository, type Repository, type SkippedRecord } from '@/data/repository';
import type { StorageBackend, StorageProvider } from '@/data/storage';
import type { LocalDate } from '@/domain/dates';
import { defaultSettings } from '@/domain/entities';
import { dueGenerated } from '@/domain/sync';
import {
  emptySnapshot,
  type DataSnapshot,
  type EntityOf,
  type TableName,
  type TableRecord,
} from '@/domain/snapshot';
import type { SyncMessage } from '@/lib/broadcast';
import type { SafeStorage } from '@/lib/safeStorage';
import type { BiometricVault } from '@/platform/types';

export type Phase = 'booting' | 'unavailable' | 'welcome' | 'locked' | 'unlocked';

export interface AppDeps {
  kdfIterations: number;
  today(): LocalDate;
  now(): number;
  /** Small string preferences that survive reloads (which namespace is active). */
  safeStorage: SafeStorage;
  channel: { post(m: SyncMessage): void };
  /** Whether storage is already persistent. Must not prompt. */
  storageStatus(): Promise<boolean>;
  /** Ask the browser to keep our storage. May prompt; only call after a user action. */
  requestPersistence(): Promise<boolean>;
  /** Where the encrypted records and vault metadata live: IndexedDB on the web, SQLCipher on Android. */
  storage: StorageProvider;
  /**
   * Where the vault's device-mode key lives: a non-extractable key in IndexedDB on the web, its
   * bytes inside the encrypted database on Android.
   */
  keyring: DeviceKeyring;
  /** Keeps a copy of the data key behind the fingerprint or face check; `null` without one (web). */
  biometric: BiometricVault | null;
}

export interface AppState {
  phase: Phase;
  namespace: Namespace;
  lockMode: LockMode | null;
  data: DataSnapshot;
  skipped: SkippedRecord[];
  persisted: boolean;
  failedAttempts: number;
  /** Epoch ms until which unlock attempts are refused. */
  lockedUntil: number | null;
  /** An unlock attempt is being checked (the key derivation takes a moment). */
  checking: boolean;
  /** The app's idea of today; refreshed on boot and whenever the app regains focus. */
  today: LocalDate;
  /** Fingerprint or face unlock: `unavailable` where the device has none, else off or on. */
  biometric: 'unavailable' | 'off' | 'on';

  boot(): Promise<void>;
  startFresh(): Promise<void>;
  startDemo(): Promise<void>;
  exitDemo(): Promise<void>;
  unlock(secret: string): Promise<'ok' | 'wrong' | 'throttled' | 'busy'>;
  verifySecret(secret: string): Promise<boolean>;
  lock(): void;
  setSecret(secret: string, kind: SecretKind): Promise<void>;
  clearSecret(): Promise<void>;
  /** Keeps a copy of the data key behind the fingerprint or face check. Unlocked, with a PIN or passphrase. */
  enableBiometric(): Promise<void>;
  disableBiometric(): Promise<void>;
  /** `changed`: the copy is gone (the enrolment changed), so biometric unlock turns off; the PIN still works. */
  unlockWithBiometric(): Promise<'ok' | 'cancelled' | 'changed'>;
  put<T extends TableName>(table: T, record: EntityOf<T>): Promise<void>;
  /** Several records in one transaction (all or nothing). */
  putMany(items: TableRecord[]): Promise<void>;
  /** Reload data from storage, e.g. after another tab wrote. */
  refresh(): Promise<void>;
  /** Refresh `today` and create what has come due (subscription charges, expected salary). */
  sync(): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  /** Encrypts the data into backup text. It is not a backup until saved: then call `markBackedUp`. */
  createBackup(passphrase: string): Promise<{ fileName: string; text: string }>;
  /** Records that a backup file was saved just now, which is what "Last backup" shows. */
  markBackedUp(): Promise<void>;
  restoreBackup(text: string, passphrase: string): Promise<void>;
  exportPlain(): { fileName: string; text: string };
  deleteAllData(): Promise<void>;
}

const NAMESPACE_KEY = 'funancial.namespace';
const MAX_ATTEMPTS = 5;
const THROTTLE_MS = 30_000;
/** Meta key for the unlock throttle; kept on disk so a reload doesn't reset it. */
const THROTTLE_KEY = 'throttle';
type Throttle = { failedAttempts: number; lockedUntil: number | null };
/** Meta key saying whether biometric unlock is on: only ever a boolean, never the key. */
const BIOMETRIC_KEY = 'biometric';
const biometricSlot = (ns: Namespace) => `funancial.${ns}.unlock`;

/** The data key from its biometric copy, extractable as an unwrapped one is; `null` if unusable. */
async function importDataKey(secret: string): Promise<CryptoKey | null> {
  let raw: Bytes | undefined;
  try {
    raw = base64ToBytes(secret);
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
  } catch {
    return null;
  } finally {
    raw?.fill(0);
  }
}

/** Open storage backend + vault for the active namespace. Kept out of state: keys never hit React. */
type Session = { backend: StorageBackend; repo: Repository | null; key: CryptoKey | null };

export function createAppStore(deps: AppDeps): StoreApi<AppState> {
  let session: Session | null = null;

  const nowIsoString = () => new Date(deps.now()).toISOString();
  /** A throttle deadline that has passed no longer applies. */
  const activeUntil = (until: number | null) =>
    until !== null && deps.now() < until ? until : null;
  const readNamespace = (): Namespace =>
    deps.safeStorage.get(NAMESPACE_KEY) === 'demo' ? 'demo' : 'real';

  /** A backend that fails to close leaves nothing to recover, so the failure is logged, not thrown. */
  async function closeSession() {
    const closing = session;
    session = null;
    await closing?.backend
      .close()
      .catch((e: unknown) => console.error('Closing storage failed', e));
  }

  async function openSession(ns: Namespace): Promise<Session> {
    await closeSession();
    const backend = await deps.storage.open(ns);
    session = { backend, repo: null, key: null };
    return session;
  }

  function unlocked(): Session & { repo: Repository; key: CryptoKey } {
    if (!session?.repo || !session.key) throw new Error('Funancial is locked');
    return session as Session & { repo: Repository; key: CryptoKey };
  }

  /** Off or on, from the namespace's flag, where the device has fingerprint or face at all. */
  async function biometricState(s: Session): Promise<AppState['biometric']> {
    if (!(await deps.biometric?.available().catch(() => false))) return 'unavailable';
    return (await s.backend.meta.get(BIOMETRIC_KEY)) === true ? 'on' : 'off';
  }

  /** The prompt being shown, if any: a second ask (a double tap, a remount) shares it. */
  let biometricRead: Promise<'ok' | 'cancelled' | 'changed'> | null = null;

  return createStore<AppState>()((set, get) => {
    async function openWith(key: CryptoKey) {
      if (!session) throw new Error('No open database');
      session.key = key;
      session.repo = createRepository(session.backend, key);
      const { snapshot, skipped } = await session.repo.loadAll();
      set({ data: snapshot, skipped, phase: 'unlocked' });
      // The data is open; a failed catch-up (e.g. storage full) retries on the next focus.
      await get()
        .sync()
        .catch((e: unknown) => console.error('Sync after opening failed', e));
    }

    function requireReal(action: string) {
      if (get().namespace === 'demo') throw new Error(`Demo data can't ${action}.`);
    }

    async function readBiometric(): Promise<'ok' | 'cancelled' | 'changed'> {
      const s = session;
      if (!s || !deps.biometric || get().phase !== 'locked' || get().biometric !== 'on') {
        return 'cancelled';
      }
      const result = await deps.biometric.read(biometricSlot(get().namespace));
      if (result.status === 'cancelled') return 'cancelled';
      const key = result.status === 'ok' ? await importDataKey(result.secret) : null;
      if (!key) {
        // The copy is gone: stop asking, and leave the PIN as the way in.
        await get()
          .disableBiometric()
          .catch((e: unknown) => {
            console.error('Turning biometric unlock off failed', e);
            set({ biometric: 'off' });
          });
        return 'changed';
      }
      // The PIN may have opened the app meanwhile, or everything was erased.
      if (session !== s || get().phase !== 'locked') return 'cancelled';
      await s.backend.meta.delete(THROTTLE_KEY);
      set({ failedAttempts: 0, lockedUntil: null });
      await openWith(key);
      return 'ok';
    }

    return {
      phase: 'booting',
      namespace: 'real',
      lockMode: null,
      data: emptySnapshot(),
      skipped: [],
      persisted: false,
      failedAttempts: 0,
      lockedUntil: null,
      checking: false,
      today: deps.today(),
      biometric: 'unavailable',

      async boot() {
        set({ phase: 'booting' });
        // Status only: requesting persistence can prompt (Firefox) and must not block boot.
        const persisted = await deps.storageStatus().catch(() => false);
        const namespace = readNamespace();
        set({
          namespace,
          persisted,
          data: emptySnapshot(),
          skipped: [],
          failedAttempts: 0,
          lockedUntil: null,
          checking: false,
        });
        try {
          const s = await openSession(namespace);
          const lockMode = await getLockMode(s.backend.meta);
          const throttle = await s.backend.meta.get<Throttle>(THROTTLE_KEY);
          set({
            lockMode,
            // Before the lock screen shows: it asks for the fingerprint or face as it opens.
            biometric: await biometricState(s),
            failedAttempts: throttle?.failedAttempts ?? 0,
            lockedUntil: activeUntil(throttle?.lockedUntil ?? null),
          });
          if (lockMode === null) set({ phase: 'welcome' });
          else if (lockMode === 'device')
            await openWith(await unlockVault(s.backend.meta, undefined, deps.keyring));
          else set({ phase: 'locked' });
        } catch {
          await closeSession();
          set({ phase: 'unavailable' });
        }
      },

      async startFresh() {
        if (!session) throw new Error('Call boot() first');
        let key: CryptoKey;
        try {
          key = await createVault(session.backend.meta, deps.keyring);
        } catch (e) {
          // Another tab started first: use its vault rather than replacing it.
          if (e instanceof VaultExistsError) return get().boot();
          throw e;
        }
        await openWith(key);
        set({ lockMode: 'device' });
        await get().put('settings', defaultSettings(nowIsoString()));
        deps.channel.post({ type: 'reload', reason: 'start' });
        deps.requestPersistence().then(
          (persisted) => set({ persisted }),
          () => {},
        );
      },

      async startDemo() {
        // Build first (pure); switch namespace only once the demo database is fully seeded.
        const snapshot = buildDemoSnapshot(deps.today());
        await closeSession();
        try {
          await deps.storage.remove('demo');
          const s = await openSession('demo');
          const key = await createVault(s.backend.meta, deps.keyring);
          await createRepository(s.backend, key).replaceAll(snapshot);
          deps.safeStorage.set(NAMESPACE_KEY, 'demo');
          set({
            namespace: 'demo',
            lockMode: 'device',
            failedAttempts: 0,
            lockedUntil: null,
            biometric: get().biometric === 'unavailable' ? 'unavailable' : 'off',
          });
          await openWith(key);
        } catch (e) {
          await closeSession();
          await deps.storage.remove('demo').catch(() => {});
          deps.safeStorage.remove(NAMESPACE_KEY);
          await get().boot();
          throw e;
        }
        deps.channel.post({ type: 'reload', reason: 'namespace' });
      },

      async exitDemo() {
        await closeSession();
        await deps.storage.remove('demo');
        deps.safeStorage.remove(NAMESPACE_KEY);
        deps.channel.post({ type: 'reload', reason: 'namespace' });
        await get().boot();
      },

      async unlock(secret) {
        if (get().checking) return 'busy';
        const { lockedUntil } = get();
        if (lockedUntil !== null && deps.now() < lockedUntil) return 'throttled';
        const s = session;
        if (!s) throw new Error('Call boot() first');
        set({ checking: true });
        try {
          const key = await unlockVault(s.backend.meta, secret, deps.keyring);
          await s.backend.meta.delete(THROTTLE_KEY);
          set({ failedAttempts: 0, lockedUntil: null });
          await openWith(key);
          return 'ok';
        } catch (e) {
          if (!(e instanceof WrongSecretError)) throw e;
          const failedAttempts = get().failedAttempts + 1;
          const next: Throttle =
            failedAttempts >= MAX_ATTEMPTS
              ? { failedAttempts: 0, lockedUntil: deps.now() + THROTTLE_MS }
              : { failedAttempts, lockedUntil: activeUntil(get().lockedUntil) };
          set(next);
          await s.backend.meta.put(THROTTLE_KEY, next);
          return 'wrong';
        } finally {
          set({ checking: false });
        }
      },

      async verifySecret(secret) {
        if (!session || get().lockMode === 'device') return true;
        try {
          await unlockVault(session.backend.meta, secret, deps.keyring);
          return true;
        } catch (e) {
          if (e instanceof WrongSecretError) return false;
          throw e;
        }
      },

      lock() {
        if (get().phase !== 'unlocked' || get().lockMode === 'device' || !session) return;
        session.repo = null;
        session.key = null;
        set({ phase: 'locked', data: emptySnapshot(), skipped: [] });
      },

      async setSecret(secret, kind) {
        requireReal('be locked');
        const problem = validateSecret(secret, kind);
        if (problem) throw new Error(problem);
        const s = unlocked();
        await setVaultSecret(s.backend.meta, s.key, secret, kind, {
          iterations: deps.kdfIterations,
        });
        set({ lockMode: kind });
        deps.channel.post({ type: 'reload', reason: 'secret' });
      },

      async clearSecret() {
        requireReal('be unlocked');
        const s = unlocked();
        // With no lock there is nothing for biometrics to unlock: the copy goes first.
        await get().disableBiometric();
        await clearVaultSecret(s.backend.meta, s.key, deps.keyring);
        set({ lockMode: 'device' });
        deps.channel.post({ type: 'reload', reason: 'secret' });
      },

      async enableBiometric() {
        requireReal('use biometric unlock');
        const { lockMode, namespace } = get();
        if (!deps.biometric || get().biometric === 'unavailable') {
          throw new Error("This device can't unlock with a fingerprint or face.");
        }
        if (lockMode !== 'pin' && lockMode !== 'passphrase') {
          throw new Error('Set a PIN or passphrase first.');
        }
        const s = unlocked();
        // The raw key leaves memory only for the Keystore slot that biometrics guard.
        const raw = new Uint8Array(await crypto.subtle.exportKey('raw', s.key));
        try {
          await deps.biometric.store(biometricSlot(namespace), bytesToBase64(raw));
        } finally {
          raw.fill(0);
        }
        await s.backend.meta.put(BIOMETRIC_KEY, true);
        set({ biometric: 'on' });
      },

      async disableBiometric() {
        const s = session;
        if (!s) throw new Error('Call boot() first');
        if (deps.biometric) {
          // The copy first: if that fails it stays on, rather than off with a copy left behind.
          await deps.biometric.forget(biometricSlot(get().namespace));
          await s.backend.meta.delete(BIOMETRIC_KEY);
        }
        if (get().biometric === 'on') set({ biometric: 'off' });
      },

      unlockWithBiometric() {
        biometricRead ??= readBiometric().finally(() => {
          biometricRead = null;
        });
        return biometricRead;
      },

      async put(table, record) {
        await get().putMany([{ table, record } as TableRecord]);
      },

      async putMany(items) {
        if (items.length === 0) return;
        await unlocked().repo.putMany(items);
        const data = get().data;
        const tables = { ...data.tables } as Record<TableName, Array<{ id: string }>>;
        for (const { table, record } of items) {
          const rows = tables[table];
          tables[table] = rows.some((r) => r.id === record.id)
            ? rows.map((r) => (r.id === record.id ? record : r))
            : [...rows, record];
        }
        set({ data: { ...data, tables: tables as DataSnapshot['tables'] } });
        deps.channel.post({ type: 'reload', reason: 'data' });
      },

      async sync() {
        const today = deps.today();
        set({ today });
        if (get().phase !== 'unlocked' || !session?.repo) return;
        const due = dueGenerated(get().data, today);
        if (due.length > 0) await get().putMany(due);
      },

      async refresh() {
        if (get().phase !== 'unlocked' || !session?.repo) return;
        const { snapshot, skipped } = await session.repo.loadAll();
        set({ data: snapshot, skipped });
      },

      async remove(table, id) {
        await unlocked().repo.remove(table, id);
        const data = get().data;
        const rows = data.tables[table] as Array<{ id: string }>;
        set({
          data: { ...data, tables: { ...data.tables, [table]: rows.filter((r) => r.id !== id) } },
        });
        deps.channel.post({ type: 'reload', reason: 'data' });
      },

      async createBackup(passphrase) {
        const now = new Date(deps.now());
        const text = await encryptBackup(get().data, passphrase, {
          iterations: deps.kdfIterations,
          now,
        });
        return { fileName: backupFileName(now), text };
      },

      async markBackedUp() {
        const at = nowIsoString();
        const settings = get().data.tables.settings[0] ?? defaultSettings(at);
        // Best effort: the file is already saved, and when storage is full that matters more than
        // remembering its date.
        await get()
          .put('settings', { ...settings, lastBackupAt: at, updatedAt: at })
          .catch(() => {});
      },

      async restoreBackup(text, passphrase) {
        const s = unlocked();
        const snapshot = await readBackup(text, passphrase); // throws before anything changes
        await s.repo.replaceAll(snapshot);
        set({ data: snapshot, skipped: [] });
        deps.channel.post({ type: 'reload', reason: 'restore' });
      },

      exportPlain() {
        const now = new Date(deps.now());
        return { fileName: exportFileName(now), text: exportPlainJson(get().data, now) };
      },

      async deleteAllData() {
        const ns = get().namespace;
        // Best effort: the data it opens is about to go, and erasing must never be blocked.
        await deps.biometric
          ?.forget(biometricSlot(ns))
          .catch((e: unknown) => console.error('Forgetting the biometric copy failed', e));
        await closeSession();
        await deps.storage.remove(ns);
        deps.safeStorage.remove(NAMESPACE_KEY);
        deps.channel.post({ type: 'reload', reason: 'delete' });
        await get().boot();
      },
    };
  });
}
