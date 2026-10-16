import { Dexie, type Table } from 'dexie';
import type { MetaStore } from './meta';
import {
  DATA_VERSION_KEY,
  type RecordRow,
  type RecordStore,
  type StorageProvider,
} from './storage';

/** Real data and demo data live in separate databases so leaving demo can never touch real. */
export type Namespace = 'real' | 'demo';

export const DEFAULT_DB_PREFIX = 'funancial';

export type MetaRow = { key: string; value: unknown };

export class FunancialDb extends Dexie {
  declare records: Table<RecordRow, [string, string]>;
  declare meta: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ records: '[table+id], table', meta: '&key' });
  }
}

export function dbName(ns: Namespace, prefix = DEFAULT_DB_PREFIX): string {
  return `${prefix}-${ns}`;
}

export function openDb(ns: Namespace, prefix = DEFAULT_DB_PREFIX): FunancialDb {
  return new FunancialDb(dbName(ns, prefix));
}

export function deleteDb(ns: Namespace, prefix = DEFAULT_DB_PREFIX): Promise<void> {
  return Dexie.delete(dbName(ns, prefix));
}

export function dexieMetaStore(db: FunancialDb): MetaStore {
  return {
    get: async <T>(key: string) => (await db.meta.get(key))?.value as T | undefined,
    put: async (key, value) => void (await db.meta.put({ key, value })),
    putIfAbsent: (key, value) =>
      db.transaction('rw', db.meta, async () => {
        if ((await db.meta.get(key)) !== undefined) return false;
        await db.meta.add({ key, value });
        return true;
      }),
    delete: (key) => db.meta.delete(key),
  };
}

function dexieRecordStore(db: FunancialDb): RecordStore {
  return {
    all: () => db.records.toArray(),
    write: (rows, { replace, dataVersion, remove = [] }) =>
      db.transaction('rw', db.records, db.meta, async () => {
        if (replace) await db.records.clear();
        await db.records.bulkDelete(remove.map((r) => [r.table, r.id]));
        await db.records.bulkPut(rows);
        if (dataVersion !== undefined)
          await db.meta.put({ key: DATA_VERSION_KEY, value: dataVersion });
      }),
    remove: (table, id) => db.records.delete([table, id]),
  };
}

/** The web backend: one IndexedDB database per namespace, named `<prefix>-<namespace>`. */
export function dexieStorage(prefix = DEFAULT_DB_PREFIX): StorageProvider {
  return {
    async open(ns) {
      const db = openDb(ns, prefix);
      await db.open();
      return {
        meta: dexieMetaStore(db),
        records: dexieRecordStore(db),
        close: async () => db.close(),
      };
    },
    remove: (ns) => deleteDb(ns, prefix),
  };
}
