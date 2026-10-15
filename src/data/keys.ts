import { generateDataKey, randomBytes, utf8, type Bytes } from './crypto';
import { browserKeyring, DeviceKeyMissingError, type DeviceKeyring } from './keyring';
import type { MetaStore } from './meta';

/**
 * The data key never changes; only how it is wrapped does. With no secret it is wrapped by a
 * non-extractable device key that the vault's keyring keeps beside it; with a PIN/passphrase it is
 * wrapped by a PBKDF2-derived key and the device key is dropped. Changing the secret is one re-wrap.
 */

export type LockMode = 'device' | 'pin' | 'passphrase';
export type SecretKind = 'pin' | 'passphrase';

export const KDF_ITERATIONS = 600_000;
const VAULT_KEY = 'vault';

export type VaultRecord = {
  version: 1;
  mode: LockMode;
  wrappedKey: ArrayBuffer;
  /** Device mode, `browserKeyring`: a non-extractable key (IndexedDB stores CryptoKeys). */
  deviceKey?: CryptoKey;
  /** Device mode, `storedKeyring`: the key's bytes as base64, for stores that hold only data. */
  deviceKeyRaw?: string;
  salt?: Bytes;
  iterations?: number;
};

export class WrongSecretError extends Error {
  constructor(cause?: unknown, message = "That didn't match. Try again.") {
    super(message, { cause });
    this.name = 'WrongSecretError';
  }
}

export class VaultExistsError extends Error {
  constructor() {
    super('A vault already exists on this device');
    this.name = 'VaultExistsError';
  }
}

export class VaultMissingError extends Error {
  constructor() {
    super('No vault has been set up on this device');
    this.name = 'VaultMissingError';
  }
}

export function validateSecret(secret: string, kind: SecretKind): string | null {
  if (kind === 'pin') return /^\d{4,8}$/.test(secret) ? null : 'Use 4 to 8 digits.';
  return [...secret].length >= 8 ? null : 'Use at least 8 characters.';
}

export async function deriveKey(
  secret: string,
  salt: Bytes,
  iterations: number,
  usage: 'wrap' | 'encrypt',
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    utf8(secret.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    usage === 'wrap' ? { name: 'AES-KW', length: 256 } : { name: 'AES-GCM', length: 256 },
    false,
    usage === 'wrap' ? ['wrapKey', 'unwrapKey'] : ['encrypt', 'decrypt'],
  );
}

function wrap(dataKey: CryptoKey, kek: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey('raw', dataKey, kek, 'AES-KW');
}

function unwrap(wrapped: ArrayBuffer, kek: CryptoKey): Promise<CryptoKey> {
  // Extractable so the same data key can be re-wrapped when the secret changes.
  return crypto.subtle.unwrapKey('raw', wrapped, kek, 'AES-KW', { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
}

async function deviceWrapped(dataKey: CryptoKey, keyring: DeviceKeyring): Promise<VaultRecord> {
  const { key, fields } = await keyring.create();
  return { version: 1, mode: 'device', wrappedKey: await wrap(dataKey, key), ...fields };
}

/** Creates the vault, refusing if one exists: replacing it would orphan every encrypted row. */
export async function createVault(
  meta: MetaStore,
  keyring: DeviceKeyring = browserKeyring,
): Promise<CryptoKey> {
  const dataKey = await generateDataKey();
  if (!(await meta.putIfAbsent(VAULT_KEY, await deviceWrapped(dataKey, keyring)))) {
    throw new VaultExistsError();
  }
  return dataKey;
}

export async function getLockMode(meta: MetaStore): Promise<LockMode | null> {
  return (await meta.get<VaultRecord>(VAULT_KEY))?.mode ?? null;
}

export async function unlockVault(
  meta: MetaStore,
  secret?: string,
  keyring: DeviceKeyring = browserKeyring,
): Promise<CryptoKey> {
  const vault = await meta.get<VaultRecord>(VAULT_KEY);
  if (!vault) throw new VaultMissingError();

  if (vault.mode === 'device') {
    let deviceKey: CryptoKey;
    try {
      deviceKey = await keyring.open(vault);
    } catch (e) {
      if (e instanceof DeviceKeyMissingError) throw new VaultMissingError();
      throw e;
    }
    return unwrap(vault.wrappedKey, deviceKey);
  }

  if (secret === undefined || !vault.salt || !vault.iterations) throw new WrongSecretError();
  try {
    const kek = await deriveKey(secret, vault.salt, vault.iterations, 'wrap');
    return await unwrap(vault.wrappedKey, kek);
  } catch (e) {
    throw new WrongSecretError(e);
  }
}

export async function setVaultSecret(
  meta: MetaStore,
  dataKey: CryptoKey,
  secret: string,
  kind: SecretKind,
  opts: { iterations?: number } = {},
): Promise<void> {
  const iterations = opts.iterations ?? KDF_ITERATIONS;
  const salt = randomBytes(16);
  const kek = await deriveKey(secret, salt, iterations, 'wrap');
  const record: VaultRecord = {
    version: 1,
    mode: kind,
    wrappedKey: await wrap(dataKey, kek),
    salt,
    iterations,
  };
  // One put replaces the device-wrapped key: there is never a moment with no valid wrap.
  await meta.put(VAULT_KEY, record);
}

export async function clearVaultSecret(
  meta: MetaStore,
  dataKey: CryptoKey,
  keyring: DeviceKeyring = browserKeyring,
): Promise<void> {
  await meta.put(VAULT_KEY, await deviceWrapped(dataKey, keyring));
}
