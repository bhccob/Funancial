import { describe, expect, it, vi } from 'vitest';
import { sqlJsDriver } from '@/test/sqlJsDriver';
import { bytesToBase64 } from './crypto';
import {
  decodeMetaValue,
  encodeMetaValue,
  sqliteStorage,
  type SqlDb,
  type SqlDriver,
} from './sqliteStorage';
import { DATA_VERSION_KEY, type RecordRow } from './storage';

function row(id: string, seed: number, table: RecordRow['table'] = 'expense'): RecordRow {
  return {
    table,
    id,
    updatedAt: `2026-10-14T10:00:0${seed}.000Z`,
    iv: Uint8Array.from({ length: 12 }, (_, i) => seed * 16 + i),
    ciphertext: Uint8Array.from({ length: 40 }, (_, i) => (seed * 31 + i * 7) % 256).buffer,
  };
}

async function openReal(driver = sqlJsDriver()) {
  const provider = sqliteStorage(driver);
  return { driver, provider, backend: await provider.open('real') };
}

describe('meta store', () => {
  it('round-trips vault-shaped meta values, bytes included', async () => {
    const { backend } = await openReal();
    const vault = {
      version: 1,
      mode: 'pin',
      wrappedKey: Uint8Array.from([0, 1, 2, 253, 254, 255]).buffer,
      salt: Uint8Array.from([9, 8, 7, 6, 255, 0]),
      iterations: 600_000,
    };
    await backend.meta.put('vault', vault);
    const stored = await backend.meta.get<typeof vault>('vault');

    // toStrictEqual, unlike toEqual, compares the contents of an ArrayBuffer
    expect(stored).toStrictEqual(vault);
    expect(stored?.wrappedKey).toBeInstanceOf(ArrayBuffer);
    expect(stored?.salt).toBeInstanceOf(Uint8Array);

    await backend.meta.put('throttle', { failedAttempts: 3, lockedUntil: null });
    expect(await backend.meta.get('throttle')).toEqual({ failedAttempts: 3, lockedUntil: null });
    await backend.meta.put(DATA_VERSION_KEY, 2);
    expect(await backend.meta.get(DATA_VERSION_KEY)).toBe(2);
    expect(await backend.meta.get('missing')).toBeUndefined();
  });

  it('put replaces the whole value', async () => {
    const { backend } = await openReal();
    await backend.meta.put('vault', { mode: 'device', deviceKeyRaw: 'AAAA' });
    await backend.meta.put('vault', { mode: 'pin' });
    expect(await backend.meta.get('vault')).toEqual({ mode: 'pin' });
  });

  it('putIfAbsent writes once', async () => {
    const { backend } = await openReal();
    expect(await backend.meta.putIfAbsent('vault', { n: 1 })).toBe(true);
    expect(await backend.meta.putIfAbsent('vault', { n: 2 })).toBe(false);
    expect(await backend.meta.get('vault')).toEqual({ n: 1 });
  });

  it('delete removes a key and ignores a missing one', async () => {
    const { backend } = await openReal();
    await backend.meta.put('throttle', { failedAttempts: 1, lockedUntil: null });
    await backend.meta.delete('throttle');
    await backend.meta.delete('throttle');
    expect(await backend.meta.get('throttle')).toBeUndefined();
  });
});

