import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  emptySnapshot,
  migrateSnapshot,
  SchemaVersionError,
  TABLES,
} from '@/domain/snapshot';
import v9edge from '@/domain/upgrades/__fixtures__/v9-edge.json';
import { V10_DROPPED_TABLES } from '@/domain/upgrades/v10Accounts';
import { makeExpense, makeGoal, makeSettings, makeSubscription } from '@/test/fixtures';
import { memoryStorage } from '@/test/memoryStorage';
import { sqlJsDriver } from '@/test/sqlJsDriver';
import { decryptRecord, encryptRecord, generateDataKey } from './crypto';
import { dexieStorage, type Namespace } from './db';
import { createVault, getLockMode, unlockVault } from './keys';
import { createRepository } from './repository';
import { sqliteStorage } from './sqliteStorage';
import { DATA_VERSION_KEY, type RecordRow, type StorageBackend } from './storage';

const opened: Array<{ ns: Namespace; prefix: string; backend: StorageBackend }> = [];

async function testBackend(ns: Namespace = 'real', prefix = `test-${crypto.randomUUID()}`) {
  const backend = await dexieStorage(prefix).open(ns);
  opened.push({ ns, prefix, backend });
  return backend;
}

afterEach(async () => {
  for (const { ns, prefix, backend } of opened.splice(0)) {
    await backend.close();
    await dexieStorage(prefix).remove(ns);
  }
});

/** The stored row for a slot, as the backend holds it (still encrypted). */
async function storedRow(backend: StorageBackend, table: string, id: string) {
  return (await backend.records.all()).find((r) => r.table === table && r.id === id);
}

type Stored = { id: string; updatedAt: string };

/**
 * Every row of a saved snapshot stored as that version of the app stored it: one encrypted row
 * per record, the data version in meta. `reversed` stores them last first.
 */
async function seedRows(
  backend: StorageBackend,
  key: CryptoKey,
  fixture: { schemaVersion: number; tables: object },
  { reversed = false } = {},
) {
  const rows: RecordRow[] = [];
  for (const [table, records] of Object.entries(fixture.tables as Record<string, Stored[]>)) {
    for (const record of records) {
      const sealed = await encryptRecord(key, `${table}:${record.id}`, record);
      rows.push({ table, id: record.id, updatedAt: record.updatedAt, ...sealed });
    }
  }
  await backend.records.write(reversed ? rows.toReversed() : rows, { replace: false });
  await backend.meta.put(DATA_VERSION_KEY, fixture.schemaVersion);
}

const bySlot = <T extends { table: string; id: string }>(keys: T[]) =>
  keys.map((k) => `${k.table}:${k.id}`).sort();
const byId = (rows: ReadonlyArray<{ id: string }>) =>
  rows.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

