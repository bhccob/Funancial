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

/** The most a copy may inflate to. Real data is a few MB; this stops a small file filling memory. */
const MAX_INFLATED_BYTES = 64 * 1024 * 1024;

/** A locked AES-GCM payload, both parts base64. */
export type Sealed = { iv: string; ciphertext: string };

/** The WebView has no `CompressionStream`, so a copy can be neither saved nor restored. */
export class UnsupportedError extends Error {
  constructor() {
    super(
      "This phone's browser engine is too old to save or restore your copy. Update Android System WebView.",
    );
    this.name = 'UnsupportedError';
  }
}

const aesGcm = (iv: string) => ({ name: 'AES-GCM', iv: base64ToBytes(iv) });

/**
 * The username as the salt, the server and the stored account all spell it: NFKC, lower-case, then
 * NFKC again: lower-casing can leave a sequence NFKC composes further, and the result must be a
 * fixed point so re-canonicalising a stored name never changes the salt.
 */
export function canonicalUsername(name: string): string {
  return name.normalize('NFKC').toLowerCase().normalize('NFKC');
}

/**
 * One slow PBKDF2 pass makes `master`; HKDF then splits it into two keys that cannot be turned into
 * each other: `authKey` goes to the server, `kek` stays here. The salt comes from the username so
 * log-in needs no first request. Both inputs are NFKC-normalised first, so a keyboard's choice of
 * accent encoding can't change the keys. HKDF's own salt is left empty, as `master` is already uniform.
 */
export async function deriveAccountKeys(
  username: string,
  password: string,
  iterations = KDF_ITERATIONS,
): Promise<{ authKey: string; kek: CryptoKey }> {
  const salt = await crypto.subtle.digest(
    'SHA-256',
    utf8(`funancial-account:${canonicalUsername(username)}`),
  );
  const passKey = await crypto.subtle.importKey(
    'raw',
    utf8(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
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
    // Not enumerable, so a spread, `Object.keys` or `JSON.stringify` of the key can't leak it by accident.
    Object.defineProperty(key, 'raw', { value: bytesToBase64(raw), enumerable: false });
    return key as CryptoKey & { raw: string };
  } catch (e) {
    throw new DecryptError(e);
  }
}

function requireStream(name: 'CompressionStream' | 'DecompressionStream') {
  if (typeof globalThis[name] === 'undefined') throw new UnsupportedError();
}

/** Passes bytes through, and errors the stream once more than `max` have gone by. */
function capBytes(max: number) {
  let seen = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > max) throw new Error('This copy is too large to open');
      controller.enqueue(chunk);
    },
  });
}

async function throughStreams(bytes: Bytes, ...stages: GenericTransformStream[]) {
  let out: ReadableStream = new Blob([bytes]).stream();
  for (const stage of stages) out = out.pipeThrough(stage);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** The snapshot as JSON, gzipped, then locked with the data key under a fresh IV. */
export async function sealCopy(snapshot: DataSnapshot, dek: CryptoKey): Promise<Sealed> {
  requireStream('CompressionStream');
  const packed = await throughStreams(
    utf8(JSON.stringify(snapshot)),
    new CompressionStream('gzip'),
  );
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, packed);
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

/**
 * Unlocks a sealed copy to its parsed JSON; `migrateSnapshot` validates it. Throws `DecryptError`
 * for a wrong key or a damaged or oversized copy, and `UnsupportedError` on a WebView too old to gunzip.
 */
export async function openCopy(sealed: Sealed, dek: CryptoKey): Promise<unknown> {
  requireStream('DecompressionStream');
  try {
    const packed = await crypto.subtle.decrypt(
      aesGcm(sealed.iv),
      dek,
      base64ToBytes(sealed.ciphertext),
    );
    const json = await throughStreams(
      new Uint8Array(packed),
      new DecompressionStream('gzip'),
      capBytes(MAX_INFLATED_BYTES),
    );
    return JSON.parse(new TextDecoder().decode(json));
  } catch (e) {
    throw new DecryptError(e);
  }
}
