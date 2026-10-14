import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  decryptRecord,
  DecryptError,
  encryptRecord,
  generateDataKey,
} from './crypto';

describe('record encryption', () => {
  it('round-trips and binds a payload to its slot', async () => {
    const key = await generateDataKey();
    const p = await encryptRecord(key, 'expense:1', { note: 'coffee' });
    expect(await decryptRecord(key, 'expense:1', p)).toEqual({ note: 'coffee' });
    await expect(decryptRecord(key, 'expense:2', p)).rejects.toBeInstanceOf(DecryptError);
  });

  it('uses a fresh 12-byte IV every time', async () => {
    const key = await generateDataKey();
    const a = await encryptRecord(key, 'x:1', 1);
    const b = await encryptRecord(key, 'x:1', 1);
    expect(a.iv).toHaveLength(12);
    expect(b.iv).toHaveLength(12);
    expect(bytesToBase64(a.iv)).not.toBe(bytesToBase64(b.iv));
  });

  it('rejects a tampered ciphertext', async () => {
    const key = await generateDataKey();
    const p = await encryptRecord(key, 'x:1', { amount: 100 });
    const bytes = new Uint8Array(p.ciphertext.slice(0));
    bytes[0] = bytes[0]! ^ 0xff;
    await expect(
      decryptRecord(key, 'x:1', { iv: p.iv, ciphertext: bytes.buffer }),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it('rejects the wrong key', async () => {
    const p = await encryptRecord(await generateDataKey(), 'x:1', 'secret');
    await expect(decryptRecord(await generateDataKey(), 'x:1', p)).rejects.toBeInstanceOf(
      DecryptError,
    );
  });
});

describe('base64', () => {
  it('round-trips every byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(base64ToBytes(bytesToBase64(all))).toEqual(all);
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
  });

  it('handles large buffers without overflowing the stack', () => {
    const big = new Uint8Array(500_000).fill(7);
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
  });
});
