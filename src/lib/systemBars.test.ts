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

  it('is the theme with no claim: dark on the dark theme', async () => {
    const { heard } = await listen('dark');
    expect(heard).toHaveBeenCalledExactlyOnceWith('dark');
  });

  it('is dark while a dark claim is held, and the theme again once it is released', async () => {
    const { claimTop, heard } = await listen('light');

    const release = claimTop('dark');
    expect(heard).toHaveBeenLastCalledWith('dark');
    release();
    expect(heard).toHaveBeenLastCalledWith('light');
  });

  it('is light under a light claim on the dark theme: a light block asks for dark icons', async () => {
    const { claimTop, heard } = await listen('dark');

    const release = claimTop('light');
    expect(heard).toHaveBeenLastCalledWith('light');
    release();
    expect(heard).toHaveBeenLastCalledWith('dark');
  });

  it('follows the most recent claim still held', async () => {
    const { claimTop, heard } = await listen('light');
    const dark = claimTop('dark');
    const light = claimTop('light');
    expect(heard).toHaveBeenLastCalledWith('light');

    // The newer claim goes: the older one says what is there again.
    light();
    expect(heard).toHaveBeenLastCalledWith('dark');
    dark();
    expect(heard).toHaveBeenLastCalledWith('light');
  });

  it('keeps to the newer claim when an older one is released first', async () => {
    const { claimTop, heard } = await listen('dark');
    const older = claimTop('dark');
    const newer = claimTop('light');

    older();
    expect(heard).toHaveBeenLastCalledWith('light');
    newer();
    expect(heard).toHaveBeenLastCalledWith('dark');
  });

  it('follows the theme as it changes once no claim is held, a claim held across the change', async () => {
    const { claimTop, setThemePreference, heard } = await listen('light');
    const release = claimTop('light');

    setThemePreference('dark');
    // The claim still says what is behind the bar.
    expect(heard).toHaveBeenLastCalledWith('light');
    release();
    expect(heard).toHaveBeenLastCalledWith('dark');
    setThemePreference('light');
    expect(heard).toHaveBeenLastCalledWith('light');
  });

  it('calls back only when the background changes', async () => {
    const { claimTop, setThemePreference, heard } = await listen('light');
    setThemePreference('light');
    claimTop('light');
    expect(heard.mock.calls).toEqual([['light']]);

    setThemePreference('dark');
    claimTop('dark');
    expect(heard.mock.calls).toEqual([['light'], ['dark']]);
  });

  it('tells a late listener the background as it stands', async () => {
    const { claimTop, onBarsBackground } = await listen('dark');
    claimTop('light');
    const late = vi.fn();

    onBarsBackground(late);

    expect(late).toHaveBeenCalledExactlyOnceWith('light');
  });

  it('stops calling back once unsubscribed', async () => {
    const { claimTop, onBarsBackground } = await load();
    const heard = vi.fn();
    const stop = onBarsBackground(heard);

    stop();
    claimTop('dark');

    expect(heard).not.toHaveBeenCalled();
  });
});

describe('claimTop', () => {
  it('releases once: a second call takes back no other claim', async () => {
    const { claimTop, heard } = await listen('light');
    const first = claimTop('dark');
    const second = claimTop('dark');

    first();
    first();
    expect(heard).toHaveBeenLastCalledWith('dark');

    second();
    expect(heard).toHaveBeenLastCalledWith('light');
    // Nothing is left over: one claim is enough to turn the bars dark again, and its release undoes it.
    const third = claimTop('dark');
    expect(heard).toHaveBeenLastCalledWith('dark');
    third();
    expect(heard).toHaveBeenLastCalledWith('light');
  });

  it('a second release of an older claim leaves the newer claims alone', async () => {
    const { claimTop, heard } = await listen('light');
    const older = claimTop('dark');
    const newer = claimTop('dark');

    older();
    older();
    expect(heard).toHaveBeenLastCalledWith('dark');
    newer();
    expect(heard).toHaveBeenLastCalledWith('light');
  });

  it('counts the claim and tells the other listeners when one listener throws, and logs it', async () => {
    const { claimTop, onBarsBackground, heard } = await listen('light');
    const failure = new Error('bridge down');
    let throwing = false;
    onBarsBackground(() => {
      if (throwing) throw failure;
    });
    const after = vi.fn();
    onBarsBackground(after);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    throwing = true;

    const release = claimTop('dark');
    expect(heard).toHaveBeenLastCalledWith('dark');
    expect(after).toHaveBeenLastCalledWith('dark');
    release();
    expect(heard).toHaveBeenLastCalledWith('light');
    expect(after).toHaveBeenLastCalledWith('light');

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('status bar'), failure);
    consoleError.mockRestore();
  });
});
