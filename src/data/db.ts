import { Dexie, type Table } from 'dexie';
import type { TableName } from '@/domain/snapshot';
import type { Bytes } from './crypto';
import type { MetaStore } from './meta';

/** Real data and demo data live in separate databases so leaving demo can never touch real. */
export type Namespace = 'real' | 'demo';

export const DEFAULT_DB_PREFIX = 'funancial';

/** One encrypted entity. Only the slot (`table`, `id`) and `updatedAt` are in the clear. */
export type RecordRow = {
  table: TableName;
  id: string;
  updatedAt: string;
  iv: Bytes;
  ciphertext: ArrayBuffer;
};

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
    delete: (key) => db.meta.delete(key),
  };
}
