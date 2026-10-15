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
import type { FunancialDb, RecordRow } from './db';
import type { Repository, SkippedRecord } from './repository';

const DATA_VERSION_KEY = 'dataVersion';
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

export function createWebRepository(db: FunancialDb, key: CryptoKey): Repository {
  async function storedVersion(): Promise<number> {
    const v = (await db.meta.get(DATA_VERSION_KEY))?.value;
    return typeof v === 'number' ? v : 1; // rows written before versioning are v1
  }

  async function writeRows(rows: RecordRow[], opts: { clear: boolean }) {
    // Rows are encrypted before the transaction: IndexedDB transactions auto-commit while
    // waiting on non-IndexedDB promises such as crypto.subtle.
    await db.transaction('rw', db.records, db.meta, async () => {
      if (opts.clear) await db.records.clear();
      await db.records.bulkPut(rows);
      await db.meta.put({ key: DATA_VERSION_KEY, value: CURRENT_SCHEMA_VERSION });
    });
  }

  return {
    async loadAll() {
      const fromVersion = await storedVersion();
      const snapshot = emptySnapshot();
      const skipped: SkippedRecord[] = [];
      const upgraded: TableRecord[] = [];
      for (const row of await db.records.toArray()) {
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
        await writeRows(rows, { clear: false });
      }
      return { snapshot, skipped };
    },

    async put<T extends TableName>(table: T, record: EntityOf<T>) {
      const valid = SCHEMAS[table].parse(record);
      await db.records.put(await toRow(key, table, valid));
    },

    async putMany(items: TableRecord[]) {
      const valid = items.map(({ table, record }) => ({
        table,
        record: SCHEMAS[table].parse(record),
      }));
      const rows = await Promise.all(valid.map((v) => toRow(key, v.table, v.record)));
      await db.transaction('rw', db.records, () => db.records.bulkPut(rows));
    },

    async remove(table, id) {
      await db.records.delete([table, id]);
    },

    async replaceAll(snapshot: DataSnapshot) {
      const valid = SnapshotSchema.parse(snapshot);
      const rows: RecordRow[] = [];
      for (const table of TABLES) {
        for (const record of valid.tables[table]) rows.push(await toRow(key, table, record));
      }
      await writeRows(rows, { clear: true });
    },
  };
}
