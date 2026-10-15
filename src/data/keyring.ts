import { base64ToBytes, bytesToBase64, randomBytes, type Bytes } from './crypto';
import type { VaultRecord } from './keys';

/**
 * Where the vault's "device mode" key lives. The data key is always stored wrapped; in device
 * mode the wrapping key (an AES-KW key) is found through the vault record itself. A browser can
 * keep a non-extractable `CryptoKey` object in IndexedDB; a store that holds only data (the
 * SQLCipher database on Android) keeps the key's bytes instead.
 */

export interface DeviceKeyring {
  /** A new AES-KW device key, plus the vault fields that let `open` find it again. */
  create(): Promise<{ key: CryptoKey; fields: Pick<VaultRecord, 'deviceKey' | 'deviceKeyRaw'> }>;
  open(vault: VaultRecord): Promise<CryptoKey>;
}

/** The vault record holds no device key this keyring can open. */
export class DeviceKeyMissingError extends Error {
  constructor() {
    super('The vault has no device key');
    this.name = 'DeviceKeyMissingError';
  }
}

const KEY_USAGES: KeyUsage[] = ['wrapKey', 'unwrapKey'];

/** The key never leaves the browser's key store: IndexedDB stores the non-extractable object. */
export const browserKeyring: DeviceKeyring = {
  async create() {
    const key = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, KEY_USAGES);
    return { key, fields: { deviceKey: key } };
  },
  async open(vault) {
    if (!vault.deviceKey) throw new DeviceKeyMissingError();
    return vault.deviceKey;
  },
};

function importDeviceKey(bytes: Bytes): Promise<CryptoKey> {
  // Non-extractable: once imported, code can wrap and unwrap with the key but never read it back.
  return crypto.subtle.importKey('raw', bytes, 'AES-KW', false, KEY_USAGES);
}

/**
 * The key's 32 random bytes are kept as base64 in the vault record, for stores that can hold
 * only data. The record's store (an encrypted database) is what protects them at rest.
 */
export const storedKeyring: DeviceKeyring = {
  async create() {
    const bytes = randomBytes(32);
    const key = await importDeviceKey(bytes);
    return { key, fields: { deviceKeyRaw: bytesToBase64(bytes) } };
  },
  async open(vault) {
    if (!vault.deviceKeyRaw) throw new DeviceKeyMissingError();
    return importDeviceKey(base64ToBytes(vault.deviceKeyRaw));
  },
};
