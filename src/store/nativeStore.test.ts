import { describe, expect, it } from 'vitest';
import { storedKeyring } from '@/data/keyring';
import type { VaultRecord } from '@/data/keys';
import { sqliteStorage } from '@/data/sqliteStorage';
import { makeExpense, makeIncome, makeSubscription } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { sqlJsDriver } from '@/test/sqlJsDriver';
import { createAppStore, type AppDeps } from './appStore';

/** The phone's storage: the SQLite backend (here on sql.js) and the keyring that stores bytes. */
function nativeOverrides(driver = sqlJsDriver()): Partial<AppDeps> {
  return { storage: sqliteStorage(driver), keyring: storedKeyring };
}

async function reboot(deps: AppDeps) {
  const store = createAppStore(deps);
  await store.getState().boot();
  return store;
}

/** The vault as stored on disk, read through a second connection to the same database. */
async function storedVault(driver: ReturnType<typeof sqlJsDriver>) {
  const backend = await sqliteStorage(driver).open('real');
  try {
    return await backend.meta.get<VaultRecord>('vault');
  } finally {
    await backend.close();
  }
}

describe('the app over the SQLite backend', () => {
  it('starts fresh, saves, and reopens unlocked after a restart', async () => {
    const driver = sqlJsDriver();
    const { store, deps } = await freshRealStore(nativeOverrides(driver));
    expect(store.getState()).toMatchObject({ phase: 'unlocked', lockMode: 'device' });
    await store.getState().put('expense', makeExpense({ id: 'e1', amount: 4_25 }));
    await store.getState().put('income', makeIncome({ id: 'i1' }));

    const vault = await storedVault(driver);
    expect(vault?.mode).toBe('device');
    expect(typeof vault?.deviceKeyRaw).toBe('string');
    expect(vault?.deviceKey).toBeUndefined();
    expect(vault?.wrappedKey).toBeInstanceOf(ArrayBuffer);

    const again = await reboot(deps);
    expect(again.getState().phase).toBe('unlocked');
    expect(again.getState().data.tables.expense).toMatchObject([{ id: 'e1', amount: 4_25 }]);
    expect(again.getState().data.tables.income.map((i) => i.id)).toEqual(['i1']);
  });

  it('a PIN set on the phone is asked for after a restart', async () => {
    const driver = sqlJsDriver();
    const { store, deps } = await freshRealStore(nativeOverrides(driver));
    await store.getState().put('expense', makeExpense({ id: 'e1' }));
    await store.getState().setSecret('2468', 'pin');

    // The PIN replaces the whole vault record: no device key is left beside it.
    const vault = await storedVault(driver);
    expect(vault?.mode).toBe('pin');
    expect(vault?.deviceKeyRaw).toBeUndefined();
    expect(vault?.deviceKey).toBeUndefined();
    expect(vault?.salt).toBeInstanceOf(Uint8Array);

    const again = await reboot(deps);
    expect(again.getState().phase).toBe('locked');
    expect(await again.getState().unlock('0000')).toBe('wrong');
    expect(await again.getState().unlock('2468')).toBe('ok');
    expect(again.getState().phase).toBe('unlocked');
    expect(again.getState().data.tables.expense.map((e) => e.id)).toEqual(['e1']);
  });

  it('clearing the PIN goes back to the stored device key', async () => {
    const driver = sqlJsDriver();
    const { store, deps } = await freshRealStore(nativeOverrides(driver));
    await store.getState().setSecret('2468', 'pin');
    await store.getState().clearSecret();

    expect(typeof (await storedVault(driver))?.deviceKeyRaw).toBe('string');
    expect((await reboot(deps)).getState().phase).toBe('unlocked');
  });

  it('restores a backup made in the browser', async () => {
    // The browser: a Dexie-backed store, its data and a backup file of it.
    const browser = await freshRealStore();
    await browser.store.getState().put('expense', makeExpense({ id: 'e1', note: 'Café ☕' }));
    await browser.store.getState().put('expense', makeExpense({ id: 'e2', amount: 99_00 }));
    await browser.store.getState().put('income', makeIncome({ id: 'i1' }));
    await browser.store
      .getState()
      .put('subscription', makeSubscription({ id: 's1', nextRenewal: '2026-12-01' }));
    const browserData = (await reboot(browser.deps)).getState().data;
    const { text } = await browser.store.getState().createBackup('correct horse');

    // The phone: a SQLite-backed store with data of its own, which the restore replaces.
    const phone = await freshRealStore(nativeOverrides());
    await phone.store.getState().put('expense', makeExpense({ id: 'only-on-phone' }));
    await phone.store.getState().restoreBackup(text, 'correct horse');

    const restarted = await reboot(phone.deps);
    expect(restarted.getState().phase).toBe('unlocked');
    expect(restarted.getState().skipped).toEqual([]);
    expect(restarted.getState().data).toEqual(browserData);
    expect(restarted.getState().data.tables.expense.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('keeps real and demo data in separate databases', async () => {
    const { store, deps } = await freshRealStore(nativeOverrides());
    await store.getState().put('expense', makeExpense({ id: 'real-1' }));
    await store.getState().startDemo();
    expect(store.getState().namespace).toBe('demo');

    await store.getState().exitDemo();
    expect(store.getState().namespace).toBe('real');
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['real-1']);
    expect((await reboot(deps)).getState().data.tables.expense.map((e) => e.id)).toEqual([
      'real-1',
    ]);
  });
});
