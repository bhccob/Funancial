import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLastSpend } from './useLastSpend';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T10:00:00.000Z'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useLastSpend.setState({ last: null });
});

describe('useLastSpend', () => {
  it('holds nothing until a spend is saved', () => {
    expect(useLastSpend.getState().last).toBeNull();
  });

  it('records which account, how much and when', () => {
    useLastSpend.getState().record('acct-main', 12_50);
    expect(useLastSpend.getState().last).toEqual({
      accountId: 'acct-main',
      amount: 12_50,
      at: Date.parse('2026-10-14T10:00:00.000Z'),
    });
  });

  it('keeps only the latest spend, with its own time', () => {
    useLastSpend.getState().record('acct-main', 12_50);
    vi.advanceTimersByTime(5_000);
    useLastSpend.getState().record('visa', 45_00);
    expect(useLastSpend.getState().last).toEqual({
      accountId: 'visa',
      amount: 45_00,
      at: Date.parse('2026-10-14T10:00:05.000Z'),
    });
  });

  it('is a new object for each spend, even a repeat of the last one in the same instant', () => {
    useLastSpend.getState().record('acct-main', 12_50);
    const first = useLastSpend.getState().last;
    useLastSpend.getState().record('acct-main', 12_50);
    expect(useLastSpend.getState().last).not.toBe(first);
    expect(useLastSpend.getState().last).toEqual(first);
  });

  it('is only in memory: nothing is written to storage, and a fresh start holds nothing', async () => {
    const stored: string[] = [];
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: (key: string) => void stored.push(key),
      removeItem: () => {},
    });
    useLastSpend.getState().record('acct-main', 12_50);
    expect(stored).toEqual([]);
    vi.resetModules();
    const reopened = await import('./useLastSpend');
    expect(reopened.useLastSpend.getState().last).toBeNull();
  });
});
