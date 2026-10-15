import { migrateRecord } from '@/domain/migrations';
import {
  CURRENT_SCHEMA_VERSION,
  emptySnapshot,
  SCHEMAS,
  SnapshotSchema,
  TABLES,
  type DataSnapshot,
  type EntityOf,
  type TableName,
  type TableRecord,
} from '@/domain/snapshot';
import { decryptRecord, encryptRecord } from './crypto';
import { DATA_VERSION_KEY, type RecordRow, type StorageBackend } from './storage';

/** A stored record that could not be loaded; reported to the user instead of breaking boot. */
export type SkippedRecord = { table: TableName; id: string; reason: 'decrypt' | 'invalid' };

export type LoadResult = { snapshot: DataSnapshot; skipped: SkippedRecord[] };

/** Storage seen by the app: encrypted records over whichever backend the platform provides. */
export interface Repository {
  loadAll(): Promise<LoadResult>;
  put<T extends TableName>(table: T, record: EntityOf<T>): Promise<void>;
  /** Write several records in one transaction; all or nothing. */
  putMany(items: TableRecord[]): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  /** Replace every record at once (restore). Validates first; never leaves partial data. */
  replaceAll(snapshot: DataSnapshot): Promise<void>;
}

const slot = (table: TableName, id: string) => `${table}:${id}`;
const isTable = (t: string): t is TableName => (TABLES as readonly string[]).includes(t);

async function toRow(
  key: CryptoKey,
  table: TableName,
  record: { id: string; updatedAt: string },
): Promise<RecordRow> {
  const payload = await encryptRecord(key, slot(table, record.id), record);
  return { table, id: record.id, updatedAt: record.updatedAt, ...payload };
}

export function createRepository(backend: StorageBackend, key: CryptoKey): Repository {
  const { meta, records } = backend;

  async function storedVersion(): Promise<number> {
    const v = await meta.get<unknown>(DATA_VERSION_KEY);
    return typeof v === 'number' ? v : 1; // rows written before versioning are v1
  }

  // Rows are always encrypted before `records.write`: IndexedDB transactions auto-commit while
  // waiting on non-IndexedDB promises such as crypto.subtle.
  return {
    async loadAll() {
      const fromVersion = await storedVersion();
      const snapshot = emptySnapshot();
      const skipped: SkippedRecord[] = [];
      const upgraded: TableRecord[] = [];
      for (const row of await records.all()) {
        if (!isTable(row.table)) continue; // a table from a newer app version
        let value: unknown;
        try {
          value = await decryptRecord(key, slot(row.table, row.id), row);
        } catch {
          skipped.push({ table: row.table, id: row.id, reason: 'decrypt' });
          continue;
        }
        const parsed = SCHEMAS[row.table].safeParse(migrateRecord(row.table, value, fromVersion));
        if (!parsed.success || parsed.data.id !== row.id) {
          skipped.push({ table: row.table, id: row.id, reason: 'invalid' });
          continue;
        }
        (snapshot.tables[row.table] as unknown[]).push(parsed.data);
        if (fromVersion < CURRENT_SCHEMA_VERSION) {
          upgraded.push({ table: row.table, record: parsed.data } as TableRecord);
        }
      }
      if (fromVersion < CURRENT_SCHEMA_VERSION) {
        // Persist the upgrade once; skipped rows stay untouched for later recovery.
        const rows = await Promise.all(upgraded.map((u) => toRow(key, u.table, u.record)));
        await records.write(rows, { replace: false, dataVersion: CURRENT_SCHEMA_VERSION });
      }
      return { snapshot, skipped };
    },

    async put<T extends TableName>(table: T, record: EntityOf<T>) {
      const valid = SCHEMAS[table].parse(record);
      await records.write([await toRow(key, table, valid)], { replace: false });
    },

    async putMany(items: TableRecord[]) {
      const valid = items.map(({ table, record }) => ({
        table,
        record: SCHEMAS[table].parse(record),
      }));
      const rows = await Promise.all(valid.map((v) => toRow(key, v.table, v.record)));
      await records.write(rows, { replace: false });
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
