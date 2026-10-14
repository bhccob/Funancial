import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  backupFileName,
  createBackup as encryptBackup,
  exportFileName,
  exportPlainJson,
  readBackup,
} from '@/data/backup';
import { deleteDb, dexieMetaStore, openDb, type FunancialDb, type Namespace } from '@/data/db';
import { buildDemoSnapshot } from '@/data/demoSeed';
import {
  clearVaultSecret,
  createVault,
  getLockMode,
  KDF_ITERATIONS,
  setVaultSecret,
  unlockVault,
  validateSecret,
  VaultExistsError,
  WrongSecretError,
  type LockMode,
  type SecretKind,
} from '@/data/keys';
import type { MetaStore } from '@/data/meta';
import type { Repository, SkippedRecord } from '@/data/repository';
import { createWebRepository } from '@/data/webRepository';
import { toLocalDate, type LocalDate } from '@/domain/dates';
import { defaultSettings } from '@/domain/entities';
import { dueGenerated } from '@/domain/sync';
import {
  emptySnapshot,
  type DataSnapshot,
  type EntityOf,
  type TableName,
  type TableRecord,
} from '@/domain/snapshot';
import { tabChannel, type SyncMessage } from '@/lib/broadcast';
import { safeStorage, type SafeStorage } from '@/lib/safeStorage';

export type Phase = 'booting' | 'unavailable' | 'welcome' | 'locked' | 'unlocked';

export interface AppDeps {
  kdfIterations: number;
  today(): LocalDate;
  now(): number;
  storage: SafeStorage;
  channel: { post(m: SyncMessage): void };
  /** Whether storage is already persistent. Must not prompt. */
  storageStatus(): Promise<boolean>;
  /** Ask the browser to keep our storage. May prompt; only call after a user action. */
  requestPersistence(): Promise<boolean>;
  db: { open(ns: Namespace): FunancialDb; remove(ns: Namespace): Promise<void> };
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

