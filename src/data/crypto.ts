/** Per-record AES-GCM encryption. Every payload is bound to its slot (`table:id`) via AAD. */

export type Bytes = Uint8Array<ArrayBuffer>;
export type EncryptedPayload = { iv: Bytes; ciphertext: ArrayBuffer };

export class DecryptError extends Error {
  constructor(cause?: unknown) {
    super('Could not decrypt data', { cause });
    this.name = 'DecryptError';
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(text: string): Bytes {
  return encoder.encode(text);
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function encryptRecord(
  key: CryptoKey,
  aad: string,
  value: unknown,
): Promise<EncryptedPayload> {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad) },
    key,
    utf8(JSON.stringify(value)),
  );
  return { iv, ciphertext };
}

export async function decryptRecord<T = unknown>(
  key: CryptoKey,
  aad: string,
  payload: EncryptedPayload,
): Promise<T> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: payload.iv, additionalData: utf8(aad) },
      key,
      payload.ciphertext,
    );
    return JSON.parse(decoder.decode(plain)) as T;
  } catch (e) {
    throw new DecryptError(e);
  }
}

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(text: string): Bytes {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
