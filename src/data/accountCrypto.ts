import type { DataSnapshot } from '@/domain/snapshot';
import {
  base64ToBytes,
  bytesToBase64,
  DecryptError,
  generateDataKey,
  randomBytes,
  utf8,
  type Bytes,
} from './crypto';

/**
 * Account keys and sealed copies. Everything here runs on the phone, and the reset page runs the same
 * derivation, so this module imports nothing app-only. The server only ever sees `authKey`, the
 * wrapped data key and sealed copies; the password, `kek` and plaintext never leave the device.
 */

export const KDF_ITERATIONS = 600_000;

/** A locked AES-GCM payload, both parts base64. */
export type Sealed = { iv: string; ciphertext: string };

const aesGcm = (iv: string) => ({ name: 'AES-GCM', iv: base64ToBytes(iv) });

/**
 * One slow PBKDF2 pass makes `master`; HKDF then splits it into two keys that cannot be turned into
 * each other: `authKey` goes to the server, `kek` stays here. The salt comes from the username so
 * log-in needs no first request. HKDF's own salt is left empty, as `master` is already uniform.
 */
export async function deriveAccountKeys(
  username: string,
  password: string,
  iterations = KDF_ITERATIONS,
): Promise<{ authKey: string; kek: CryptoKey }> {
  const salt = await crypto.subtle.digest(
    'SHA-256',
    utf8(`funancial-account:${username.toLowerCase()}`),
  );
  const passKey = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const master = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    passKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey('raw', master, 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ]);
  const hkdf = (info: string) => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(0),
    info: utf8(info),
  });
  const auth = await crypto.subtle.deriveBits(hkdf('funancial auth'), hkdfKey, 256);
  // Extractable on purpose: the reset page hands the server `kek` (see `exportKek`) to re-wrap the DEK.
  const kek = await crypto.subtle.deriveKey(
    hkdf('funancial enc'),
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  return { authKey: bytesToBase64(new Uint8Array(auth)), kek };
}

/** `kek` as base64 raw bytes, for the reset page to send; the server re-wraps the data key with it. */
export async function exportKek(kek: CryptoKey): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', kek)));
}

/** A new random data key, with its raw bytes (base64) for wrapping and for the server at sign-up. */
export async function newDek(): Promise<{ key: CryptoKey; raw: string }> {
  const key = await generateDataKey();
  return { key, raw: bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key))) };
}

export async function wrapDek(raw: string, kek: CryptoKey): Promise<Sealed> {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, base64ToBytes(raw));
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

/** Throws `DecryptError` when `kek` is not the key that wrapped it, i.e. a wrong password. */
export async function unwrapDek(w: Sealed, kek: CryptoKey): Promise<CryptoKey & { raw: string }> {
  try {
    const raw = new Uint8Array(
      await crypto.subtle.decrypt(aesGcm(w.iv), kek, base64ToBytes(w.ciphertext)),
    );
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return Object.assign(key, { raw: bytesToBase64(raw) });
  } catch (e) {
    throw new DecryptError(e);
  }
}

async function throughStream(bytes: Bytes, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** The snapshot as JSON, gzipped, then locked with the data key under a fresh IV. */
export async function sealCopy(snapshot: DataSnapshot, dek: CryptoKey): Promise<Sealed> {
  const packed = await throughStream(utf8(JSON.stringify(snapshot)), new CompressionStream('gzip'));
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, packed);
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

/** Unlocks a sealed copy to its parsed JSON; `migrateSnapshot` validates it. Throws `DecryptError`. */
export async function openCopy(sealed: Sealed, dek: CryptoKey): Promise<unknown> {
  try {
    const packed = await crypto.subtle.decrypt(
      aesGcm(sealed.iv),
      dek,
      base64ToBytes(sealed.ciphertext),
    );
    const json = await throughStream(new Uint8Array(packed), new DecompressionStream('gzip'));
    return JSON.parse(new TextDecoder().decode(json));
  } catch (e) {
    throw new DecryptError(e);
  }
}
