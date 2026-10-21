import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  base64ToBytes,
  bytesToBase64,
  decryptRecord,
  encryptRecord,
  type Bytes,
} from '@/data/crypto';
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
import {
  createRepository,
  type LoadResult,
  type Repository,
  type SkippedRecord,
} from '@/data/repository';
import type { StorageBackend, StorageProvider } from '@/data/storage';
import type { LocalDate } from '@/domain/dates';
import { defaultSettings } from '@/domain/entities';
import { gameUpdates, type GameGain } from '@/domain/game/engine';
import type { GameContext } from '@/domain/game/types';
import { dueGenerated } from '@/domain/sync';
import {
  emptySnapshot,
  freshStart,
  SchemaVersionError,
  type DataSnapshot,
  type EntityOf,
  type RecordKey,
  type TableName,
  type TableRecord,
} from '@/domain/snapshot';
import type { SyncMessage } from '@/lib/broadcast';
import type { SafeStorage } from '@/lib/safeStorage';
import type { BiometricVault } from '@/platform/types';

/** `updateNeeded`: the data was saved by a newer Funcial than this one, and is left as it is. */
export type Phase = 'booting' | 'unavailable' | 'updateNeeded' | 'welcome' | 'locked' | 'unlocked';

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
  /**
   * What the game paid in the latest settle that paid anything, numbered so a screen can tell a new
   * gain from one it has already shown. Cleared on lock and boot.
   */
  gameGain: { id: number; gain: GameGain } | null;

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
  /** Several records, and the removal of the `remove` ones, in one transaction (all or nothing). */
  putMany(items: TableRecord[], remove?: RecordKey[]): Promise<void>;
  /** Reload data from storage, e.g. after another tab wrote. */
  refresh(): Promise<void>;
  /** Refresh `today` and create what has come due (subscription charges, expected salary). */
  sync(): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  /** Replaces all data with `snapshot`, already validated (`migrateSnapshot`): what an account's copy restores through. */
  restoreSnapshot(snapshot: DataSnapshot): Promise<void>;
  /** Runs `cb` after the app changed the data (a write, a removal, a restore). Returns an unsubscribe. */
  onDataChange(cb: () => void): () => void;
  /**
   * A value kept in this namespace's metadata, locked with the data key. It sits beside the data,
   * never in it: no snapshot or upload holds it. `null` when nothing is kept under `name`.
   */
  getPrivate<T>(name: string): Promise<T | null>;
  putPrivate(name: string, value: unknown): Promise<void>;
  deletePrivate(name: string): Promise<void>;
  deleteAllData(): Promise<void>;
  /**
   * Delete all data for a phone with an account: what was added goes (`freshStart`), and the lock,
   * the account link and the settings stay. Through the restore path, so the account uploads it.
   */
  startOver(): Promise<void>;
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

/** The moment the game runs in: the store's day, and the settings' week start. */
export function gameContext(state: Pick<AppState, 'today' | 'data'>, now: string): GameContext {
  return {
    today: state.today,
    now,
    weekStartsOn: state.data.tables.settings[0]?.weekStartsOn ?? 1,
  };
}

/** Open storage backend + vault for the active namespace. Kept out of state: keys never hit React. */
type Session = { backend: StorageBackend; repo: Repository | null; key: CryptoKey | null };

