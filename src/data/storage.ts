import type { TableName } from '@/domain/snapshot';
import type { Bytes } from './crypto';
import type { Namespace } from './db';
import type { MetaStore } from './meta';

/** One encrypted entity. Only the slot (`table`, `id`) and `updatedAt` are in the clear. */
export type RecordRow = {
  table: TableName;
  id: string;
  updatedAt: string;
  iv: Bytes;
  ciphertext: ArrayBuffer;
};

export interface RecordStore {
  all(): Promise<RecordRow[]>;
  /**
   * Insert or replace rows in one transaction. `replace` drops every other row first;
   * `dataVersion` is written to meta in the same transaction.
   */
  write(rows: RecordRow[], opts: { replace: boolean; dataVersion?: number }): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
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
