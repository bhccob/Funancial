// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage, throwingStorage } from '@/test/storage';
import { getThemePreference, initTheme, resolveTheme, setThemePreference } from './theme';

function fakeMatchMedia(initiallyDark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql = {
    matches: initiallyDark,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
  };
  return {
    matchMedia: vi.fn(() => mql),
    setDark(dark: boolean) {
      mql.matches = dark;
      listeners.forEach((fn) => fn({ matches: dark }));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('resolveTheme', () => {
  it('follows the OS for system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
  it('lets an explicit choice win over the OS', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('preference storage', () => {
  it('round-trips a saved preference', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    setThemePreference('dark');
    expect(getThemePreference()).toBe('dark');
  });
  it('falls back to system when storage throws', () => {
    vi.stubGlobal('localStorage', throwingStorage());
    expect(getThemePreference()).toBe('system');
  });
  it('ignores an unknown stored value', () => {
    const storage = memoryStorage();
    storage.setItem('funancial.theme', 'purple');
    vi.stubGlobal('localStorage', storage);
    expect(getThemePreference()).toBe('system');
  });
});

describe('initTheme', () => {
  let media: ReturnType<typeof fakeMatchMedia>;
  beforeEach(() => {
    media = fakeMatchMedia(true);
    vi.stubGlobal('matchMedia', media.matchMedia);
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('applies the OS theme and follows OS changes until unsubscribed', () => {
    const stop = initTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
    media.setDark(false);
    expect(document.documentElement.dataset.theme).toBe('light');
    stop();
    media.setDark(true);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('applies a newly chosen preference immediately and keeps it over OS changes', () => {
    const stop = initTheme();
    setThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    media.setDark(true);
    expect(document.documentElement.dataset.theme).toBe('light');
    stop();
  });
});
