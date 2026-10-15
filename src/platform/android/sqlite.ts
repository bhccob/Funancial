import type { SQLiteConnection } from '@capacitor-community/sqlite';
import { bytesToBase64, randomBytes } from '@/data/crypto';
import type { SqlDb, SqlDriver } from '@/data/sqliteStorage';

/** Encrypted with the passphrase the plugin keeps in its Keystore-backed store. */
const ENCRYPTED = true;
const MODE = 'secret';
const VERSION = 1;
const READ_ONLY = false;

/**
 * `SqlDriver` over `@capacitor-community/sqlite`: every database is SQLCipher-encrypted. The
 * passphrase is 32 random bytes made on first launch and never seen by the web code again.
 *
 * The plugin is loaded and set up on first use, not here, so a failure surfaces where the store
 * opens storage (its "unavailable" screen) rather than before anything is on screen.
 */
export async function capacitorSqlDriver(): Promise<SqlDriver> {
  let ready: Promise<SQLiteConnection> | null = null;
  let secretAttempted = false;

  async function setUp(): Promise<SQLiteConnection> {
    const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    // A reloaded page starts with no connections, but the native side still holds the old
    // page's ones (and refuses to create them again); this closes them.
    await sqlite.checkConnectionsConsistency();
    if (!(await sqlite.isSecretStored()).result) {
      // One attempt only: a second secret could replace one the first attempt stored before
      // failing. And never go on without one: "secret" mode with no passphrase would create a
      // plain, unencrypted database.
      if (secretAttempted) throw new Error('The database passphrase could not be stored');
      secretAttempted = true;
      await sqlite.setEncryptionSecret(bytesToBase64(randomBytes(32)));
    }
    return sqlite;
  }

  /** The set-up plugin, once it works; a failed attempt is forgotten so the next use retries. */
  const plugin = () =>
    (ready ??= setUp().catch((e: unknown) => {
      ready = null;
      throw e;
    }));

  return {
    async open(name) {
      const sqlite = await plugin();
      const conn = await sqlite.createConnection(name, ENCRYPTED, MODE, VERSION, READ_ONLY);
      // Closes the database and forgets the connection, so `open` can create it again.
      const disconnect = () => sqlite.closeConnection(name, READ_ONLY);
      try {
        await conn.open();
      } catch (e) {
        await disconnect().catch(() => {});
        throw e;
      }
      const db: SqlDb = {
        async run(sql, values = []) {
          // No implicit transaction per statement; `transaction` is the atomic path.
          const result = await conn.run(sql, values, false);
          return { changes: result.changes?.changes ?? 0 };
        },
        async query<T>(sql: string, values: unknown[] = []) {
          return ((await conn.query(sql, values)).values ?? []) as T[];
        },
        async transaction(statements) {
          const set = statements.map((s) => ({ statement: s.sql, values: s.values ?? [] }));
          await conn.executeSet(set, true);
        },
        close: disconnect,
      };
      return db;
    },

    async remove(name) {
      const sqlite = await plugin();
      const conn = await sqlite.createConnection(name, ENCRYPTED, MODE, VERSION, READ_ONLY);
      try {
        await conn.delete();
      } catch (e) {
        await sqlite.closeConnection(name, READ_ONLY).catch(() => {});
        throw e;
      }
      await sqlite.closeConnection(name, READ_ONLY);
    },
  };
}
