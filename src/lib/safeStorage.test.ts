import { afterEach, expect, it, vi } from 'vitest';
import { memoryStorage, throwingStorage } from '@/test/storage';
import { safeStorage } from './safeStorage';

afterEach(() => vi.unstubAllGlobals());

it('reads, writes and removes through localStorage', () => {
  vi.stubGlobal('localStorage', memoryStorage());
  expect(safeStorage.set('k', 'v')).toBe(true);
  expect(safeStorage.get('k')).toBe('v');
  safeStorage.remove('k');
  expect(safeStorage.get('k')).toBeNull();
});

it('reports failure instead of throwing when storage is blocked', () => {
  vi.stubGlobal('localStorage', throwingStorage());
  expect(safeStorage.set('k', 'v')).toBe(false);
  expect(safeStorage.get('k')).toBeNull();
  expect(() => safeStorage.remove('k')).not.toThrow();
});

it('copes with localStorage being absent', () => {
  vi.stubGlobal('localStorage', undefined);
  expect(safeStorage.set('k', 'v')).toBe(false);
  expect(safeStorage.get('k')).toBeNull();
});
