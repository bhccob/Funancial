import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySnapshot, migrateSnapshot, type DataSnapshot } from '@/domain/snapshot';
import { makeExpense, makeGoal } from '@/test/fixtures';
import {
  canonicalUsername,
  deriveAccountKeys,
  exportKek,
  KDF_ITERATIONS,
  newDek,
  openCopy,
  sealCopy,
  UnsupportedError,
  unwrapDek,
  wrapDek,
  type Sealed,
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
    const composed = 'caf\u00e9 au lait';
    const decomposed = 'cafe\u0301 au lait';
    expect(composed).not.toBe(decomposed);

    const a = await deriveAccountKeys('ada', composed, FAST);
    const b = await deriveAccountKeys('ada', decomposed, FAST);
    expect(b.authKey).toBe(a.authKey);
    expect(await exportKek(b.kek)).toBe(await exportKek(a.kek));

    const c = await deriveAccountKeys('jos\u00e9', PASSWORD, FAST);
    const d = await deriveAccountKeys('jose\u0301', PASSWORD, FAST);
    expect(d.authKey).toBe(c.authKey);
    expect(await exportKek(d.kek)).toBe(await exportKek(c.kek));

    // Case is folded after normalising, so a capital accented letter still matches.
    const e = await deriveAccountKeys('JOSE\u0301', PASSWORD, FAST);
    expect(e.authKey).toBe(c.authKey);
  });

  it('folds compatibility forms too, which NFC alone would not (NFKC)', async () => {
    // U+FB01 is the "fi" ligature: NFKC turns it into "fi", NFC leaves it alone.
    const ligature = await deriveAccountKeys('ada', '\ufb01 and more words', FAST);
    const plain = await deriveAccountKeys('ada', 'fi and more words', FAST);
    expect(ligature.authKey).toBe(plain.authKey);
    expect(await exportKek(ligature.kek)).toBe(await exportKek(plain.kek));
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

describe('canonicalUsername', () => {
  it('is NFKC, then lower-case', () => {
    expect(canonicalUsername('Ada.Lovelace')).toBe('ada.lovelace');
    expect(canonicalUsername('JOSE\u0301')).toBe('jos\u00e9');
    expect(canonicalUsername('\ufb01sh')).toBe('fish');
  });

  it('is idempotent', () => {
    for (const name of [
      'Ada.Lovelace',
      'JOSE\u0301',
      '\ufb01sh',
      '\u0130stanbul',
      '\u212aelvin',
      '',
    ]) {
      expect(canonicalUsername(canonicalUsername(name))).toBe(canonicalUsername(name));
    }
  });

  it('is exactly what deriveAccountKeys salts with', async () => {
    const raw = await deriveAccountKeys('JOSE\u0301', PASSWORD, FAST);
    const canonical = await deriveAccountKeys(canonicalUsername('JOSE\u0301'), PASSWORD, FAST);
    expect(canonical.authKey).toBe(raw.authKey);
    expect(await exportKek(canonical.kek)).toBe(await exportKek(raw.kek));
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

  it('keeps raw readable on the unwrapped key but out of anything that serialises or copies it', async () => {
    const { kek } = await deriveAccountKeys('ada', PASSWORD, FAST);
    const dek = await newDek();
    const key = await unwrapDek(await wrapDek(dek.raw, kek), kek);

    expect(key.raw).toBe(dek.raw);
    expect(Object.keys(key)).not.toContain('raw');
    expect(JSON.stringify(key)).not.toContain(dek.raw);
    expect(JSON.stringify({ ...key })).not.toContain(dek.raw);
    expect(Object.values({ ...key })).not.toContain(dek.raw);
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

describe('malformed input', () => {
  /** Damaged copies of a good payload: bad base64 and cut-short parts of `iv` and `ciphertext`. */
  function damaged(good: Sealed): [string, Sealed][] {
    const cut = (text: string) => text.slice(0, Math.floor(text.length / 2 / 4) * 4);
    return [
      ['ciphertext that is not base64', { ...good, ciphertext: '!!not base64!!' }],
      ['ciphertext of an impossible length', { ...good, ciphertext: 'A' }],
      ['empty ciphertext', { ...good, ciphertext: '' }],
      ['truncated ciphertext', { ...good, ciphertext: cut(good.ciphertext) }],
      ['iv that is not base64', { ...good, iv: '%%%%' }],
      ['empty iv', { ...good, iv: '' }],
      ['truncated iv', { ...good, iv: cut(good.iv) }],
    ];
  }

  it('is a DecryptError, never a raw atob or WebCrypto error, from openCopy', async () => {
    const { key } = await newDek();
    for (const [name, bad] of damaged(await sealCopy(sampleSnapshot(), key))) {
      await expect(openCopy(bad, key), name).rejects.toBeInstanceOf(DecryptError);
    }
  });

  it('is a DecryptError from unwrapDek', async () => {
    const { kek } = await deriveAccountKeys('ada', PASSWORD, FAST);
    for (const [name, bad] of damaged(await wrapDek((await newDek()).raw, kek))) {
      await expect(unwrapDek(bad, kek), name).rejects.toBeInstanceOf(DecryptError);
    }
  });
});

describe('opening a copy that inflates too far', () => {
  it('stops at 64 MiB and gives a DecryptError, however small the file is', async () => {
    const { key } = await newDek();
    // One 65 MiB note gzips to a few dozen KB, so this is a small file that would inflate past the cap.
    const bomb = emptySnapshot();
    bomb.tables.expense = [makeExpense({ id: 'big', note: 'a'.repeat(65 * 1024 * 1024) })];
    const sealed = await sealCopy(bomb, key);
    expect(base64ToBytes(sealed.ciphertext).length).toBeLessThan(1_000_000);

    const error = await openCopy(sealed, key).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DecryptError);
    expect(((error as DecryptError).cause as Error).message).toMatch(/too large/);
  });
});

describe('on a WebView without compression streams', () => {
  afterEach(() => vi.unstubAllGlobals());
  const MESSAGE =
    "This phone's browser engine is too old to save or restore your copy. Update Android System WebView.";

  it('sealCopy says so with an UnsupportedError', async () => {
    const { key } = await newDek();
    vi.stubGlobal('CompressionStream', undefined);
    const error = await sealCopy(sampleSnapshot(), key).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnsupportedError);
    expect((error as Error).message).toBe(MESSAGE);
  });

  it('openCopy says so, and does not call it a DecryptError', async () => {
    const { key } = await newDek();
    const sealed = await sealCopy(sampleSnapshot(), key);
    vi.stubGlobal('DecompressionStream', undefined);
    const error = await openCopy(sealed, key).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnsupportedError);
    expect(error).not.toBeInstanceOf(DecryptError);
    expect((error as Error).message).toBe(MESSAGE);
  });
});
