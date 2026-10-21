import { describe, expect, it, vi } from 'vitest';
import { base64ToBytes } from '@/data/crypto';
import type { StorageProvider } from '@/data/storage';
import { fakeBiometric } from '@/test/fakeBiometric';
import { makeExpense } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { createAppStore, type AppDeps } from './appStore';

const SLOT = 'funancial.real.unlock';

async function reboot(deps: AppDeps) {
  const store = createAppStore(deps);
  await store.getState().boot();
  return store;
}

/** A PIN-locked app with biometric unlock turned on, restarted to its lock screen. */
async function lockedWithBiometric() {
  const bio = fakeBiometric();
  const { store, deps } = await freshRealStore({ biometric: bio });
  await store.getState().put('expense', makeExpense({ id: 'e1', amount: 4_25 }));
  await store.getState().setSecret('2468', 'pin');
  await store.getState().enableBiometric();
  return { bio, deps, store: await reboot(deps) };
}

/**
 * `storage`, counting each time the app reads all its rows (each open of the data) and holding the
 * first read until `release` is called: an unlock caught in the middle of opening.
 */
function heldOpens(storage: StorageProvider) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let reads = 0;
  const provider: StorageProvider = {
    ...storage,
    async open(ns) {
      const backend = await storage.open(ns);
      const all = backend.records.all.bind(backend.records);
      const records = {
        ...backend.records,
        all: async () => {
          reads += 1;
          if (reads === 1) await released;
          return all();
        },
      };
      return { ...backend, records };
    },
  };
  return { provider, release, reads: () => reads };
}

/** A PIN-locked app with biometric unlock on, restarted to its lock screen over `heldOpens`. */
async function lockedWithHeldOpens() {
  const bio = fakeBiometric();
  const { store: first, deps } = await freshRealStore({ biometric: bio });
  await first.getState().setSecret('2468', 'pin');
  await first.getState().enableBiometric();
  const held = heldOpens(deps.storage);
  const store = await reboot({ ...deps, storage: held.provider });
  expect(store.getState()).toMatchObject({ phase: 'locked', biometric: 'on' });
  return { bio, held, store };
}

/** The `biometric` meta value as stored, read through a second connection. */
async function storedFlag(deps: AppDeps) {
  const backend = await deps.storage.open('real');
  try {
    return await backend.meta.get('biometric');
  } finally {
    await backend.close();
  }
}

