import { describe, expect, it } from 'vitest';
import { decryptRecord, encryptRecord } from './crypto';
import {
  clearVaultSecret,
  createVault,
  getLockMode,
  KDF_ITERATIONS,
  setVaultSecret,
  unlockVault,
  validateSecret,
  VaultMissingError,
  WrongSecretError,
  type VaultRecord,
} from './keys';
import { memoryMetaStore } from './meta';

const FAST = { iterations: 1_000 };

describe('vault', () => {
  it('has no lock mode before it exists, and cannot be unlocked', async () => {
    const meta = memoryMetaStore();
    expect(await getLockMode(meta)).toBeNull();
    await expect(unlockVault(meta)).rejects.toBeInstanceOf(VaultMissingError);
  });

  it('keeps one data key across PIN set / unlock / clear', async () => {
    const meta = memoryMetaStore();
    const k1 = await createVault(meta);
    expect(await getLockMode(meta)).toBe('device');
    const p = await encryptRecord(k1, 'a:1', 42);

    await setVaultSecret(meta, k1, '2468', 'pin', FAST);
    expect(await getLockMode(meta)).toBe('pin');
    expect((await meta.get<VaultRecord>('vault'))?.deviceKey).toBeUndefined();
    await expect(unlockVault(meta, '1357')).rejects.toBeInstanceOf(WrongSecretError);
    const k2 = await unlockVault(meta, '2468');
    expect(await decryptRecord(k2, 'a:1', p)).toBe(42);

    await clearVaultSecret(meta, k2);
    expect(await getLockMode(meta)).toBe('device');
    expect(await decryptRecord(await unlockVault(meta), 'a:1', p)).toBe(42);
  });

  it('stores a fresh 16-byte salt and the iteration count used', async () => {
    const meta = memoryMetaStore();
    const key = await createVault(meta);
    await setVaultSecret(meta, key, 'correct horse', 'passphrase', FAST);
    const first = await meta.get<VaultRecord>('vault');
    expect(first?.mode).toBe('passphrase');
    expect(first?.iterations).toBe(1_000);
    expect(first?.salt).toHaveLength(16);
    await setVaultSecret(meta, key, 'battery staple', 'passphrase', FAST);
    const second = await meta.get<VaultRecord>('vault');
    expect(second?.salt).not.toEqual(first?.salt);
  });

  it('uses 600,000 PBKDF2 iterations unless told otherwise', async () => {
    const meta = memoryMetaStore();
    const key = await createVault(meta);
    await setVaultSecret(meta, key, '2468', 'pin');
    expect((await meta.get<VaultRecord>('vault'))?.iterations).toBe(600_000);
    expect(KDF_ITERATIONS).toBe(600_000);
  }, 20_000);

  it('forgets the old PIN after a change', async () => {
    const meta = memoryMetaStore();
    const key = await createVault(meta);
    await setVaultSecret(meta, key, '2468', 'pin', FAST);
    await setVaultSecret(meta, key, '97531', 'pin', FAST);
    await expect(unlockVault(meta, '2468')).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlockVault(meta, '97531')).resolves.toBeDefined();
  });

  it('asks for the secret when one is set', async () => {
    const meta = memoryMetaStore();
    const key = await createVault(meta);
    await setVaultSecret(meta, key, '2468', 'pin', FAST);
    await expect(unlockVault(meta)).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('explains a wrong secret in plain words', () => {
    expect(new WrongSecretError().message).toBe("That didn't match. Try again.");
  });
});

describe('validateSecret', () => {
  it('accepts 4 to 8 digit PINs only', () => {
    expect(validateSecret('123', 'pin')).toBe('Use 4 to 8 digits.');
    expect(validateSecret('12a4', 'pin')).toBe('Use 4 to 8 digits.');
    expect(validateSecret('123456789', 'pin')).toBe('Use 4 to 8 digits.');
    expect(validateSecret('2468 ', 'pin')).toBe('Use 4 to 8 digits.');
    expect(validateSecret('2468', 'pin')).toBeNull();
    expect(validateSecret('24680135', 'pin')).toBeNull();
  });

  it('accepts passphrases of at least 8 characters', () => {
    expect(validateSecret('short', 'passphrase')).toBe('Use at least 8 characters.');
    expect(validateSecret('pässwörd', 'passphrase')).toBeNull();
  });
});