describe('meta value encoding', () => {
  it('writes a Uint8Array as a bytes envelope and an ArrayBuffer as a tagged one', () => {
    expect(encodeMetaValue(Uint8Array.of(1, 2, 3))).toBe('{"$bytes":"AQID"}');
    expect(encodeMetaValue(Uint8Array.of(1, 2, 3).buffer)).toBe(
      '{"$bytes":"AQID","$as":"ArrayBuffer"}',
    );
    expect(encodeMetaValue({ salt: Uint8Array.of(255) })).toBe('{"salt":{"$bytes":"/w=="}}');
  });

  it('keeps only the bytes a view covers', () => {
    const view = Uint8Array.of(9, 1, 2, 3, 9).subarray(1, 4);
    const text = encodeMetaValue(view);
    expect(text).toBe('{"$bytes":"AQID"}');
    expect(decodeMetaValue(text)).toEqual(Uint8Array.of(1, 2, 3));
  });

  it('restores each kind of bytes to the type and contents it had', () => {
    const value = {
      a: Uint8Array.of(1, 200, 255),
      b: Uint8Array.of(2, 0, 254).buffer,
      c: [Uint8Array.of(3, 128)],
    };
    const decoded = decodeMetaValue(encodeMetaValue(value)) as typeof value;
    expect(decoded.a).toBeInstanceOf(Uint8Array);
    expect(decoded.b).toBeInstanceOf(ArrayBuffer);
    expect(decoded.c[0]).toBeInstanceOf(Uint8Array);
    expect(decoded).toStrictEqual(value);
    expect(new Uint8Array(decoded.b)).toStrictEqual(Uint8Array.of(2, 0, 254));
  });

  it('refuses a CryptoKey instead of storing an empty object', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
    ]);
    expect(() => encodeMetaValue({ mode: 'device', deviceKey: key })).toThrow(/CryptoKey/);
  });

  it('refuses values that are not JSON, and other typed arrays', () => {
    expect(() => encodeMetaValue(undefined)).toThrow(TypeError);
    expect(() => encodeMetaValue(new Float32Array(2))).toThrow(TypeError);
  });
});

