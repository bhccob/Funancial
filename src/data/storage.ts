import type { Bytes } from './crypto';
import type { Namespace } from './db';
import type { MetaStore } from './meta';

/** Meta key holding the schema version the stored rows were written at. */
export const DATA_VERSION_KEY = 'dataVersion';

/**
 * One stored row's slot. Wider than the domain's `RecordKey`: storage also holds rows of tables
 * the app no longer has (or does not have yet), and an upgrade that retires a table removes them.
 */
export type StoredKey = { table: string; id: string };

/** One encrypted entity. Only the slot (`table`, `id`) and `updatedAt` are in the clear. */
export type RecordRow = StoredKey & {
  updatedAt: string;
  iv: Bytes;
  ciphertext: ArrayBuffer;
};

export interface RecordStore {
  all(): Promise<RecordRow[]>;
  /**
   * Insert or replace rows in one transaction. `replace` drops every other row first; `remove`
   * deletes those rows and `dataVersion` is written to meta, in the same transaction.
   */
  write(
    rows: RecordRow[],
    opts: { replace: boolean; dataVersion?: number; remove?: StoredKey[] },
  ): Promise<void>;
  remove(table: string, id: string): Promise<void>;
}

/** One open namespace: its unencrypted metadata and its encrypted records. */
export interface StorageBackend {
  meta: MetaStore;
  records: RecordStore;
  close(): Promise<void>;
}

/** Where a backend comes from. Web uses IndexedDB; native (M3) uses SQLCipher. */
export interface StorageProvider {
  open(ns: Namespace): Promise<StorageBackend>;
  remove(ns: Namespace): Promise<void>;
}
