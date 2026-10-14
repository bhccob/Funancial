import {
  emptySnapshot,
  SCHEMAS,
  SnapshotSchema,
  TABLES,
  type DataSnapshot,
  type EntityOf,
  type TableName,
} from '@/domain/snapshot';
import { decryptRecord, encryptRecord } from './crypto';
import type { FunancialDb, RecordRow } from './db';
import type { Repository, SkippedRecord } from './repository';

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
  return {
    async loadAll() {
      const snapshot = emptySnapshot();
      const skipped: SkippedRecord[] = [];
      for (const row of await db.records.toArray()) {
        if (!isTable(row.table)) continue; // a table from a newer app version
        let value: unknown;
        try {
          value = await decryptRecord(key, slot(row.table, row.id), row);
        } catch {
          skipped.push({ table: row.table, id: row.id, reason: 'decrypt' });
          continue;
        }
        const parsed = SCHEMAS[row.table].safeParse(value);
        if (!parsed.success || parsed.data.id !== row.id) {
          skipped.push({ table: row.table, id: row.id, reason: 'invalid' });
          continue;
        }
        (snapshot.tables[row.table] as unknown[]).push(parsed.data);
      }
      return { snapshot, skipped };
    },

    async put<T extends TableName>(table: T, record: EntityOf<T>) {
      const valid = SCHEMAS[table].parse(record);
      await db.records.put(await toRow(key, table, valid));
    },

    async remove(table, id) {
      await db.records.delete([table, id]);
    },

    async replaceAll(snapshot: DataSnapshot) {
      const valid = SnapshotSchema.parse(snapshot);
      // Encrypt everything before the transaction: IndexedDB transactions auto-commit
      // when they wait on non-IndexedDB promises such as crypto.subtle.
      const rows: RecordRow[] = [];
      for (const table of TABLES) {
        for (const record of valid.tables[table]) rows.push(await toRow(key, table, record));
      }
      await db.transaction('rw', db.records, async () => {
        await db.records.clear();
        await db.records.bulkPut(rows);
      });
    },
  };
}