describe('biometric unlock', () => {
  it('keeps the data key behind biometrics and opens the app with it after a restart', async () => {
    const bio = fakeBiometric();
    const { store, deps } = await freshRealStore({ biometric: bio });
    expect(store.getState().biometric).toBe('off');
    await store.getState().put('expense', makeExpense({ id: 'e1', amount: 4_25 }));
    await store.getState().setSecret('2468', 'pin');

    await store.getState().enableBiometric();

    expect(store.getState().biometric).toBe('on');
    expect([...bio.slots.keys()]).toEqual([SLOT]);
    // The raw 256-bit data key, as base64; the meta flag says only that it is on.
    expect(base64ToBytes(bio.slots.get(SLOT) ?? '')).toHaveLength(32);
    expect(await storedFlag(deps)).toBe(true);

    const again = await reboot(deps);
    expect(again.getState()).toMatchObject({ phase: 'locked', biometric: 'on' });
    expect(await again.getState().unlock('0000')).toBe('wrong');
    expect(again.getState().failedAttempts).toBe(1);

    expect(await again.getState().unlockWithBiometric()).toBe('ok');

    expect(bio.read).toHaveBeenCalledWith(SLOT);
    expect(again.getState()).toMatchObject({ phase: 'unlocked', failedAttempts: 0 });
    expect(again.getState().data.tables.expense.map((e) => e.id)).toEqual(['e1']);
    // A biometric unlock clears the PIN throttle on disk too.
    expect((await reboot(deps)).getState().failedAttempts).toBe(0);
  });

  it('falls back to the PIN and turns itself off when enrolment changed', async () => {
    const { bio, deps, store } = await lockedWithBiometric();
    bio.nextRead('changed');

    expect(await store.getState().unlockWithBiometric()).toBe('changed');

    expect(store.getState()).toMatchObject({ phase: 'locked', biometric: 'off' });
    expect(bio.forget).toHaveBeenCalledWith(SLOT);
    expect(bio.slots.size).toBe(0);
    expect(await store.getState().unlock('2468')).toBe('ok');
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual(['e1']);
    expect(await storedFlag(deps)).toBeUndefined();

    const again = await reboot(deps);
    expect(again.getState()).toMatchObject({ phase: 'locked', biometric: 'off' });
  });

  it('a fingerprint that succeeds while the PIN is opening the app does not open it again', async () => {
    const { bio, held, store } = await lockedWithHeldOpens();
    const secret = bio.slots.get(SLOT)!;
    let finger!: (outcome: { status: 'ok'; secret: string }) => void;
    bio.read.mockImplementationOnce(() => new Promise((resolve) => (finger = resolve)));

    // The prompt is up; the PIN is typed meanwhile and starts opening the data.
    const viaFinger = store.getState().unlockWithBiometric();
    expect(bio.read).toHaveBeenCalledWith(SLOT);
    const viaPin = store.getState().unlock('2468');
    await vi.waitFor(() => expect(held.reads()).toBe(1));
    expect(store.getState()).toMatchObject({ phase: 'locked', checking: true });

    // Then the fingerprint is accepted, while the PIN's open is still under way.
    finger({ status: 'ok', secret });
    let settled = false;
    void viaFinger.finally(() => (settled = true));
    await vi.waitFor(() => expect(settled || held.reads() > 1).toBe(true));
    held.release();

    expect(await viaPin).toBe('ok');
    expect(await viaFinger).toBe('cancelled');
    expect(held.reads()).toBe(1);
    expect(store.getState()).toMatchObject({ phase: 'unlocked', checking: false });
  });

  it('a PIN typed while the fingerprint is opening the app waits as busy', async () => {
    const { held, store } = await lockedWithHeldOpens();

    const viaFinger = store.getState().unlockWithBiometric();
    await vi.waitFor(() => expect(held.reads()).toBe(1));
    expect(store.getState()).toMatchObject({ phase: 'locked', checking: true });

    let pinResult: string | undefined;
    const viaPin = store
      .getState()
      .unlock('2468')
      .then((r) => (pinResult = r));
    await vi.waitFor(() => expect(pinResult !== undefined || held.reads() > 1).toBe(true));
    held.release();

    expect(await viaPin).toBe('busy');
    expect(await viaFinger).toBe('ok');
    expect(held.reads()).toBe(1);
    expect(store.getState()).toMatchObject({ phase: 'unlocked', checking: false });
  });

  it('a cancelled prompt leaves the PIN pad', async () => {
    const { bio, store } = await lockedWithBiometric();
    bio.nextRead('cancelled');

    expect(await store.getState().unlockWithBiometric()).toBe('cancelled');

    expect(store.getState()).toMatchObject({ phase: 'locked', biometric: 'on' });
    expect(bio.slots.has(SLOT)).toBe(true);
    expect(await store.getState().unlock('2468')).toBe('ok');
  });

  it('changing the PIN keeps the biometric copy', async () => {
    const { bio, deps, store } = await lockedWithBiometric();
    await store.getState().unlock('2468');
    const copy = bio.slots.get(SLOT);

    await store.getState().setSecret('correct horse', 'passphrase');

    expect(bio.slots.get(SLOT)).toBe(copy);
    const again = await reboot(deps);
    expect(again.getState()).toMatchObject({ lockMode: 'passphrase', biometric: 'on' });
    expect(await again.getState().unlockWithBiometric()).toBe('ok');
  });

  it('removing the lock forgets the biometric copy', async () => {
    const { bio, deps, store } = await lockedWithBiometric();
    await store.getState().unlock('2468');

    await store.getState().clearSecret();

    expect(bio.forget).toHaveBeenCalledWith(SLOT);
    expect(bio.slots.size).toBe(0);
    expect(store.getState()).toMatchObject({ lockMode: 'device', biometric: 'off' });
    expect(await storedFlag(deps)).toBeUndefined();
    expect((await reboot(deps)).getState()).toMatchObject({ phase: 'unlocked', biometric: 'off' });
  });

  it('deleting all data forgets the biometric copy', async () => {
    const bio = fakeBiometric();
    const { store } = await freshRealStore({ biometric: bio });
    await store.getState().setSecret('2468', 'pin');
    await store.getState().enableBiometric();
    store.getState().lock();

    // As from the lock screen, when the PIN is forgotten.
    await store.getState().deleteAllData();

    expect(bio.forget).toHaveBeenCalledWith(SLOT);
    expect(bio.slots.size).toBe(0);
    expect(store.getState()).toMatchObject({ phase: 'welcome', biometric: 'off' });
  });

  it('cannot be turned on without a PIN or passphrase', async () => {
    const bio = fakeBiometric();
    const { store } = await freshRealStore({ biometric: bio });
    expect(store.getState()).toMatchObject({ lockMode: 'device', biometric: 'off' });

    await expect(store.getState().enableBiometric()).rejects.toThrow(
      'Set a PIN or passphrase first.',
    );

    // Nor while locked, when there is no key to keep.
    await store.getState().setSecret('2468', 'pin');
    store.getState().lock();
    await expect(store.getState().enableBiometric()).rejects.toThrow();

    expect(bio.store).not.toHaveBeenCalled();
    expect(store.getState().biometric).toBe('off');
  });

  it('is unavailable on the web and on a phone without fingerprint or face', async () => {
    const web = await freshRealStore({ biometric: null });
    const phone = await freshRealStore({ biometric: fakeBiometric({ available: false }) });

    for (const { store } of [web, phone]) {
      await store.getState().setSecret('2468', 'pin');
      expect(store.getState().biometric).toBe('unavailable');
      await expect(store.getState().enableBiometric()).rejects.toThrow();
      expect(store.getState().biometric).toBe('unavailable');
    }
  });

  it('says in plain words when the phone cannot turn it on or off, and logs why', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const bio = fakeBiometric();
      const { store, deps } = await freshRealStore({ biometric: bio });
      await store.getState().setSecret('2468', 'pin');
      const keystore = new Error('Keystore key generation failed');
      bio.store.mockRejectedValueOnce(keystore);

      await expect(store.getState().enableBiometric()).rejects.toThrow(
        new Error(
          "Fingerprint or face unlock couldn't be turned on. Try again, or keep using your PIN.",
        ),
      );

      expect(consoleError).toHaveBeenCalledWith(expect.any(String), keystore);
      expect(store.getState().biometric).toBe('off');
      expect(bio.slots.size).toBe(0);
      expect(await storedFlag(deps)).toBeUndefined();

      await store.getState().enableBiometric();
      const deleting = new Error('Failed to delete data');
      bio.forget.mockRejectedValueOnce(deleting);

      await expect(store.getState().disableBiometric()).rejects.toThrow(
        new Error("Fingerprint or face unlock couldn't be turned off. Try again."),
      );

      expect(consoleError).toHaveBeenCalledWith(expect.any(String), deleting);
      expect(store.getState().biometric).toBe('on');
      expect(await storedFlag(deps)).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
  });
});
