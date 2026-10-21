import { migrateTables, type RawTables } from '@/domain/migrations';
import {
  CURRENT_SCHEMA_VERSION,
  emptySnapshot,
  SCHEMAS,
  SchemaVersionError,
  SnapshotSchema,
  TABLES,
  type DataSnapshot,
  type EntityOf,
  type RecordKey,
  type TableName,
  type TableRecord,
} from '@/domain/snapshot';
import { V10_DROPPED_TABLES } from '@/domain/upgrades/v10Accounts';
import { decryptRecord, encryptRecord } from './crypto';
import {
  DATA_VERSION_KEY,
  DataVersionChangedError,
  dataVersionOf,
  type RecordRow,
  type StorageBackend,
  type StoredKey,
} from './storage';

/** A table whose rows an upgrade still reads, though the app no longer has it. */
type DroppedTable = (typeof V10_DROPPED_TABLES)[number];

/** A stored record that could not be loaded; reported to the user instead of breaking boot. */
export type SkippedRecord = {
  table: TableName | DroppedTable;
  id: string;
  reason: 'decrypt' | 'invalid';
};

export type LoadResult = { snapshot: DataSnapshot; skipped: SkippedRecord[] };

/** Storage seen by the app: encrypted records over whichever backend the platform provides. */
export interface Repository {
  loadAll(): Promise<LoadResult>;
  put<T extends TableName>(table: T, record: EntityOf<T>): Promise<void>;
  /** Write several records, and remove the `remove` ones, in one transaction; all or nothing. */
  putMany(items: TableRecord[], remove?: RecordKey[]): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  /** Replace every record at once (restore). Validates first; never leaves partial data. */
  replaceAll(snapshot: DataSnapshot): Promise<void>;
}

const slot = (table: string, id: string) => `${table}:${id}`;
const isTable = (t: string): t is TableName => (TABLES as readonly string[]).includes(t);
const isDropped = (t: string): t is DroppedTable =>
  (V10_DROPPED_TABLES as readonly string[]).includes(t);

/** Whether a decrypted value is a record naming the slot it was stored in. */
const namesSlot = (value: unknown, id: string): boolean =>
  typeof value === 'object' && value !== null && (value as { id?: unknown }).id === id;

const idOf = (value: unknown): string => {
  const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : null;
  return typeof id === 'string' ? id : '';
};

async function toRow(
  key: CryptoKey,
  table: TableName,
  record: { id: string; updatedAt: string },
): Promise<RecordRow> {
  const payload = await encryptRecord(key, slot(table, record.id), record);
  return { table, id: record.id, updatedAt: record.updatedAt, ...payload };
}

/**
 * The last load queued on each backend; it never rejects, so one failed load does not stop the
 * next. Kept per backend, not per repository: each unlock makes its own repository.
 */
const loading = new WeakMap<StorageBackend, Promise<unknown>>();

/**
 * Runs the loads of one backend one after another. A load reads the data version, then the rows,
 * then may write the upgrade: two at once (a PIN and a fingerprint unlocking together) could
 * upgrade rows the other had already upgraded, and destroy them.
 */
function oneAtATime<T>(backend: StorageBackend, load: () => Promise<T>): Promise<T> {
  const result = (loading.get(backend) ?? Promise.resolve()).then(load);
  loading.set(
    backend,
    result.catch(() => {}),
  );
  return result;
}

/** How many times a load starts over when another connection upgraded the data meanwhile. */
const LOAD_ATTEMPTS = 3;

