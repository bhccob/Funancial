import type { DataSnapshot, EntityOf, TableName, TableRecord } from '@/domain/snapshot';

/** A stored record that could not be loaded; reported to the user instead of breaking boot. */
export type SkippedRecord = { table: TableName; id: string; reason: 'decrypt' | 'invalid' };

export type LoadResult = { snapshot: DataSnapshot; skipped: SkippedRecord[] };

/** Storage seen by the app. Web uses encrypted IndexedDB; native (M3) uses SQLCipher. */
export interface Repository {
  loadAll(): Promise<LoadResult>;
  put<T extends TableName>(table: T, record: EntityOf<T>): Promise<void>;
  /** Write several records in one transaction; all or nothing. */
  putMany(items: TableRecord[]): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  /** Replace every record at once (restore). Validates first; never leaves partial data. */
  replaceAll(snapshot: DataSnapshot): Promise<void>;
}
