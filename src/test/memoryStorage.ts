import { memoryMetaStore } from '@/data/meta';
import type { RecordRow, StorageBackend } from '@/data/storage';

/** A hand-written in-memory backend: a `Map` of rows plus a memory meta store. */
export function memoryStorage(): StorageBackend {
  const rows = new Map<string, RecordRow>();
  const meta = memoryMetaStore();
  const slot = (table: string, id: string) => `${table}:${id}`;
  return {
    meta,
    records: {
      all: async () => [...rows.values()],
      write: async (next, { replace, dataVersion }) => {
        if (replace) rows.clear();
        for (const row of next) rows.set(slot(row.table, row.id), row);
        if (dataVersion !== undefined) await meta.put('dataVersion', dataVersion);
      },
      remove: async (table, id) => void rows.delete(slot(table, id)),
    },
    close: async () => {},
  };
}
