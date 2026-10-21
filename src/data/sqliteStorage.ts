import { base64ToBytes, bytesToBase64 } from './crypto';
import { dbName } from './db';
import type { MetaStore } from './meta';
import {
  DATA_VERSION_KEY,
  DataVersionChangedError,
  dataVersionOf,
  type RecordRow,
  type RecordStore,
  type StorageBackend,
  type StorageProvider,
} from './storage';

/**
 * The native backend: the same records and meta contract as the IndexedDB one, over SQLite (an
 * encrypted SQLCipher database on Android). It needs only the few calls below, so the Capacitor
 * plugin provides them on the phone and sql.js provides them in tests.
 */

/** Statement values are strings, numbers and null. */
export interface SqlDb {
  run(sql: string, values?: unknown[]): Promise<{ changes: number }>;
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]>;
  /** All statements apply, or none. */
  transaction(statements: Array<{ sql: string; values?: unknown[] }>): Promise<void>;
  close(): Promise<void>;
}

/** Databases by name, like files: `open` creates one if it is missing, `remove` deletes it. */
export interface SqlDriver {
  open(name: string): Promise<SqlDb>;
  remove(name: string): Promise<void>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS records (
     tbl TEXT NOT NULL,
     id TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     iv TEXT NOT NULL,
     ciphertext TEXT NOT NULL,
     PRIMARY KEY (tbl, id)
   )`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

const PUT_RECORD =
  'INSERT OR REPLACE INTO records (tbl, id, updated_at, iv, ciphertext) VALUES (?, ?, ?, ?, ?)';
const PUT_META = 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)';
const DELETE_RECORD = 'DELETE FROM records WHERE tbl = ? AND id = ?';

type RecordColumns = {
  tbl: string;
  id: string;
  updated_at: string;
  iv: string;
  ciphertext: string;
};

/**
 * Meta values are JSON text. JSON has no bytes, so a `Uint8Array` is written as
 * `{"$bytes":"<base64>"}` and an `ArrayBuffer` as `{"$bytes":"<base64>","$as":"ArrayBuffer"}`;
 * `decodeMetaValue` gives each back as the type it was. An object that itself has a string
 * `$bytes` field would be read back as bytes; the app's meta values never have one.
 */
export function encodeMetaValue(value: unknown): string {
  const text: string | undefined = JSON.stringify(value, (_key, v: unknown) => {
    if (v instanceof Uint8Array) return { $bytes: bytesToBase64(v) };
    if (v instanceof ArrayBuffer)
      return { $bytes: bytesToBase64(new Uint8Array(v)), $as: 'ArrayBuffer' };
    if (ArrayBuffer.isView(v)) throw new TypeError('Only a Uint8Array can be stored as bytes');
    // A CryptoKey has no own properties, so JSON would quietly store `{}` for it.
    if (typeof CryptoKey !== 'undefined' && v instanceof CryptoKey) {
      throw new TypeError('A CryptoKey cannot be stored; store its bytes instead');
    }
    return v;
  });
  if (text === undefined) throw new TypeError('A meta value must be JSON-serializable');
  return text;
}

type BytesEnvelope = { $bytes: string; $as?: unknown };

const isBytesEnvelope = (v: unknown): v is BytesEnvelope =>
  typeof v === 'object' && v !== null && typeof (v as BytesEnvelope).$bytes === 'string';

export function decodeMetaValue(text: string): unknown {
  return JSON.parse(text, (_key, v: unknown) => {
    if (!isBytesEnvelope(v)) return v;
    const bytes = base64ToBytes(v.$bytes);
    return v.$as === 'ArrayBuffer' ? bytes.buffer : bytes;
  });
}

function sqliteMetaStore(db: SqlDb): MetaStore {
  return {
    async get<T>(key: string) {
      const [found] = await db.query<{ value: string }>('SELECT value FROM meta WHERE key = ?', [
        key,
      ]);
      return found ? (decodeMetaValue(found.value) as T) : undefined;
    },
    async put(key, value) {
      await db.run(PUT_META, [key, encodeMetaValue(value)]);
    },
    async putIfAbsent(key, value) {
      const { changes } = await db.run('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', [
        key,
        encodeMetaValue(value),
      ]);
      return changes === 1;
    },
    async delete(key) {
      await db.run('DELETE FROM meta WHERE key = ?', [key]);
    },
  };
}

function sqliteRecordStore(db: SqlDb): RecordStore {
  const meta = sqliteMetaStore(db);
  return {
    async all() {
      const found = await db.query<RecordColumns>(
        'SELECT tbl, id, updated_at, iv, ciphertext FROM records ORDER BY tbl, id',
      );
      return found.map((r): RecordRow => ({
        // A table from a newer app version, or one an older version had, passes through; the
        // repository decides what it reads.
        table: r.tbl,
        id: r.id,
        updatedAt: r.updated_at,
        iv: base64ToBytes(r.iv),
        ciphertext: base64ToBytes(r.ciphertext).buffer,
      }));
    },

    async write(rows, { replace, dataVersion, remove = [], ifDataVersion }) {
      // Checked just before the transaction, not inside it: the plugin's statement set has no
      // clean way to abort on a value it reads. That is enough on the phone, the one place this
      // backend runs: one WebView process holds one connection per database, and the repository
      // runs one load at a time per backend, so no other version write comes in between.
      if (ifDataVersion !== undefined) {
        const found = dataVersionOf(await meta.get(DATA_VERSION_KEY));
        if (found !== ifDataVersion) throw new DataVersionChangedError(ifDataVersion, found);
      }
      const statements: Array<{ sql: string; values?: unknown[] }> = [];
      if (replace) statements.push({ sql: 'DELETE FROM records' });
      for (const { table, id } of remove) {
        statements.push({ sql: DELETE_RECORD, values: [table, id] });
      }
      for (const row of rows) {
        statements.push({
          sql: PUT_RECORD,
          values: [
            row.table,
            row.id,
            row.updatedAt,
            bytesToBase64(row.iv),
            bytesToBase64(new Uint8Array(row.ciphertext)),
          ],
        });
      }
      if (dataVersion !== undefined) {
        statements.push({
          sql: PUT_META,
          values: [DATA_VERSION_KEY, encodeMetaValue(dataVersion)],
        });
      }
      if (statements.length > 0) await db.transaction(statements);
    },

    async remove(table, id) {
      await db.run(DELETE_RECORD, [table, id]);
    },
  };
}

/** The native backend: one SQLite database per namespace, named like the web one (`funancial-real`). */
export function sqliteStorage(driver: SqlDriver): StorageProvider {
  return {
    async open(ns) {
      const db = await driver.open(dbName(ns));
      try {
        await db.transaction(SCHEMA.map((sql) => ({ sql })));
      } catch (e) {
        // The setup error is the one to report; a close that fails too is only logged.
        await db
          .close()
          .catch((closeError: unknown) => console.error('Closing storage failed', closeError));
        throw e;
      }
      let closed = false;
      const backend: StorageBackend = {
        meta: sqliteMetaStore(db),
        records: sqliteRecordStore(db),
        close: async () => {
          if (closed) return;
          closed = true;
          await db.close();
        },
      };
      return backend;
    },
    remove: (ns) => driver.remove(dbName(ns)),
  };
}
