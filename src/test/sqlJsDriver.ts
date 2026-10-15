import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';
import type { SqlDb, SqlDriver } from '@/data/sqliteStorage';

let sqlJs: Promise<SqlJsStatic> | undefined;
const loadSqlJs = () => (sqlJs ??= initSqlJs());

export type SqlJsDriver = SqlDriver & {
  /**
   * The next statement that contains `fragment` throws, after `skip` such statements have run.
   * Used to fail a write partway and check it rolls back.
   */
  failOn(fragment: string, skip?: number): void;
};

/**
 * SQLite (sql.js, in memory) behind the `SqlDriver` contract. Each named database outlives the
 * connections opened on it, as a file does: `close` ends a connection, `remove` deletes the file.
 */
export function sqlJsDriver(): SqlJsDriver {
  const files = new Map<string, Database>();
  let failure: { fragment: string; skip: number } | null = null;

  function checkFailure(sql: string) {
    if (!failure || !sql.includes(failure.fragment)) return;
    if (failure.skip > 0) {
      failure.skip -= 1;
      return;
    }
    const { fragment } = failure;
    failure = null;
    throw new Error(`Injected failure on a statement containing "${fragment}"`);
  }

  function connect(file: Database): SqlDb {
    let closed = false;
    const live = () => {
      if (closed) throw new Error('The database connection is closed');
      return file;
    };
    // The contract's values are strings, numbers and null, which are what sql.js binds.
    const bind = (values?: unknown[]) => values as SqlValue[] | undefined;

    return {
      async run(sql, values) {
        const db = live();
        checkFailure(sql);
        db.run(sql, bind(values));
        return { changes: db.getRowsModified() };
      },

      async query<T>(sql: string, values?: unknown[]) {
        const db = live();
        checkFailure(sql);
        const statement = db.prepare(sql);
        try {
          statement.bind(bind(values));
          const rows: unknown[] = [];
          while (statement.step()) rows.push(statement.getAsObject());
          return rows as T[];
        } finally {
          statement.free();
        }
      },

      async transaction(statements) {
        const db = live();
        db.run('BEGIN');
        try {
          for (const { sql, values } of statements) {
            checkFailure(sql);
            db.run(sql, bind(values));
          }
          db.run('COMMIT');
        } catch (e) {
          try {
            db.run('ROLLBACK');
          } catch {
            // SQLite already ended the transaction.
          }
          throw e;
        }
      },

      async close() {
        closed = true;
      },
    };
  }

  return {
    async open(name) {
      const sql = await loadSqlJs();
      let file = files.get(name);
      if (!file) {
        file = new sql.Database();
        files.set(name, file);
      }
      return connect(file);
    },

    async remove(name) {
      files.get(name)?.close();
      files.delete(name);
    },

    failOn(fragment, skip = 0) {
      failure = { fragment, skip };
    },
  };
}
