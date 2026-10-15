import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storedKeyring } from '@/data/keyring';
import { sqliteStorage } from '@/data/sqliteStorage';
import { createAppStore } from '@/store/appStore';
import { realStoreDeps } from '@/test/realStore';
import { capacitorSqlDriver } from './sqlite';

const plugin = vi.hoisted(() => {
  const connection = {
    open: vi.fn(async () => {}),
    run: vi.fn(async () => ({ changes: { changes: 1 } })),
    query: vi.fn(async (): Promise<{ values?: unknown[] }> => ({ values: [] })),
    executeSet: vi.fn(async () => ({ changes: { changes: 0 } })),
    delete: vi.fn(async () => {}),
  };
  return {
    connection,
    isSecretStored: vi.fn(async () => ({ result: false })),
    setEncryptionSecret: vi.fn(async () => {}),
    checkConnectionsConsistency: vi.fn(async () => ({ result: false })),
    createConnection: vi.fn(async () => connection),
    closeConnection: vi.fn(async () => {}),
  };
});

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    isSecretStored = plugin.isSecretStored;
    setEncryptionSecret = plugin.setEncryptionSecret;
    checkConnectionsConsistency = plugin.checkConnectionsConsistency;
    createConnection = plugin.createConnection;
    closeConnection = plugin.closeConnection;
  },
}));

beforeEach(() => {
  // Back to the implementations above: no secret stored yet, every call succeeds.
  vi.resetAllMocks();
});

describe('capacitorSqlDriver', () => {
  it('creates the SQLCipher secret once and opens encrypted connections', async () => {
    const driver = await capacitorSqlDriver();
    await driver.open('funancial-real');

    expect(plugin.setEncryptionSecret).toHaveBeenCalledTimes(1);
    const [secret] = plugin.setEncryptionSecret.mock.calls[0] as unknown as [string];
    expect(secret).toHaveLength(44);
    expect(secret).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(plugin.createConnection).toHaveBeenCalledWith('funancial-real', true, 'secret', 1, false);
    expect(plugin.connection.open).toHaveBeenCalledTimes(1);

    plugin.setEncryptionSecret.mockClear();
    plugin.isSecretStored.mockResolvedValue({ result: true });
    await (await capacitorSqlDriver()).open('funancial-real');
    expect(plugin.setEncryptionSecret).not.toHaveBeenCalled();
  });

  it('reports real change counts and applies statement sets as one transaction', async () => {
    const db = await (await capacitorSqlDriver()).open('funancial-real');

    plugin.connection.run.mockResolvedValueOnce({ changes: { changes: 0 } });
    expect(await db.run('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', ['k', '1'])).toEqual(
      { changes: 0 },
    );
    expect(plugin.connection.run).toHaveBeenCalledWith(
      'INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)',
      ['k', '1'],
      false,
    );

    await db.transaction([
      { sql: 'DELETE FROM records' },
      { sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', values: ['k', '2'] },
    ]);
    expect(plugin.connection.executeSet).toHaveBeenCalledWith(
      [
        { statement: 'DELETE FROM records', values: [] },
        { statement: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', values: ['k', '2'] },
      ],
      true,
    );

    plugin.connection.query.mockResolvedValueOnce({ values: [{ value: '2' }] });
    expect(await db.query('SELECT value FROM meta WHERE key = ?', ['k'])).toEqual([{ value: '2' }]);
    plugin.connection.query.mockResolvedValueOnce({});
    expect(await db.query('SELECT value FROM meta')).toEqual([]);

    await db.close();
    expect(plugin.closeConnection).toHaveBeenCalledWith('funancial-real', false);
  });

  it('deletes a database through a connection to it', async () => {
    await (await capacitorSqlDriver()).remove('funancial-demo');

    expect(plugin.createConnection).toHaveBeenCalledWith('funancial-demo', true, 'secret', 1, false);
    expect(plugin.connection.delete).toHaveBeenCalledTimes(1);
    expect(plugin.closeConnection).toHaveBeenCalledWith('funancial-demo', false);
  });
});

describe('capacitorSqlDriver setup failures', () => {
  it.each([
    ['the secret check', () => plugin.isSecretStored.mockRejectedValue(new Error('Keystore read failed'))],
    [
      'the connection check',
      () => plugin.checkConnectionsConsistency.mockRejectedValue(new Error('Bridge failed')),
    ],
  ])('a failure in %s reaches the store as unavailable storage', async (_step, fail) => {
    fail();
    const { deps } = realStoreDeps({
      storage: sqliteStorage(await capacitorSqlDriver()),
      keyring: storedKeyring,
    });
    const store = createAppStore(deps);

    await store.getState().boot();

    expect(store.getState().phase).toBe('unavailable');
    expect(plugin.createConnection).not.toHaveBeenCalled();
  });

  it('sets up once while it works, and tries again after a failure', async () => {
    plugin.checkConnectionsConsistency.mockRejectedValueOnce(new Error('Bridge failed'));
    const driver = await capacitorSqlDriver();

    await expect(driver.open('funancial-real')).rejects.toThrow('Bridge failed');
    await driver.open('funancial-real');
    await driver.open('funancial-demo');
    await driver.remove('funancial-demo');

    expect(plugin.checkConnectionsConsistency).toHaveBeenCalledTimes(2);
    expect(plugin.isSecretStored).toHaveBeenCalledTimes(1);
    expect(plugin.setEncryptionSecret).toHaveBeenCalledTimes(1);
  });

  it('never makes a second secret, and never opens a database without one', async () => {
    plugin.setEncryptionSecret.mockRejectedValueOnce(new Error('Keystore write failed'));
    const driver = await capacitorSqlDriver();

    await expect(driver.open('funancial-real')).rejects.toThrow('Keystore write failed');
    await expect(driver.open('funancial-real')).rejects.toThrow();

    expect(plugin.setEncryptionSecret).toHaveBeenCalledTimes(1);
    expect(plugin.createConnection).not.toHaveBeenCalled();
  });

  it('uses the secret a failed setup stored anyway', async () => {
    // The plugin saves the passphrase, then can still throw over existing database files.
    plugin.setEncryptionSecret.mockImplementationOnce(async () => {
      plugin.isSecretStored.mockResolvedValue({ result: true });
      throw new Error('State for: funancial-realSQLite.db not correct');
    });
    const driver = await capacitorSqlDriver();

    await expect(driver.open('funancial-real')).rejects.toThrow('not correct');
    await driver.open('funancial-real');

    expect(plugin.setEncryptionSecret).toHaveBeenCalledTimes(1);
    expect(plugin.connection.open).toHaveBeenCalledTimes(1);
  });
});