export function createRepository(backend: StorageBackend, key: CryptoKey): Repository {
  const { meta, records } = backend;

  async function storedVersion(): Promise<number> {
    return dataVersionOf(await meta.get<unknown>(DATA_VERSION_KEY));
  }

  /** Everything stored, upgraded to the current version: what `loadAll` returns. */
  async function load(attempt: number): Promise<LoadResult> {
    const fromVersion = await storedVersion();
    // An older build must not open, and so rewrite, what a newer one saved: it would drop what it
    // does not know. Nothing is read or written.
    if (fromVersion > CURRENT_SCHEMA_VERSION) throw new SchemaVersionError(fromVersion);
    const skipped: SkippedRecord[] = [];

    // 1. Decrypt, keeping the app's tables and the ones an upgrade retires. A row that fails
    // never reaches the upgrade, so it is never among the rows removed below.
    const raw: RawTables = {};
    const read: StoredKey[] = [];
    for (const row of await records.all()) {
      if (!isTable(row.table) && !isDropped(row.table)) continue; // from a newer app version
      let value: unknown;
      try {
        value = await decryptRecord(key, slot(row.table, row.id), row);
      } catch {
        skipped.push({ table: row.table, id: row.id, reason: 'decrypt' });
        continue;
      }
      // A record naming another slot is left where it is, like any other that does not load.
      if (!namesSlot(value, row.id)) {
        skipped.push({ table: row.table, id: row.id, reason: 'invalid' });
        continue;
      }
      (raw[row.table] ??= []).push(value);
      read.push({ table: row.table, id: row.id });
    }

    // 2. Upgrade every table at once, the one path an account's copy takes too: v10 builds
    // accounts out of the profile and the card debts.
    const upgraded = migrateTables(raw, fromVersion);

    // 3. Validate.
    const snapshot = emptySnapshot();
    const valid: TableRecord[] = [];
    const invalid: SkippedRecord[] = [];
    for (const table of TABLES) {
      for (const value of upgraded[table] ?? []) {
        const parsed = SCHEMAS[table].safeParse(value);
        if (!parsed.success) {
          invalid.push({ table, id: idOf(value), reason: 'invalid' });
          continue;
        }
        (snapshot.tables[table] as unknown[]).push(parsed.data);
        valid.push({ table, record: parsed.data } as TableRecord);
      }
    }
    skipped.push(...invalid);

    // 4. Persist the upgrade once, in one write: every valid record, and the removal of the rows
    // read that are gone (a retired table's, a card debt that is an account now). A row that
    // did not load stays untouched for later recovery, and so does one whose record the upgrade
    // made into something that does not load (same id): nothing replaces it.
    if (fromVersion < CURRENT_SCHEMA_VERSION) {
      const written = new Set(valid.map((v) => slot(v.table, v.record.id)));
      const leftOut = new Set(invalid.map((s) => s.id));
      const remove = read.filter((k) => !written.has(slot(k.table, k.id)) && !leftOut.has(k.id));
      const rows = await Promise.all(valid.map((v) => toRow(key, v.table, v.record)));
      try {
        // Only onto the version the rows were read at: another connection (another tab) may
        // have upgraded them since, and then what was read is stale.
        await records.write(rows, {
          replace: false,
          dataVersion: CURRENT_SCHEMA_VERSION,
          remove,
          ifDataVersion: fromVersion,
        });
      } catch (e) {
        // Nothing was written: start over from what is stored now.
        if (e instanceof DataVersionChangedError && attempt < LOAD_ATTEMPTS) {
          return load(attempt + 1);
        }
        throw e;
      }
    }
    return { snapshot, skipped };
  }

  // Rows are always encrypted before `records.write`: IndexedDB transactions auto-commit while
  // waiting on non-IndexedDB promises such as crypto.subtle.
  return {
    loadAll() {
      return oneAtATime(backend, () => load(1));
    },

    async put<T extends TableName>(table: T, record: EntityOf<T>) {
      const valid = SCHEMAS[table].parse(record);
      await records.write([await toRow(key, table, valid)], { replace: false });
    },

    async putMany(items: TableRecord[], remove: RecordKey[] = []) {
      const valid = items.map(({ table, record }) => ({
        table,
        record: SCHEMAS[table].parse(record),
      }));
      const rows = await Promise.all(valid.map((v) => toRow(key, v.table, v.record)));
      await records.write(rows, { replace: false, remove });
    },

    async remove(table, id) {
      await records.remove(table, id);
    },

    async replaceAll(snapshot: DataSnapshot) {
      const valid = SnapshotSchema.parse(snapshot);
      const rows: RecordRow[] = [];
      for (const table of TABLES) {
        for (const record of valid.tables[table]) rows.push(await toRow(key, table, record));
      }
      await records.write(rows, { replace: true, dataVersion: CURRENT_SCHEMA_VERSION });
    },
  };
}
