import { z } from 'zod';
import { toLocalDate } from '@/domain/dates';
import {
  CURRENT_SCHEMA_VERSION,
  migrateSnapshot,
  SchemaVersionError,
  type DataSnapshot,
} from '@/domain/snapshot';
import { base64ToBytes, bytesToBase64, randomBytes, utf8 } from './crypto';
import { deriveKey, KDF_ITERATIONS, validateSecret, WrongSecretError } from './keys';

const FORMAT = 'funancial-backup';
const VERSION = 1;
/** Binds the ciphertext to this file format. */
const AAD = utf8(`${FORMAT}:v${VERSION}`);
/** Upper bound on PBKDF2 work a file may ask for, so a hostile file can't hang the app. */
const MAX_ITERATIONS = 10_000_000;

const NOT_A_BACKUP = "This file isn't a Funancial backup.";
const TOO_NEW = 'This backup was made by a newer version of Funancial.';

export class InvalidBackupError extends Error {
  constructor(message: string = NOT_A_BACKUP, cause?: unknown) {
    super(message, { cause });
    this.name = 'InvalidBackupError';
  }
}

const EnvelopeSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(VERSION),
  createdAt: z.string(),
  kdf: z.object({
    name: z.literal('PBKDF2'),
    hash: z.literal('SHA-256'),
    iterations: z.number().int().min(1).max(MAX_ITERATIONS),
    salt: z.base64(),
  }),
  cipher: z.object({ name: z.literal('AES-GCM'), iv: z.base64() }),
  data: z.base64(),
});
type Envelope = z.infer<typeof EnvelopeSchema>;

export async function createBackup(
  snapshot: DataSnapshot,
  passphrase: string,
  opts: { iterations?: number; now?: Date } = {},
): Promise<string> {
  const problem = validateSecret(passphrase, 'passphrase');
  if (problem) throw new Error(problem);

  const iterations = opts.iterations ?? KDF_ITERATIONS;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, iterations, 'encrypt');
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD },
    key,
    utf8(JSON.stringify(snapshot)),
  );
  const envelope: Envelope = {
    format: FORMAT,
    version: VERSION,
    createdAt: (opts.now ?? new Date()).toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    data: bytesToBase64(new Uint8Array(data)),
  };
  return JSON.stringify(envelope);
}

function parseEnvelope(text: string): Envelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new InvalidBackupError(NOT_A_BACKUP, e);
  }
  if (typeof raw !== 'object' || raw === null || !('format' in raw) || raw.format !== FORMAT) {
    throw new InvalidBackupError();
  }
  if ('version' in raw && typeof raw.version === 'number' && raw.version > VERSION) {
    throw new InvalidBackupError(TOO_NEW);
  }
  const parsed = EnvelopeSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidBackupError(NOT_A_BACKUP, parsed.error);
  return parsed.data;
}

/** Decrypt and validate a backup. Never touches stored data; callers replace only on success. */
export async function readBackup(text: string, passphrase: string): Promise<DataSnapshot> {
  const envelope = parseEnvelope(text);

  let plain: ArrayBuffer;
  try {
    const key = await deriveKey(
      passphrase,
      base64ToBytes(envelope.kdf.salt),
      envelope.kdf.iterations,
      'encrypt',
    );
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.cipher.iv), additionalData: AAD },
      key,
      base64ToBytes(envelope.data),
    );
  } catch (e) {
    throw new WrongSecretError(e);
  }

  try {
    return migrateSnapshot(JSON.parse(new TextDecoder().decode(plain)));
  } catch (e) {
    if (e instanceof SchemaVersionError) throw new InvalidBackupError(TOO_NEW, e);
    throw new InvalidBackupError(NOT_A_BACKUP, e);
  }
}

export function exportPlainJson(snapshot: DataSnapshot, now: Date = new Date()): string {
  return JSON.stringify(
    {
      format: 'funancial-export',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      data: snapshot,
    },
    null,
    2,
  );
}

export function backupFileName(now: Date): string {
  return `funancial-backup-${toLocalDate(now)}.funbak`;
}

export function exportFileName(now: Date): string {
  return `funancial-export-${toLocalDate(now)}.json`;
}
