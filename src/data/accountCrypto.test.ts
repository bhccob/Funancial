import { describe, expect, it } from 'vitest';
import { emptySnapshot, migrateSnapshot, type DataSnapshot } from '@/domain/snapshot';
import { makeExpense, makeGoal } from '@/test/fixtures';
import {
  deriveAccountKeys,
  exportKek,
  KDF_ITERATIONS,
  newDek,
  openCopy,
  sealCopy,
  unwrapDek,
  wrapDek,
} from './accountCrypto';
import { base64ToBytes, DecryptError } from './crypto';

const FAST = 1_000;
const PASSWORD = 'correct horse battery';

function sampleSnapshot(): DataSnapshot {
  const s = emptySnapshot();
  s.tables.expense = [makeExpense({ id: 'e1', note: 'coffee' })];
  s.tables.goal = [makeGoal({ id: 'g1' })];
  return s;
}

describe('deriveAccountKeys', () => {
  it('gives the same authKey for the same username (any case) and password', async () => {
    const a = await deriveAccountKeys('Ada.Lovelace', PASSWORD, FAST);
    const b = await deriveAccountKeys('ada.lovelace', PASSWORD, FAST);
    expect(b.authKey).toBe(a.authKey);
  });

  it('gives a different authKey for another password or another username', async () => {
    const a = await deriveAccountKeys('ada', PASSWORD, FAST);
    expect((await deriveAccountKeys('ada', `${PASSWORD}!`, FAST)).authKey).not.toBe(a.authKey);
    expect((await deriveAccountKeys('grace', PASSWORD, FAST)).authKey).not.toBe(a.authKey);
  });

  it("doesn't depend on how a keyboard encodes an accent (NFKC)", async () => {
    const composed = 'café au lait';
    const decomposed = 'café au lait';
    expect(composed).not.toBe(decomposed);

    const a = await deriveAccountKeys('ada', composed, FAST);
    const b = await deriveAccountKeys('ada', decomposed, FAST);
    expect(b.authKey).toBe(a.authKey);
    expect(await exportKek(b.kek)).toBe(await exportKek(a.kek));

    const c = await deriveAccountKeys('josé', PASSWORD, FAST);
    const d = await deriveAccountKeys('josé', PASSWORD, FAST);
    expect(d.authKey).toBe(c.authKey);
    expect(await exportKek(d.kek)).toBe(await exportKek(c.kek));

    // Case is folded after normalising, so a capital accented letter still matches.
    const e = await deriveAccountKeys('JOSÉ', PASSWORD, FAST);
    expect(e.authKey).toBe(c.authKey);
  });

  it('makes a 44-character base64 authKey', async () => {
    const { authKey } = await deriveAccountKeys('ada', PASSWORD, FAST);
    expect(authKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(base64ToBytes(authKey)).toHaveLength(32);
  });

  it('matches an independent PBKDF2 + HKDF derivation (the server and reset page rely on it)', async () => {
    // Computed with node:crypto: salt = SHA-256("funancial-account:ada.lovelace"), 1000 rounds,
    // HKDF-SHA256 with an empty salt and the info strings "funancial auth" / "funancial enc".
    const { authKey, kek } = await deriveAccountKeys('Ada.Lovelace', PASSWORD, FAST);
    expect(authKey).toBe('ns2z2fd36rzsCVPkdxuBHRdctCl2n16eO4s/MtCbqh4=');
    expect(await exportKek(kek)).toBe('kpIPt0Avv50QmOuQqXQYgso+QKBmahCQPS0fmjishDE=');
  });

  it('keeps authKey and kek apart', async () => {
    const { authKey, kek } = await deriveAccountKeys('ada', PASSWORD, FAST);
    expect(await exportKek(kek)).not.toBe(authKey);
  });

  it('defaults to 600,000 iterations', async () => {
    expect(KDF_ITERATIONS).toBe(600_000);
    const byDefault = await deriveAccountKeys('ada', PASSWORD);
    const explicit = await deriveAccountKeys('ada', PASSWORD, 600_000);
    expect(byDefault.authKey).toBe(explicit.authKey);
  });
});

describe('the data key', () => {
  it('makes a fresh 32-byte key each time and returns its raw bytes as base64', async () => {
    const a = await newDek();
    const b = await newDek();
    expect(base64ToBytes(a.raw)).toHaveLength(32);
    expect(a.raw).not.toBe(b.raw);
  });

  it('round-trips through wrapDek and unwrapDek', async () => {
    const { kek } = await deriveAccountKeys('ada', PASSWORD, FAST);
    const dek = await newDek();
    const wrapped = await wrapDek(dek.raw, kek);
    expect(wrapped.ciphertext).not.toContain(dek.raw);
    const back = await unwrapDek(wrapped, kek);
    expect(back.raw).toBe(dek.raw);

    // The unwrapped key is the same key: it opens what the original sealed.
    const snap = sampleSnapshot();
    expect(await openCopy(await sealCopy(snap, dek.key), back)).toEqual(snap);
  });

  it('wraps with a fresh IV every time', async () => {
    const { kek } = await deriveAccountKeys('ada', PASSWORD, FAST);
    const dek = await newDek();
    const a = await wrapDek(dek.raw, kek);
    const b = await wrapDek(dek.raw, kek);
    expect(base64ToBytes(a.iv)).toHaveLength(12);
    expect(a.iv).not.toBe(b.iv);
  });

  it("throws DecryptError for the wrong password's kek", async () => {
    const right = await deriveAccountKeys('ada', PASSWORD, FAST);
    const wrong = await deriveAccountKeys('ada', 'a different password', FAST);
    const wrapped = await wrapDek((await newDek()).raw, right.kek);
    await expect(unwrapDek(wrapped, wrong.kek)).rejects.toBeInstanceOf(DecryptError);
  });

  it('throws DecryptError for a tampered wrapped key', async () => {
    const { kek } = await deriveAccountKeys('ada', PASSWORD, FAST);
    const wrapped = await wrapDek((await newDek()).raw, kek);
    const bytes = base64ToBytes(wrapped.ciphertext);
    bytes[0] = bytes[0]! ^ 0xff;
    const forged = { iv: wrapped.iv, ciphertext: btoa(String.fromCharCode(...bytes)) };
    await expect(unwrapDek(forged, kek)).rejects.toBeInstanceOf(DecryptError);
  });
});

describe('exportKek', () => {
  it('exports 32 raw bytes that import back into a key that unwraps what kek wrapped', async () => {
    const { kek } = await deriveAccountKeys('ada', PASSWORD, FAST);
    const dek = await newDek();
    const wrapped = await wrapDek(dek.raw, kek);

    const exported = await exportKek(kek);
    expect(base64ToBytes(exported)).toHaveLength(32);
    const imported = await crypto.subtle.importKey(
      'raw',
      base64ToBytes(exported),
      'AES-GCM',
      false,
      ['encrypt', 'decrypt'],
    );
    expect((await unwrapDek(wrapped, imported)).raw).toBe(dek.raw);
  });
});

describe('the sealed copy', () => {
  it('round-trips a snapshot that migrateSnapshot accepts', async () => {
    const { key } = await newDek();
    const snap = sampleSnapshot();
    const opened = await openCopy(await sealCopy(snap, key), key);
    expect(migrateSnapshot(opened)).toEqual(snap);
  });

  it('seals the same snapshot differently each time (fresh IV)', async () => {
    const { key } = await newDek();
    const a = await sealCopy(sampleSnapshot(), key);
    const b = await sealCopy(sampleSnapshot(), key);
    expect(base64ToBytes(a.iv)).toHaveLength(12);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('holds no readable data and is compressed before it is locked', async () => {
    const { key } = await newDek();
    const big = emptySnapshot();
    big.tables.expense = Array.from({ length: 200 }, (_, i) =>
      makeExpense({ id: `e${i}`, note: 'coffee' }),
    );
    const sealed = await sealCopy(big, key);
    expect(sealed.ciphertext).not.toContain('coffee');
    // AES-GCM adds only 16 bytes, so a ciphertext this far under the JSON size means gzip ran.
    expect(base64ToBytes(sealed.ciphertext).length).toBeLessThan(JSON.stringify(big).length / 4);
  });

  it('throws DecryptError for the wrong key or a tampered copy', async () => {
    const { key } = await newDek();
    const sealed = await sealCopy(sampleSnapshot(), key);
    await expect(openCopy(sealed, (await newDek()).key)).rejects.toBeInstanceOf(DecryptError);

    const bytes = base64ToBytes(sealed.ciphertext);
    bytes[0] = bytes[0]! ^ 0xff;
    const forged = { iv: sealed.iv, ciphertext: btoa(String.fromCharCode(...bytes)) };
    await expect(openCopy(forged, key)).rejects.toBeInstanceOf(DecryptError);
  });
});