describe('record store', () => {
  it('writes and reads rows back exactly', async () => {
    const { backend } = await openReal();
    const rows = [row('b', 2), row('a', 1), row('c', 3, 'income')];
    await backend.records.write(rows, { replace: false });

    const all = await backend.records.all();
    expect(all).toStrictEqual([rows[1], rows[0], rows[2]]); // by table, then id
    expect(all[0]?.iv).toBeInstanceOf(Uint8Array);
    expect(all[0]?.ciphertext).toBeInstanceOf(ArrayBuffer);
  });

  it('stores rows as base64 text under the documented schema', async () => {
    const { driver, backend } = await openReal();
    const r = row('a', 1);
    await backend.records.write([r], { replace: false });

    const raw = await (
      await driver.open('funancial-real')
    ).query('SELECT tbl, id, updated_at, iv, ciphertext FROM records');
    expect(raw).toEqual([
      {
        tbl: 'expense',
        id: 'a',
        updated_at: r.updatedAt,
        iv: bytesToBase64(r.iv),
        ciphertext: bytesToBase64(new Uint8Array(r.ciphertext)),
      },
    ]);
  });

  it('replaces a row with the same slot', async () => {
    const { backend } = await openReal();
    await backend.records.write([row('a', 1)], { replace: false });
    await backend.records.write([row('a', 2)], { replace: false });
    expect(await backend.records.all()).toStrictEqual([row('a', 2)]);
  });

  it('removes one row', async () => {
    const { backend } = await openReal();
    await backend.records.write([row('a', 1), row('b', 2)], { replace: false });
    await backend.records.remove('expense', 'a');
    await backend.records.remove('expense', 'missing');
    expect(await backend.records.all()).toStrictEqual([row('b', 2)]);
  });

  it('removes rows in the same transaction as the write', async () => {
    const { driver, backend } = await openReal();
    await backend.records.write([row('a', 1), row('b', 2)], { replace: false });
    const remove = [{ table: 'expense' as const, id: 'a' }];

    // The removal of a applies, then the insert of c fails: both roll back.
    driver.failOn('INSERT', 0);
    await expect(backend.records.write([row('c', 3)], { replace: false, remove })).rejects.toThrow(
      /INSERT/,
    );
    expect((await backend.records.all()).map((r) => r.id)).toEqual(['a', 'b']);

    await backend.records.write([row('c', 3)], { replace: false, remove });
    expect((await backend.records.all()).map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('reads and removes rows of a table the app no longer has', async () => {
    // An upgrade that retires a table removes its rows by name, though the app has no such table.
    const { backend } = await openReal();
    await backend.records.write([row('a', 1), row('f', 2, 'salaryFreeze')], { replace: false });
    expect((await backend.records.all()).map((r) => `${r.table}:${r.id}`)).toEqual([
      'expense:a',
      'salaryFreeze:f',
    ]);

    await backend.records.write([], {
      replace: false,
      remove: [{ table: 'salaryFreeze', id: 'f' }],
      dataVersion: 10,
    });
    expect(await backend.records.all()).toStrictEqual([row('a', 1)]);

    await backend.records.write([row('g', 3, 'buyDecision')], { replace: false });
    await backend.records.remove('buyDecision', 'g');
    expect(await backend.records.all()).toStrictEqual([row('a', 1)]);
  });

  it('write with replace drops other rows and sets dataVersion atomically', async () => {
    const { backend } = await openReal();
    await backend.records.write([row('a', 1), row('b', 2), row('c', 3, 'income')], {
      replace: false,
    });

    await backend.records.write([row('d', 4)], { replace: true, dataVersion: 2 });
    expect(await backend.records.all()).toStrictEqual([row('d', 4)]);
    expect(await backend.meta.get(DATA_VERSION_KEY)).toBe(2);

    await backend.records.write([row('e', 5)], { replace: false });
    expect(await backend.meta.get(DATA_VERSION_KEY)).toBe(2);

    await backend.records.write([], { replace: true });
    expect(await backend.records.all()).toStrictEqual([]);
  });

  it('a failing statement rolls the whole write back', async () => {
    const { driver, backend } = await openReal();
    await backend.records.write([row('a', 1), row('b', 2)], { replace: false });
    await backend.meta.put(DATA_VERSION_KEY, 1);

    // Delete, insert c, insert d all apply; the insert of e fails.
    driver.failOn('INSERT', 2);
    await expect(
      backend.records.write([row('c', 3), row('d', 4), row('e', 5)], {
        replace: true,
        dataVersion: 2,
      }),
    ).rejects.toThrow(/INSERT/);

    expect(await backend.records.all()).toStrictEqual([row('a', 1), row('b', 2)]);
    expect(await backend.meta.get(DATA_VERSION_KEY)).toBe(1);

    // The failed transaction is over: the next write works.
    await backend.records.write([row('f', 6)], { replace: false });
    expect((await backend.records.all()).map((r) => r.id)).toEqual(['a', 'b', 'f']);
  });
});

describe('lifecycle', () => {
  it('data persists across close and reopen', async () => {
    const { provider, backend } = await openReal();
    await backend.records.write([row('a', 1)], { replace: false, dataVersion: 2 });
    await backend.meta.put('vault', { mode: 'device', salt: Uint8Array.of(1, 2) });
    await backend.close();

    const reopened = await provider.open('real');
    expect(await reopened.records.all()).toStrictEqual([row('a', 1)]);
    expect(await reopened.meta.get(DATA_VERSION_KEY)).toBe(2);
    expect(await reopened.meta.get('vault')).toStrictEqual({
      mode: 'device',
      salt: Uint8Array.of(1, 2),
    });
  });

  it('close can be called twice', async () => {
    const { backend } = await openReal();
    await backend.close();
    await expect(backend.close()).resolves.toBeUndefined();
  });

  it('reports why a database could not be set up, and logs a close that also fails', async () => {
    const setupError = new Error('cannot create tables');
    const closeError = new Error('cannot close');
    const unused = () => Promise.reject(new Error('not used'));
    const db: SqlDb = {
      run: unused,
      query: unused,
      transaction: () => Promise.reject(setupError),
      close: () => Promise.reject(closeError),
    };
    const driver: SqlDriver = { open: async () => db, remove: async () => {} };

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(sqliteStorage(driver).open('real')).rejects.toBe(setupError);
      expect(logged).toHaveBeenCalledWith('Closing storage failed', closeError);
    } finally {
      logged.mockRestore();
    }
  });

  it('keeps the two namespaces apart', async () => {
    const { provider, backend } = await openReal();
    const demo = await provider.open('demo');
    await backend.records.write([row('a', 1)], { replace: false });
    expect(await demo.records.all()).toStrictEqual([]);
  });

  it('remove deletes the database', async () => {
    const { provider, backend } = await openReal();
    const demo = await provider.open('demo');
    await backend.records.write([row('a', 1)], { replace: false });
    await backend.meta.put('vault', { mode: 'device' });
    await demo.records.write([row('d', 4)], { replace: false });
    await backend.close();

    await provider.remove('real');
    const fresh = await provider.open('real');
    expect(await fresh.records.all()).toStrictEqual([]);
    expect(await fresh.meta.get('vault')).toBeUndefined();
    expect(await demo.records.all()).toStrictEqual([row('d', 4)]);

    await expect(provider.remove('real')).resolves.toBeUndefined();
  });
});