export function createAppStore(deps: AppDeps): StoreApi<AppState> {
  let session: Session | null = null;
  /** Numbers the gains, across locks and boots, so a screen never mistakes a new one for an old one. */
  let lastGainId = 0;
  /** True while the demo's seeded history is first settled: it is paid out, but not published as a gain. */
  let seedingDemo = false;

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
    if (!session?.repo || !session.key) throw new Error('Funcial is locked');
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
    /**
     * What `repo` holds, or `null` when a newer Funcial saved it: then nothing was read or
     * written, the session is closed to writes, and the person is told to update.
     */
    async function loadOrRefuse(repo: Repository): Promise<LoadResult | null> {
      try {
        return await repo.loadAll();
      } catch (e) {
        if (!(e instanceof SchemaVersionError)) throw e;
        if (session) {
          session.repo = null;
          session.key = null;
        }
        set({ phase: 'updateNeeded', data: emptySnapshot(), skipped: [] });
        return null;
      }
    }

    async function openWith(key: CryptoKey) {
      if (!session) throw new Error('No open database');
      session.key = key;
      session.repo = createRepository(session.backend, key);
      const loaded = await loadOrRefuse(session.repo);
      if (!loaded) return;
      set({ data: loaded.snapshot, skipped: loaded.skipped, phase: 'unlocked' });
      // The data is open; a failed catch-up (e.g. storage full) retries on the next focus.
      await get()
        .sync()
        .catch((e: unknown) => console.error('Sync after opening failed', e));
    }

    /** Saves records and mirrors them into `data`. The caller tells other tabs, once, when it is done. */
    async function writeRecords(items: TableRecord[], remove: RecordKey[] = []) {
      await unlocked().repo.putMany(items, remove);
      const data = get().data;
      const tables = { ...data.tables } as Record<TableName, Array<{ id: string }>>;
      for (const { table, record } of items) {
        const rows = tables[table];
        tables[table] = rows.some((r) => r.id === record.id)
          ? rows.map((r) => (r.id === record.id ? record : r))
          : [...rows, record];
      }
      for (const { table, id } of remove) tables[table] = tables[table].filter((r) => r.id !== id);
      set({ data: { ...data, tables: tables as DataSnapshot['tables'] } });
    }

    const dataListeners = new Set<() => void>();
    function notifyDataChange() {
      for (const cb of dataListeners) {
        try {
          cb();
        } catch (e) {
          console.error('A data-change listener failed', e);
        }
      }
    }

    function announceDataChange() {
      deps.channel.post({ type: 'reload', reason: 'data' });
      notifyDataChange();
    }

    /**
     * Brings the game up to date with the data: the ledger entries and streak freezes now owed. Run
     * after every write and sync, and safe to run twice, as the ids it writes come from their keys.
     * The game never fails a write, so a failure is logged and the next settle catches up. It writes
     * through `writeRecords`, not `putMany`, so it never settles its own writes. Resolves to whether
     * it wrote anything. A gain is announced only while the app is still unlocked: a lock clears it.
     */
    async function runSettle(): Promise<boolean> {
      try {
        const { records, gain } = gameUpdates(get().data, gameContext(get(), nowIsoString()));
        if (records.length === 0) return false;
        await writeRecords(records);
        if (gain && !seedingDemo && get().phase === 'unlocked') {
          set({ gameGain: { id: ++lastGainId, gain } });
        }
        return true;
      } catch (e) {
        console.error('Updating the game layer failed', e);
        return false;
      }
    }

    /** The settle last queued. `runSettle` never rejects, so the queue never stalls on a failure. */
    let settling: Promise<boolean> = Promise.resolve(false);
    /**
     * Settles one after another, so each sees what the one before wrote. Two triggers can sync at
     * once (`visibilitychange` with `focus`, or with Android's resume), and settles computed on the
     * same data would announce the same gain twice.
     */
    const settle = (): Promise<boolean> => (settling = settling.then(runSettle, runSettle));

    function requireReal(action: string) {
      if (get().namespace === 'demo') throw new Error(`Demo data can't ${action}.`);
    }

    async function readBiometric(): Promise<'ok' | 'cancelled' | 'changed'> {
      const s = session;
      // Not while the PIN is being checked or is opening the app: one unlock at a time.
      if (
        !s ||
        !deps.biometric ||
        get().phase !== 'locked' ||
        get().biometric !== 'on' ||
        get().checking
      ) {
        return 'cancelled';
      }
      const result = await deps.biometric.read(biometricSlot(get().namespace));
      if (result.status === 'cancelled') return 'cancelled';
      const key = result.status === 'ok' ? await importDataKey(result.secret) : null;
      if (!key) {
        // The copy is gone: stop asking, and leave the PIN as the way in. A failure to tidy up
        // (already logged) still stops asking for now; the next start tries again.
        await get()
          .disableBiometric()
          .catch(() => set({ biometric: 'off' }));
        return 'changed';
      }
      // The PIN may have opened the app meanwhile, or be opening it now (the phase stays locked
      // until the data is loaded), or everything was erased.
      if (session !== s || get().phase !== 'locked' || get().checking) return 'cancelled';
      // Opening can take a moment (an upgrade may run): the PIN waits meanwhile, as it does for
      // its own check, so the two never open the data at once.
      set({ checking: true });
      try {
        await s.backend.meta.delete(THROTTLE_KEY);
        set({ failedAttempts: 0, lockedUntil: null });
        await openWith(key);
        return 'ok';
      } finally {
        set({ checking: false });
      }
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
      gameGain: null,

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
          gameGain: null,
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
            gameGain: null,
          });
          // The demo's history is celebrated by no one: the settle on the way in publishes no gain,
          // not even for the instant before a later clear, which a screen could already have shown.
          seedingDemo = true;
          try {
            await openWith(key);
          } finally {
            seedingDemo = false;
          }
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
        set({ phase: 'locked', data: emptySnapshot(), skipped: [], gameGain: null });
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
        if (get().biometric === 'on') return;
        const slot = biometricSlot(namespace);
        try {
          // The raw key leaves memory only for the Keystore slot that biometrics guard.
          const raw = new Uint8Array(await crypto.subtle.exportKey('raw', s.key));
          try {
            await deps.biometric.store(slot, bytesToBase64(raw));
          } finally {
            raw.fill(0);
          }
          await s.backend.meta.put(BIOMETRIC_KEY, true);
        } catch (e) {
          // The phone's own wording stays in the log; no copy stays behind with it off.
          console.error('Turning biometric unlock on failed', e);
          await deps.biometric.forget(slot).catch(() => {});
          throw new Error(
            `Fingerprint or face unlock couldn't be turned on. Try again, or keep using your ${lockMode === 'pin' ? 'PIN' : 'passphrase'}.`,
            { cause: e },
          );
        }
        set({ biometric: 'on' });
      },

      async disableBiometric() {
        const s = session;
        if (!s) throw new Error('Call boot() first');
        if (deps.biometric) {
          try {
            // The copy first: if that fails it stays on, rather than off with a copy left behind.
            await deps.biometric.forget(biometricSlot(get().namespace));
            await s.backend.meta.delete(BIOMETRIC_KEY);
          } catch (e) {
            console.error('Turning biometric unlock off failed', e);
            throw new Error("Fingerprint or face unlock couldn't be turned off. Try again.", {
              cause: e,
            });
          }
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

      async putMany(items, remove = []) {
        if (items.length === 0 && remove.length === 0) return;
        await writeRecords(items, remove);
        await settle();
        announceDataChange();
      },

      async sync() {
        const today = deps.today();
        set({ today });
        if (get().phase !== 'unlocked' || !session?.repo) return;
        const due = dueGenerated(get().data, today);
        if (due.length > 0) await writeRecords(due);
        const settled = await settle();
        if (due.length > 0 || settled) announceDataChange();
      },

      async refresh() {
        if (get().phase !== 'unlocked' || !session?.repo) return;
        const loaded = await loadOrRefuse(session.repo);
        if (loaded) set({ data: loaded.snapshot, skipped: loaded.skipped });
      },

      async remove(table, id) {
        await unlocked().repo.remove(table, id);
        const data = get().data;
        const rows = data.tables[table] as Array<{ id: string }>;
        set({
          data: { ...data, tables: { ...data.tables, [table]: rows.filter((r) => r.id !== id) } },
        });
        await settle();
        announceDataChange();
      },

      async restoreSnapshot(snapshot) {
        const s = unlocked();
        await s.repo.replaceAll(snapshot);
        set({ data: snapshot, skipped: [] });
        await settle();
        deps.channel.post({ type: 'reload', reason: 'restore' });
        notifyDataChange();
      },

      onDataChange(cb) {
        dataListeners.add(cb);
        return () => void dataListeners.delete(cb);
      },

      async getPrivate<T>(name: string) {
        const { backend, key } = unlocked();
        const sealed = await backend.meta.get<{ iv: string; data: string }>(name);
        if (!sealed) return null;
        return decryptRecord<T>(key, name, {
          iv: base64ToBytes(sealed.iv),
          ciphertext: base64ToBytes(sealed.data).buffer,
        });
      },

      async putPrivate(name, value) {
        requireReal('keep an account');
        const { backend, key } = unlocked();
        const { iv, ciphertext } = await encryptRecord(key, name, value);
        await backend.meta.put(name, {
          iv: bytesToBase64(iv),
          data: bytesToBase64(new Uint8Array(ciphertext)),
        });
      },

      async deletePrivate(name) {
        await unlocked().backend.meta.delete(name);
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

      async startOver() {
        const { data } = get();
        await get().restoreSnapshot(freshStart(data, deps.today(), nowIsoString()));
      },
    };
  });
}
