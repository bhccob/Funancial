import { afterEach, describe, expect, it } from 'vitest';
import { emptySnapshot } from '@/domain/snapshot';
import { makeExpense, makeGoal, makeSubscription } from '@/test/fixtures';
import { decryptRecord, encryptRecord, generateDataKey } from './crypto';
import { deleteDb, dexieMetaStore, openDb, type FunancialDb, type Namespace } from './db';
import { createVault, getLockMode, unlockVault } from './keys';
import { createWebRepository } from './webRepository';

const opened: Array<{ ns: Namespace; prefix: string; db: FunancialDb }> = [];

function testDb(ns: Namespace = 'real', prefix = `test-${crypto.randomUUID()}`) {
  const db = openDb(ns, prefix);
  opened.push({ ns, prefix, db });
  return db;
}

afterEach(async () => {
  for (const { ns, prefix, db } of opened.splice(0)) {
    db.close();
    await deleteDb(ns, prefix);
  }
});

describe('web repository', () => {
  it('never stores plaintext, but reads it back', async () => {
    const db = testDb();
    const repo = createWebRepository(db, await generateDataKey());
    await repo.put('expense', makeExpense({ id: 'e1', note: 'secret coffee' }));

    const row = await db.records.get(['expense', 'e1']);
    expect(new TextDecoder().decode(row!.ciphertext)).not.toContain('secret coffee');
    expect((await repo.loadAll()).snapshot.tables.expense[0]?.note).toBe('secret coffee');
  });

  it('refuses to store an invalid record', async () => {
    const db = testDb();
    const repo = createWebRepository(db, await generateDataKey());
    await expect(repo.put('expense', makeExpense({ id: 'e1', amount: 1.5 }))).rejects.toThrow();
    expect(await db.records.count()).toBe(0);
  });

  it('removes a record', async () => {
    const repo = createWebRepository(testDb(), await generateDataKey());
    await repo.put('goal', makeGoal({ id: 'g1' }));
    await repo.remove('goal', 'g1');
    expect((await repo.loadAll()).snapshot.tables.goal).toEqual([]);
  });

  it('replaceAll swaps all records and leaves the vault alone', async () => {
    const db = testDb();
    const meta = dexieMetaStore(db);
    const key = await createVault(meta);
    const repo = createWebRepository(db, key);
    await repo.put('expense', makeExpense({ id: 'old' }));

    const next = emptySnapshot();
    next.tables.expense = [makeExpense({ id: 'new' })];
    next.tables.goal = [makeGoal({ id: 'g1' })];
    await repo.replaceAll(next);

    const { snapshot } = await repo.loadAll();
    expect(snapshot.tables.expense.map((e) => e.id)).toEqual(['new']);
    expect(snapshot.tables.goal.map((g) => g.id)).toEqual(['g1']);
    expect(await getLockMode(meta)).toBe('device');
  });

  it('replaceAll is all-or-nothing', async () => {
    const repo = createWebRepository(testDb(), await generateDataKey());
    await repo.put('expense', makeExpense({ id: 'e1' }));

    const bad = emptySnapshot();
    bad.tables.expense = [makeExpense({ id: 'e2' }), makeExpense({ id: 'e3', amount: -5 })];
    await expect(repo.replaceAll(bad)).rejects.toThrow();

    expect((await repo.loadAll()).snapshot.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });

  it('skips and reports rows it cannot decrypt or validate', async () => {
    const db = testDb();
    const key = await generateDataKey();
    const repo = createWebRepository(db, key);
    await repo.put('expense', makeExpense({ id: 'good' }));
    const updatedAt = new Date().toISOString();
    await db.records.put({
      table: 'expense',
      id: 'bad',
      updatedAt,
      iv: new Uint8Array(12),
      ciphertext: new ArrayBuffer(8),
    });
    const invalid = await encryptRecord(key, 'expense:weird', { id: 'weird', amount: 'lots' });
    await db.records.put({ table: 'expense', id: 'weird', updatedAt, ...invalid });

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
    const real = createWebRepository(testDb('real', prefix), key);
    const demo = createWebRepository(testDb('demo', prefix), key);
    await real.put('expense', makeExpense({ id: 'mine' }));
    await demo.put('expense', makeExpense({ id: 'fake' }));

    opened.find((o) => o.ns === 'demo' && o.prefix === prefix)!.db.close();
    await deleteDb('demo', prefix);

    expect((await real.loadAll()).snapshot.tables.expense.map((e) => e.id)).toEqual(['mine']);
    const reopened = createWebRepository(testDb('demo', prefix), key);
    expect((await reopened.loadAll()).snapshot.tables.expense).toEqual([]);
  });

  it('persists the vault, CryptoKey included, across reopening', async () => {
    const prefix = `test-${crypto.randomUUID()}`;
    const first = testDb('real', prefix);
    const key = await createVault(dexieMetaStore(first));
    await createWebRepository(first, key).put('expense', makeExpense({ id: 'e1' }));
    first.close();

    const second = testDb('real', prefix);
    const meta = dexieMetaStore(second);
    expect(await getLockMode(meta)).toBe('device');
    const repo = createWebRepository(second, await unlockVault(meta));
    expect((await repo.loadAll()).snapshot.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('web repository: schema v2', () => {
  it('migrates v1 rows on load and stamps dataVersion', async () => {
    const db = testDb();
    const key = await generateDataKey();
    const v1 = { ...makeSubscription({ id: 's1', nextRenewal: '2026-11-30' }) } as Record<
      string,
      unknown
    >;
    delete v1.anchorDay;
    await db.records.put({
      table: 'subscription',
      id: 's1',
      updatedAt: String(v1.updatedAt),
      ...(await encryptRecord(key, 'subscription:s1', v1)),
    });
    await db.meta.put({ key: 'dataVersion', value: 1 });

    const repo = createWebRepository(db, key);
    const { snapshot, skipped } = await repo.loadAll();
    expect(skipped).toEqual([]);
    expect(snapshot.tables.subscription[0]?.anchorDay).toBe(30);
    expect((await db.meta.get('dataVersion'))?.value).toBe(2);
    const row = await db.records.get(['subscription', 's1']);
    expect(await decryptRecord(key, 'subscription:s1', row!)).toMatchObject({ anchorDay: 30 });
  });

  it('putMany writes all or nothing', async () => {
    const db = testDb();
    const repo = createWebRepository(db, await generateDataKey());
    await expect(
      repo.putMany([
        { table: 'expense', record: makeExpense({ id: 'ok' }) },
        { table: 'expense', record: makeExpense({ id: 'bad', amount: -1 }) },
      ]),
    ).rejects.toThrow();
    expect(await db.records.count()).toBe(0);
    await repo.putMany([
      { table: 'expense', record: makeExpense({ id: 'a' }) },
      { table: 'goal', record: makeGoal({ id: 'g' }) },
    ]);
    expect(await db.records.count()).toBe(2);
  });
});
