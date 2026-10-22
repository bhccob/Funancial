// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@/test/storage';

/** A fresh copy of both modules, so no test keeps the claims or listeners of an earlier one. */
async function load() {
  vi.resetModules();
  const [bars, theme] = await Promise.all([import('./systemBars'), import('./theme')]);
  return { ...bars, ...theme };
}

function stubMatchMedia(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  stubMatchMedia(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

/** Starts the theme as `preference` and returns what `onBarsBackground` has said so far. */
async function listen(preference: 'light' | 'dark') {
  const modules = await load();
  localStorage.setItem('funancial.theme', preference);
  modules.initTheme();
  const heard = vi.fn();
  modules.onBarsBackground(heard);
  return { ...modules, heard };
}

describe('onBarsBackground', () => {
  it('is light on the light theme with no claim, from the first call', async () => {
    const { heard } = await listen('light');
    expect(heard).toHaveBeenCalledExactlyOnceWith('light');
  });

  it('is dark while a claim is held, and light again once it is released', async () => {
    const { claimDarkTop, heard } = await listen('light');

    const release = claimDarkTop();
    expect(heard).toHaveBeenLastCalledWith('dark');
    release();
    expect(heard).toHaveBeenLastCalledWith('light');
  });

  it('stays dark while any one of two claims is held', async () => {
    const { claimDarkTop, heard } = await listen('light');
    const first = claimDarkTop();
    const second = claimDarkTop();

    first();
    expect(heard).toHaveBeenLastCalledWith('dark');
    second();
    expect(heard).toHaveBeenLastCalledWith('light');
  });

  it('is dark on the dark theme, with or without a claim', async () => {
    const { claimDarkTop, heard } = await listen('dark');
    expect(heard).toHaveBeenLastCalledWith('dark');

    const release = claimDarkTop();
    expect(heard).toHaveBeenLastCalledWith('dark');
    release();
    expect(heard).toHaveBeenLastCalledWith('dark');
  });

  it('follows the theme as it changes, a claim held across the change', async () => {
    const { claimDarkTop, setThemePreference, heard } = await listen('light');
    const release = claimDarkTop();

    setThemePreference('dark');
    release();
    expect(heard).toHaveBeenLastCalledWith('dark');
    setThemePreference('light');
    expect(heard).toHaveBeenLastCalledWith('light');
  });

  it('calls back only when the background changes', async () => {
    const { claimDarkTop, setThemePreference, heard } = await listen('light');
    setThemePreference('light');
    expect(heard.mock.calls).toEqual([['light']]);

    setThemePreference('dark');
    claimDarkTop();
    expect(heard.mock.calls).toEqual([['light'], ['dark']]);
  });

  it('tells a late listener the background as it stands', async () => {
    const { claimDarkTop, onBarsBackground } = await listen('light');
    claimDarkTop();
    const late = vi.fn();

    onBarsBackground(late);

    expect(late).toHaveBeenCalledExactlyOnceWith('dark');
  });

  it('stops calling back once unsubscribed', async () => {
    const { claimDarkTop, onBarsBackground } = await load();
    const heard = vi.fn();
    const stop = onBarsBackground(heard);

    stop();
    claimDarkTop();

    expect(heard).not.toHaveBeenCalled();
  });
});

describe('claimDarkTop', () => {
  it('releases once: a second call takes back no other claim and does not go below zero', async () => {
    const { claimDarkTop, heard } = await listen('light');
    const first = claimDarkTop();
    const second = claimDarkTop();

    first();
    first();
    expect(heard).toHaveBeenLastCalledWith('dark');

    second();
    expect(heard).toHaveBeenLastCalledWith('light');
    // The count is back at zero, not under it: one claim is enough to turn the bars dark again.
    const third = claimDarkTop();
    expect(heard).toHaveBeenLastCalledWith('dark');
    third();
    expect(heard).toHaveBeenLastCalledWith('light');
  });

  it('counts the claim and tells the other listeners when one listener throws, and logs it', async () => {
    const { claimDarkTop, onBarsBackground, heard } = await listen('light');
    const failure = new Error('bridge down');
    let throwing = false;
    onBarsBackground(() => {
      if (throwing) throw failure;
    });
    const after = vi.fn();
    onBarsBackground(after);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    throwing = true;

    const release = claimDarkTop();
    expect(heard).toHaveBeenLastCalledWith('dark');
    expect(after).toHaveBeenLastCalledWith('dark');
    release();
    expect(heard).toHaveBeenLastCalledWith('light');
    expect(after).toHaveBeenLastCalledWith('light');

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('status bar'), failure);
    consoleError.mockRestore();
  });
});
