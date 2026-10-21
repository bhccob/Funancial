import { memoryMetaStore } from '@/data/meta';
import {
  DATA_VERSION_KEY,
  DataVersionChangedError,
  dataVersionOf,
  type RecordRow,
  type StorageBackend,
} from '@/data/storage';

/** A hand-written in-memory backend: a `Map` of rows plus a memory meta store. */
export function memoryStorage(): StorageBackend {
  const rows = new Map<string, RecordRow>();
  const meta = memoryMetaStore();
  const slot = (table: string, id: string) => `${table}:${id}`;
  return {
    meta,
    records: {
      all: async () => [...rows.values()],
      write: async (next, { replace, dataVersion, remove = [], ifDataVersion }) => {
        if (ifDataVersion !== undefined) {
          const found = dataVersionOf(await meta.get(DATA_VERSION_KEY));
          if (found !== ifDataVersion) throw new DataVersionChangedError(ifDataVersion, found);
        }
        if (replace) rows.clear();
        for (const r of remove) rows.delete(slot(r.table, r.id));
        for (const row of next) rows.set(slot(row.table, row.id), row);
        if (dataVersion !== undefined) await meta.put(DATA_VERSION_KEY, dataVersion);
      },
      remove: async (table, id) => void rows.delete(slot(table, id)),
    },
    close: async () => {},
  };
}