describe('repository over IndexedDB', () => {
  it('never stores plaintext, but reads it back', async () => {
    const backend = await testBackend();
    const repo = createRepository(backend, await generateDataKey());
    await repo.put('expense', makeExpense({ id: 'e1', note: 'secret coffee' }));

    const row = await storedRow(backend, 'expense', 'e1');
    expect(new TextDecoder().decode(row!.ciphertext)).not.toContain('secret coffee');
    expect((await repo.loadAll()).snapshot.tables.expense[0]?.note).toBe('secret coffee');
  });

  it('refuses to store an invalid record', async () => {
    const backend = await testBackend();
    const repo = createRepository(backend, await generateDataKey());
    await expect(repo.put('expense', makeExpense({ id: 'e1', amount: 1.5 }))).rejects.toThrow();
    expect(await backend.records.all()).toHaveLength(0);
  });

  it('removes a record', async () => {
    const repo = createRepository(await testBackend(), await generateDataKey());
    await repo.put('goal', makeGoal({ id: 'g1' }));
    await repo.remove('goal', 'g1');
    expect((await repo.loadAll()).snapshot.tables.goal).toEqual([]);
  });

  it('replaceAll swaps all records and leaves the vault alone', async () => {
    const backend = await testBackend();
    const key = await createVault(backend.meta);
    const repo = createRepository(backend, key);
    await repo.put('expense', makeExpense({ id: 'old' }));

    const next = emptySnapshot();
    next.tables.expense = [makeExpense({ id: 'new' })];
    next.tables.goal = [makeGoal({ id: 'g1' })];
    await repo.replaceAll(next);

    const { snapshot } = await repo.loadAll();
    expect(snapshot.tables.expense.map((e) => e.id)).toEqual(['new']);
    expect(snapshot.tables.goal.map((g) => g.id)).toEqual(['g1']);
    expect(await getLockMode(backend.meta)).toBe('device');
  });

  it('replaceAll is all-or-nothing', async () => {
    const repo = createRepository(await testBackend(), await generateDataKey());
    await repo.put('expense', makeExpense({ id: 'e1' }));

    const bad = emptySnapshot();
    bad.tables.expense = [makeExpense({ id: 'e2' }), makeExpense({ id: 'e3', amount: -5 })];
    await expect(repo.replaceAll(bad)).rejects.toThrow();

    expect((await repo.loadAll()).snapshot.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });

  it('skips and reports rows it cannot decrypt or validate', async () => {
    const backend = await testBackend();
    const key = await generateDataKey();
    const repo = createRepository(backend, key);
    await repo.put('expense', makeExpense({ id: 'good' }));
    const updatedAt = new Date().toISOString();
    await backend.records.write(
      [
        {
          table: 'expense',
          id: 'bad',
          updatedAt,
          iv: new Uint8Array(12),
          ciphertext: new ArrayBuffer(8),
        },
      ],
      { replace: false },
    );
    const invalid = await encryptRecord(key, 'expense:weird', { id: 'weird', amount: 'lots' });
    await backend.records.write([{ table: 'expense', id: 'weird', updatedAt, ...invalid }], {
      replace: false,
    });

    const { snapshot, skipped } = await repo.loadAll();
    expect(snapshot.tables.expense.map((e) => e.id)).toEqual(['good']);
    expect(skipped).toEqual([
      { table: 'expense', id: 'bad', reason: 'decrypt' },
      { table: 'expense', id: 'weird', reason: 'invalid' },
    ]);
  });

  it('deleting the demo database leaves real data intact', async () => {
    const prefix = `test-${crypto.randomUUID()}`;
    const key = await generateDataKey();
    const real = createRepository(await testBackend('real', prefix), key);
    const demoBackend = await testBackend('demo', prefix);
    const demo = createRepository(demoBackend, key);
    await real.put('expense', makeExpense({ id: 'mine' }));
    await demo.put('expense', makeExpense({ id: 'fake' }));

    await demoBackend.close();
    await dexieStorage(prefix).remove('demo');

    expect((await real.loadAll()).snapshot.tables.expense.map((e) => e.id)).toEqual(['mine']);
    const reopened = createRepository(await testBackend('demo', prefix), key);
    expect((await reopened.loadAll()).snapshot.tables.expense).toEqual([]);
  });

  it('persists the vault, CryptoKey included, across reopening', async () => {
    const prefix = `test-${crypto.randomUUID()}`;
    const first = await testBackend('real', prefix);
    const key = await createVault(first.meta);
    await createRepository(first, key).put('expense', makeExpense({ id: 'e1' }));
    await first.close();

    const second = await testBackend('real', prefix);
    expect(await getLockMode(second.meta)).toBe('device');
    const repo = createRepository(second, await unlockVault(second.meta));
    expect((await repo.loadAll()).snapshot.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('repository over any StorageBackend', () => {
  it('writes through any StorageBackend', async () => {
    const backend = memoryStorage();
    const repo = createRepository(backend, await generateDataKey());
    await repo.put('expense', makeExpense({ id: 'e1', note: 'round trip' }));
    expect((await repo.loadAll()).snapshot.tables.expense.map((e) => e.note)).toEqual([
      'round trip',
    ]);

    const next = emptySnapshot();
    next.tables.goal = [makeGoal({ id: 'g1' })];
    await repo.replaceAll(next);

    const rows = await backend.records.all();
    expect(rows.map((r) => [r.table, r.id])).toEqual([['goal', 'g1']]);
    expect(await backend.meta.get('dataVersion')).toBe(CURRENT_SCHEMA_VERSION);
    expect((await repo.loadAll()).snapshot.tables.expense).toEqual([]);
  });
});

describe('repository: older schema versions', () => {
  it('migrates v1 rows on load and stamps dataVersion', async () => {
    const backend = await testBackend();
    const key = await generateDataKey();
    const v1 = { ...makeSubscription({ id: 's1', nextRenewal: '2026-11-30' }) } as Record<
      string,
      unknown
    >;
    delete v1.anchorDay;
    await backend.records.write(
      [
        {
          table: 'subscription',
          id: 's1',
          updatedAt: String(v1.updatedAt),
          ...(await encryptRecord(key, 'subscription:s1', v1)),
        },
      ],
      { replace: false },
    );
    await backend.meta.put('dataVersion', 1);

    const repo = createRepository(backend, key);
    const { snapshot, skipped } = await repo.loadAll();
    expect(skipped).toEqual([]);
    expect(snapshot.tables.subscription[0]?.anchorDay).toBe(30);
    expect(await backend.meta.get('dataVersion')).toBe(CURRENT_SCHEMA_VERSION);
    const row = await storedRow(backend, 'subscription', 's1');
    expect(await decryptRecord(key, 'subscription:s1', row!)).toMatchObject({ anchorDay: 30 });
  });

  it('adds reminder settings to v2 settings rows on load', async () => {
    const backend = await testBackend();
    const key = await generateDataKey();
    const { reminders, ...v2 } = makeSettings({ lastBackupAt: '2026-10-07T12:00:00.000Z' });
    await backend.records.write(
      [
        {
          table: 'settings',
          id: 'settings',
          updatedAt: v2.updatedAt,
          ...(await encryptRecord(key, 'settings:settings', v2)),
        },
      ],
      { replace: false },
    );
    await backend.meta.put('dataVersion', 2);

    const { snapshot, skipped } = await createRepository(backend, key).loadAll();
    expect(skipped).toEqual([]);
    expect(snapshot.tables.settings[0]).toMatchObject({
      lastBackupAt: '2026-10-07T12:00:00.000Z',
      reminders,
    });
    expect(reminders.enabled).toBe(false);
    expect(await backend.meta.get('dataVersion')).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('upgrades v7 settings rows on load: Buy it? on, an empty inbox, and the new version stored', async () => {
    const backend = await testBackend();
    const key = await generateDataKey();
    const current = makeSettings();
    const v7: Record<string, unknown> = { ...current };
    delete v7.inbox;
    const reminders: Record<string, unknown> = { ...current.reminders };
    delete reminders.buyIt;
    v7.reminders = reminders;
    await backend.records.write(
      [
        {
          table: 'settings',
          id: 'settings',
          updatedAt: current.updatedAt,
          ...(await encryptRecord(key, 'settings:settings', v7)),
        },
      ],
      { replace: false },
    );
    await backend.meta.put('dataVersion', 7);

    const { snapshot, skipped } = await createRepository(backend, key).loadAll();
    expect(skipped).toEqual([]);
    const upgraded = { ...current, inbox: { readBefore: null, read: [] } };
    expect(snapshot.tables.settings).toEqual([upgraded]);
    expect(await backend.meta.get('dataVersion')).toBe(CURRENT_SCHEMA_VERSION);
    const row = await storedRow(backend, 'settings', 'settings');
    expect(await decryptRecord(key, 'settings:settings', row!)).toEqual(upgraded);
  });

  it('refuses data a newer version saved, before reading or writing anything', async () => {
    // An older build installed over a newer one would drop what it does not know on its next write.
    const backend = await testBackend();
    const repo = createRepository(backend, await createVault(backend.meta));
    await repo.put('settings', makeSettings());
    const newer = CURRENT_SCHEMA_VERSION + 1;
    await backend.meta.put('dataVersion', newer);
    const before = await backend.records.all();
    const read = vi.spyOn(backend.records, 'all');
    const write = vi.spyOn(backend.records, 'write');

    await expect(repo.loadAll()).rejects.toBeInstanceOf(SchemaVersionError);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(await backend.meta.get('dataVersion')).toBe(newer);
    expect(await backend.records.all()).toEqual(before);
  });

  it('putMany removes records in the same write, and none when a record is invalid', async () => {
    const backend = await testBackend();
    const repo = createRepository(backend, await generateDataKey());
    await repo.putMany([
      { table: 'expense', record: makeExpense({ id: 'gone' }) },
      { table: 'goal', record: makeGoal({ id: 'g' }) },
    ]);
    const remove = [{ table: 'expense' as const, id: 'gone' }];

    const invalid = makeGoal({ id: 'g', target: -1 });
    await expect(repo.putMany([{ table: 'goal', record: invalid }], remove)).rejects.toThrow();
    expect((await repo.loadAll()).snapshot.tables.expense).toHaveLength(1);

    await repo.putMany([{ table: 'goal', record: makeGoal({ id: 'g', name: 'Bike' }) }], remove);
    const { tables } = (await repo.loadAll()).snapshot;
    expect(tables.expense).toEqual([]);
    expect(tables.goal.map((g) => g.name)).toEqual(['Bike']);
  });

  it('putMany writes all or nothing', async () => {
    const backend = await testBackend();
    const repo = createRepository(backend, await generateDataKey());
    await expect(
      repo.putMany([
        { table: 'expense', record: makeExpense({ id: 'ok' }) },
        { table: 'expense', record: makeExpense({ id: 'bad', amount: -1 }) },
      ]),
    ).rejects.toThrow();
    expect(await backend.records.all()).toHaveLength(0);
    await repo.putMany([
      { table: 'expense', record: makeExpense({ id: 'a' }) },
      { table: 'goal', record: makeGoal({ id: 'g' }) },
    ]);
    expect(await backend.records.all()).toHaveLength(2);
  });
});

const ACCOUNT_IDS = ['acct-main', 'acct-savings', 'acct-passive', 'card-a', 'card-b'];
const isDropped = (table: string) => (V10_DROPPED_TABLES as readonly string[]).includes(table);

/** A row whose bytes no key opens. */
function unreadable(table: string, id: string, seed: number): RecordRow {
  return {
    table,
    id,
    updatedAt: '2026-09-01T12:00:00.000Z',
    iv: new Uint8Array(12).fill(seed),
    ciphertext: new Uint8Array(40).fill(seed).buffer,
  };
}

describe.each([
  ['memory', async () => memoryStorage()],
  ['SQLite', () => sqliteStorage(sqlJsDriver()).open('real')],
  ['IndexedDB', () => testBackend()],
])('repository: v9 rows over %s storage', (_, open: () => Promise<StorageBackend>) => {
  it('upgrades v9 rows to accounts and stores them once', async () => {
    const backend = await open();
    const key = await generateDataKey();
    await seedRows(backend, key, v9edge);
    const repo = createRepository(backend, key);

    const { snapshot, skipped } = await repo.loadAll();
    expect(skipped).toEqual([]);
    expect(snapshot.tables.account.map((a) => a.id)).toEqual(ACCOUNT_IDS);

    const stored = await backend.records.all();
    const slots = bySlot(stored);
    expect(slots).toEqual(expect.arrayContaining(ACCOUNT_IDS.map((id) => `account:${id}`)));
    expect(stored.filter((r) => isDropped(r.table))).toEqual([]);
    expect(slots).not.toContain('debt:card-a');
    expect(stored.filter((r) => r.table === 'debt').map((r) => r.id)).toEqual(['loan-1']);
    // Nothing of v9 is left beside what was written: every stored row is a record of the snapshot.
    const records = TABLES.flatMap((table) =>
      snapshot.tables[table].map((r: { id: string }) => ({ table, id: r.id })),
    );
    expect(slots).toEqual(bySlot(records));
    expect(await backend.meta.get(DATA_VERSION_KEY)).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(10);

    const write = vi.spyOn(backend.records, 'write');
    const remove = vi.spyOn(backend.records, 'remove');
    const again = await repo.loadAll();
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(again.skipped).toEqual([]);
    for (const table of TABLES) {
      expect(byId(again.snapshot.tables[table]), table).toEqual(byId(snapshot.tables[table]));
    }
  });

  it('stored and copied v9 data upgrade the same', async () => {
    const backend = await open();
    const key = await generateDataKey();
    // Storage hands rows back in its own order; reversed here, so nothing rests on the fixture's.
    await seedRows(backend, key, v9edge, { reversed: true });

    const { snapshot, skipped } = await createRepository(backend, key).loadAll();
    const copied = migrateSnapshot(structuredClone(v9edge));
    expect(skipped).toEqual([]);
    expect(copied.tables.account.map((a) => a.id)).toEqual(ACCOUNT_IDS);
    for (const table of TABLES) {
      expect(byId(snapshot.tables[table]), table).toEqual(byId(copied.tables[table]));
    }
  });

  it('leaves an undecryptable v9 row on disk', async () => {
    const backend = await open();
    const key = await generateDataKey();
    await seedRows(backend, key, v9edge);
    // An expense, a card debt and a row of a dropped table that can no longer be read.
    const broken = [
      unreadable('expense', 'exp-cash', 1),
      unreadable('debt', 'card-b', 2),
      unreadable('salaryFreeze', 'freeze-1', 3),
    ];
    await backend.records.write(broken, { replace: false });
    const before = await Promise.all(broken.map((r) => storedRow(backend, r.table, r.id)));
    expect(before.every((r) => r !== undefined)).toBe(true);

    const repo = createRepository(backend, key);
    const { snapshot, skipped } = await repo.loadAll();
    expect(skipped.every((s) => s.reason === 'decrypt')).toBe(true);
    expect(bySlot(skipped)).toEqual(bySlot(broken));
    for (const [i, r] of broken.entries()) {
      expect(await storedRow(backend, r.table, r.id), `${r.table}:${r.id}`).toStrictEqual(
        before[i],
      );
    }

    // Everything else is upgraded around them, the other retired rows removed.
    expect(await backend.meta.get(DATA_VERSION_KEY)).toBe(CURRENT_SCHEMA_VERSION);
    expect(snapshot.tables.account.map((a) => a.id)).toEqual(ACCOUNT_IDS.slice(0, 4));
    expect(snapshot.tables.expense.find((e) => e.id === 'exp-card-b')?.accountId).toBe('card-b');
    expect(snapshot.tables.expense.map((e) => e.id)).not.toContain('exp-cash');
    expect(await storedRow(backend, 'buyDecision', 'buy-1')).toBeUndefined();
    expect(await storedRow(backend, 'debt', 'card-a')).toBeUndefined();

    // They are reported again on the next load, and still kept.
    const again = await repo.loadAll();
    expect(bySlot(again.skipped)).toEqual(bySlot(broken));
    expect(await Promise.all(broken.map((r) => storedRow(backend, r.table, r.id)))).toStrictEqual(
      before,
    );
  });

  it('keeps a card debt whose account does not validate', async () => {
    // A card the old app saved but could not read either: its account is left out, so the row it
    // came from stays for recovery rather than being removed as moved.
    const backend = await open();
    const key = await generateDataKey();
    const v9 = structuredClone(v9edge);
    v9.tables.debt = v9.tables.debt.map((d) => (d.id === 'card-b' ? { ...d, name: '' } : d));
    await seedRows(backend, key, v9);
    const before = await storedRow(backend, 'debt', 'card-b');

    const { snapshot, skipped } = await createRepository(backend, key).loadAll();
    expect(skipped).toEqual([{ table: 'account', id: 'card-b', reason: 'invalid' }]);
    expect(snapshot.tables.account.map((a) => a.id)).toEqual(ACCOUNT_IDS.slice(0, 4));
    expect(await storedRow(backend, 'debt', 'card-b')).toStrictEqual(before);
    expect(await storedRow(backend, 'account', 'card-b')).toBeUndefined();
    expect(await storedRow(backend, 'debt', 'card-a')).toBeUndefined();
    expect(await storedRow(backend, 'account', 'card-a')).toBeDefined();
  });
});
