import { describe, expect, it } from 'vitest';
import { makeExpense, makeProfile } from '@/test/fixtures';
import {
  CURRENT_SCHEMA_VERSION,
  emptySnapshot,
  migrateSnapshot,
  SchemaVersionError,
  SnapshotSchema,
  TABLES,
} from './snapshot';

describe('emptySnapshot', () => {
  it('has every table and validates', () => {
    const s = emptySnapshot();
    expect(Object.keys(s.tables).sort()).toEqual([...TABLES].sort());
    expect(s.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(SnapshotSchema.safeParse(s).success).toBe(true);
  });
});

describe('SnapshotSchema', () => {
  it('rejects duplicate ids within a table', () => {
    const s = emptySnapshot();
    s.tables.expense = [makeExpense({ id: 'e1' }), makeExpense({ id: 'e1' })];
    expect(SnapshotSchema.safeParse(s).success).toBe(false);
  });
  it('allows at most one profile', () => {
    const s = emptySnapshot();
    s.tables.profile = [makeProfile(), makeProfile()];
    expect(SnapshotSchema.safeParse(s).success).toBe(false);
  });
});

describe('migrateSnapshot', () => {
  it('passes a valid current-version snapshot through unchanged', () => {
    const s = emptySnapshot();
    s.tables.expense = [makeExpense({ id: 'e1' })];
    expect(migrateSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('refuses snapshots from a newer version', () => {
    expect(() => migrateSnapshot({ ...emptySnapshot(), schemaVersion: 99 })).toThrow(
      SchemaVersionError,
    );
  });
  it('rejects malformed content', () => {
    expect(() => migrateSnapshot({ schemaVersion: 1, tables: { expense: 'nope' } })).toThrow();
    expect(() => migrateSnapshot('garbage')).toThrow();
  });
});
