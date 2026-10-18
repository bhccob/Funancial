import { act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { safeStorage } from '@/lib/safeStorage';
import { throwingStorage } from '@/test/storage';
import { HIDDEN_AMOUNT, useAmountsHidden } from './useAmountsHidden';

// What the person chose lives on this device only, under its own key.
const KEY = 'funancial.hideAmounts';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  useAmountsHidden.setState({ hidden: false });
});

it('writes a hidden amount as four bullets', () => {
  expect(HIDDEN_AMOUNT).toBe('••••');
});

it('starts shown, flips on toggle and keeps the choice on this device', () => {
  expect(useAmountsHidden.getState().hidden).toBe(false);
  act(() => useAmountsHidden.getState().toggle());
  expect(useAmountsHidden.getState().hidden).toBe(true);
  expect(safeStorage.get(KEY)).toBe('true');
  act(() => useAmountsHidden.getState().toggle());
  expect(useAmountsHidden.getState().hidden).toBe(false);
  expect(safeStorage.get(KEY)).toBe('false');
});

it('is still hidden when the app is opened again', async () => {
  safeStorage.set(KEY, 'true');
  vi.resetModules();
  const reopened = await import('./useAmountsHidden');
  expect(reopened.useAmountsHidden.getState().hidden).toBe(true);
});

it('is shown when nothing was chosen, and still toggles where storage is blocked', async () => {
  vi.stubGlobal('localStorage', throwingStorage());
  vi.resetModules();
  const fresh = await import('./useAmountsHidden');
  expect(fresh.useAmountsHidden.getState().hidden).toBe(false);
  act(() => fresh.useAmountsHidden.getState().toggle());
  expect(fresh.useAmountsHidden.getState().hidden).toBe(true);
});