  boot(): Promise<void>;
  startFresh(): Promise<void>;
  startDemo(): Promise<void>;
  exitDemo(): Promise<void>;
  unlock(secret: string): Promise<'ok' | 'wrong' | 'throttled' | 'busy'>;
  verifySecret(secret: string): Promise<boolean>;
  lock(): void;
  setSecret(secret: string, kind: SecretKind): Promise<void>;
  clearSecret(): Promise<void>;
  put<T extends TableName>(table: T, record: EntityOf<T>): Promise<void>;
  /** Several records in one transaction (all or nothing). */
  putMany(items: TableRecord[]): Promise<void>;
  /** Reload data from storage, e.g. after another tab wrote. */
  refresh(): Promise<void>;
  /** Refresh `today` and create what has come due (subscription charges, expected salary). */
  sync(): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  createBackup(passphrase: string): Promise<{ fileName: string; text: string }>;
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

/** Open database + vault for the active namespace. Kept out of state: keys never hit React. */
type Session = { db: FunancialDb; meta: MetaStore; repo: Repository | null; key: CryptoKey | null };

export function createAppStore(deps: AppDeps): StoreApi<AppState> {
  let session: Session | null = null;

  const nowIsoString = () => new Date(deps.now()).toISOString();
  /** A throttle deadline that has passed no longer applies. */
  const activeUntil = (until: number | null) =>
    until !== null && deps.now() < until ? until : null;
  const readNamespace = (): Namespace =>
    deps.storage.get(NAMESPACE_KEY) === 'demo' ? 'demo' : 'real';

  function closeSession() {
    session?.db.close();
    session = null;
  }

  async function openSession(ns: Namespace): Promise<Session> {
    closeSession();
    const db = deps.db.open(ns);
    await db.open();
    session = { db, meta: dexieMetaStore(db), repo: null, key: null };
    return session;
  }

  function unlocked(): Session & { repo: Repository; key: CryptoKey } {
    if (!session?.repo || !session.key) throw new Error('Funancial is locked');
    return session as Session & { repo: Repository; key: CryptoKey };
  }

  return createStore<AppState>()((set, get) => {
    async function openWith(key: CryptoKey) {
      if (!session) throw new Error('No open database');
      session.key = key;
      session.repo = createWebRepository(session.db, key);
      const { snapshot, skipped } = await session.repo.loadAll();
      set({ data: snapshot, skipped, phase: 'unlocked' });
      await get().sync();
    }

    function requireReal(action: string) {
      if (get().namespace === 'demo') throw new Error(`Demo data can't ${action}.`);
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
          const lockMode = await getLockMode(s.meta);
          const throttle = await s.meta.get<Throttle>(THROTTLE_KEY);
          set({
            lockMode,
            failedAttempts: throttle?.failedAttempts ?? 0,
            lockedUntil: activeUntil(throttle?.lockedUntil ?? null),
          });
          if (lockMode === null) set({ phase: 'welcome' });
          else if (lockMode === 'device') await openWith(await unlockVault(s.meta));
          else set({ phase: 'locked' });
        } catch {
          closeSession();
          set({ phase: 'unavailable' });
        }
      },

      async startFresh() {
        if (!session) throw new Error('Call boot() first');
        let key: CryptoKey;
        try {
          key = await createVault(session.meta);
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
        closeSession();
        try {
          await deps.db.remove('demo');
          const s = await openSession('demo');
          const key = await createVault(s.meta);
          await createWebRepository(s.db, key).replaceAll(snapshot);
          deps.storage.set(NAMESPACE_KEY, 'demo');
          set({ namespace: 'demo', lockMode: 'device', failedAttempts: 0, lockedUntil: null });
          await openWith(key);
        } catch (e) {
          closeSession();
          await deps.db.remove('demo').catch(() => {});
          deps.storage.remove(NAMESPACE_KEY);
          await get().boot();
          throw e;
        }
        deps.channel.post({ type: 'reload', reason: 'namespace' });
      },

      async exitDemo() {
        closeSession();
        await deps.db.remove('demo');
        deps.storage.remove(NAMESPACE_KEY);
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
          const key = await unlockVault(s.meta, secret);
          await s.meta.delete(THROTTLE_KEY);
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
          await s.meta.put(THROTTLE_KEY, next);
          return 'wrong';
        } finally {
          set({ checking: false });
        }
      },

      async verifySecret(secret) {
        if (!session || get().lockMode === 'device') return true;
        try {
          await unlockVault(session.meta, secret);
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
        await setVaultSecret(s.meta, s.key, secret, kind, { iterations: deps.kdfIterations });
        set({ lockMode: kind });
        deps.channel.post({ type: 'reload', reason: 'secret' });
      },

      async clearSecret() {
        requireReal('be unlocked');
        const s = unlocked();
        await clearVaultSecret(s.meta, s.key);
        set({ lockMode: 'device' });
        deps.channel.post({ type: 'reload', reason: 'secret' });
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
        const at = now.toISOString();
        const settings = get().data.tables.settings[0] ?? defaultSettings(at);
        // Best effort: when storage is full the backup matters more than remembering its date.
        await get()
          .put('settings', { ...settings, lastBackupAt: at, updatedAt: at })
          .catch(() => {});
        return { fileName: backupFileName(now), text };
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
        closeSession();
        await deps.db.remove(ns);
        deps.storage.remove(NAMESPACE_KEY);
        deps.channel.post({ type: 'reload', reason: 'delete' });
        await get().boot();
      },
    };
  });
}

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

export const appStore = createAppStore({
  kdfIterations: KDF_ITERATIONS,
  today: () => toLocalDate(new Date()),
  now: () => Date.now(),
  storage: safeStorage,
  channel: tabChannel(),
  storageStatus: persistentStorageStatus,
  requestPersistence: requestPersistentStorage,
  db: { open: (ns) => openDb(ns), remove: (ns) => deleteDb(ns) },
});
