import { describe, expect, it } from 'vitest';
import { decryptRecord, encryptRecord } from './crypto';
import { browserKeyring, storedKeyring } from './keyring';
import {
  clearVaultSecret,
  createVault,
  getLockMode,
  setVaultSecret,
  unlockVault,
  VaultMissingError,
  type VaultRecord,
} from './keys';
import { memoryMetaStore } from './meta';

describe('device keyring', () => {
  it('storedKeyring keeps the device key as data and unlocks with it', async () => {
    const meta = memoryMetaStore();
    const dataKey = await createVault(meta, storedKeyring);
    const vault = await meta.get<VaultRecord>('vault');
    expect(vault?.mode).toBe('device');
    expect(typeof vault?.deviceKeyRaw).toBe('string');
    expect(vault?.deviceKeyRaw).toHaveLength(44);
    expect(vault?.deviceKey).toBeUndefined();

    const payload = await encryptRecord(dataKey, 'a:1', 'kept');
    const unlocked = await unlockVault(meta, undefined, storedKeyring);
    expect(await decryptRecord(unlocked, 'a:1', payload)).toBe('kept');
  });

  it('storedKeyring opens the device key as a non-extractable key', async () => {
    const meta = memoryMetaStore();
    await createVault(meta, storedKeyring);
    const vault = await meta.get<VaultRecord>('vault');
    const key = await storedKeyring.open(vault as VaultRecord);
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe('AES-KW');
    expect([...key.usages].sort()).toEqual(['unwrapKey', 'wrapKey']);
  });

  it('browserKeyring keeps a non-extractable key', async () => {
    const { key, fields } = await browserKeyring.create();
    expect(fields.deviceKey?.extractable).toBe(false);
    expect(fields.deviceKey).toBe(key);
    expect(fields.deviceKeyRaw).toBeUndefined();
  });

  it('reports a device-mode vault that holds no key for the keyring as missing', async () => {
    const meta = memoryMetaStore();
    await createVault(meta, browserKeyring);
    await expect(unlockVault(meta, undefined, storedKeyring)).rejects.toBeInstanceOf(
      VaultMissingError,
    );
  });

  it('clearing a secret re-wraps with the given keyring', async () => {
    const meta = memoryMetaStore();
    const key = await createVault(meta, storedKeyring);
    await setVaultSecret(meta, key, '2468', 'pin', { iterations: 1_000 });
    const withSecret = await meta.get<VaultRecord>('vault');
    expect(withSecret?.deviceKey).toBeUndefined();
    expect(withSecret?.deviceKeyRaw).toBeUndefined();

    const payload = await encryptRecord(key, 'a:1', 42);
    await clearVaultSecret(meta, key, storedKeyring);
    expect(await getLockMode(meta)).toBe('device');
    const cleared = await meta.get<VaultRecord>('vault');
    expect(typeof cleared?.deviceKeyRaw).toBe('string');
    expect(cleared?.deviceKey).toBeUndefined();

    const reopened = await unlockVault(meta, undefined, storedKeyring);
    expect(await decryptRecord(reopened, 'a:1', payload)).toBe(42);
  });
});
