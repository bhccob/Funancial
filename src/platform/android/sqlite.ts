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
 */
export async function capacitorSqlDriver(): Promise<SqlDriver> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  // A reloaded page starts with no connections, but the native side still holds the old page's
  // ones (and refuses to create them again); this closes them.
  await sqlite.checkConnectionsConsistency();
  if (!(await sqlite.isSecretStored()).result) {
    await sqlite.setEncryptionSecret(bytesToBase64(randomBytes(32)));
  }

  const connect = (name: string) =>
    sqlite.createConnection(name, ENCRYPTED, MODE, VERSION, READ_ONLY);
  const disconnect = (name: string) => sqlite.closeConnection(name, READ_ONLY);

  return {
    async open(name) {
      const conn = await connect(name);
      try {
        await conn.open();
      } catch (e) {
        await disconnect(name).catch(() => {});
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
        // Closes the database and forgets the connection, so `open` can create it again.
        close: () => disconnect(name),
      };
      return db;
    },

    async remove(name) {
      const conn = await connect(name);
      try {
        await conn.delete();
      } catch (e) {
        await disconnect(name).catch(() => {});
        throw e;
      }
      await disconnect(name);
    },
  };
}
