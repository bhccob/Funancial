import { describe, expect, it } from 'vitest';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { makeExpense, makeGoal, makeSubscription } from '@/test/fixtures';
import {
  backupFileName,
  createBackup,
  exportFileName,
  exportPlainJson,
  InvalidBackupError,
  readBackup,
} from './backup';
import { WrongSecretError } from './keys';

const FAST = { iterations: 1_000 };
const PASS = 'correct horse';

function sampleSnapshot(): DataSnapshot {
  const s = emptySnapshot();
  s.tables.expense = [makeExpense({ id: 'e1', note: 'coffee' })];
  s.tables.goal = [makeGoal({ id: 'g1' })];
  return s;
}

describe('encrypted backup', () => {
  it('round-trips a snapshot', async () => {
    const snap = sampleSnapshot();
    expect(await readBackup(await createBackup(snap, PASS, FAST), PASS)).toEqual(snap);
  });

  it('does not contain readable data', async () => {
    const text = await createBackup(sampleSnapshot(), PASS, FAST);
    expect(text).not.toContain('coffee');
    expect(JSON.parse(text)).toMatchObject({
      format: 'funancial-backup',
      version: 1,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1_000 },
      cipher: { name: 'AES-GCM' },
    });
  });

  it('refuses a short passphrase', async () => {
    await expect(createBackup(sampleSnapshot(), 'short', FAST)).rejects.toThrow(
      'Use at least 8 characters.',
    );
  });

  it('rejects a wrong passphrase', async () => {
    const text = await createBackup(sampleSnapshot(), PASS, FAST);
    await expect(readBackup(text, 'battery staple')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('detects tampering', async () => {
    const text = await createBackup(sampleSnapshot(), PASS, FAST);
    const file = JSON.parse(text) as { data: string };
    const i = Math.floor(file.data.length / 2);
    const swapped = file.data[i] === 'A' ? 'B' : 'A';
    file.data = file.data.slice(0, i) + swapped + file.data.slice(i + 1);
    await expect(readBackup(JSON.stringify(file), PASS)).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('rejects truncated text and other files with a plain message', async () => {
    const text = await createBackup(sampleSnapshot(), PASS, FAST);
    await expect(readBackup(text.slice(0, 40), PASS)).rejects.toThrow(
      new InvalidBackupError("This file isn't a Funancial backup."),
    );
    await expect(readBackup('{"format":"something-else"}', PASS)).rejects.toBeInstanceOf(
      InvalidBackupError,
    );
    await expect(readBackup('', PASS)).rejects.toBeInstanceOf(InvalidBackupError);
  });

  it('rejects backups from a newer version', async () => {
    const text = await createBackup(sampleSnapshot(), PASS, FAST);
    const newer = JSON.stringify({ ...JSON.parse(text), version: 2 });
    await expect(readBackup(newer, PASS)).rejects.toThrow(/newer version of Funancial/);

    const futureData = { ...sampleSnapshot(), schemaVersion: 99 };
    const futureText = await createBackup(futureData, PASS, FAST);
    await expect(readBackup(futureText, PASS)).rejects.toThrow(/newer version of Funancial/);
  });

  it('refuses absurd key-derivation settings instead of hanging', async () => {
    const text = await createBackup(sampleSnapshot(), PASS, FAST);
    const file = JSON.parse(text) as { kdf: { iterations: number } };
    file.kdf.iterations = 1e12;
    await expect(readBackup(JSON.stringify(file), PASS)).rejects.toBeInstanceOf(InvalidBackupError);
  });
});

describe('plain export', () => {
  it('writes readable JSON with its format and timestamp', () => {
    const snap = sampleSnapshot();
    const parsed = JSON.parse(exportPlainJson(snap, new Date('2026-10-14T10:00:00.000Z')));
    expect(parsed).toEqual({
      format: 'funancial-export',
      schemaVersion: 2,
      exportedAt: '2026-10-14T10:00:00.000Z',
      data: snap,
    });
  });
});

describe('file names', () => {
  it('are dated by the local day', () => {
    expect(backupFileName(new Date(2026, 9, 14, 23, 30))).toBe(
      'funancial-backup-2026-10-14.funbak',
    );
    expect(exportFileName(new Date(2026, 0, 2))).toBe('funancial-export-2026-01-02.json');
  });
});

describe('older backups', () => {
  it('restores a v1 backup with subscription anchor days', async () => {
    const v1 = emptySnapshot() as unknown as DataSnapshot;
    v1.schemaVersion = 1;
    const sub = { ...makeSubscription({ id: 's1', nextRenewal: '2026-12-31' }) } as Record<
      string,
      unknown
    >;
    delete sub.anchorDay;
    (v1.tables as unknown as Record<string, unknown[]>).subscription = [sub];
    const restored = await readBackup(await createBackup(v1, PASS, FAST), PASS);
    expect(restored.schemaVersion).toBe(2);
    expect(restored.tables.subscription[0]?.anchorDay).toBe(31);
  });
});
