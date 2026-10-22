import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@/test/storage';

type Listener = (event: { canGoBack: boolean }) => void;

const native = vi.hoisted(() => ({
  listeners: {} as Record<string, Listener>,
  addListener: vi.fn(),
  minimizeApp: vi.fn(async () => {}),
  setStyle: vi.fn<(options: { style: string; bar?: string }) => Promise<void>>(async () => {}),
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: native.addListener, minimizeApp: native.minimizeApp },
}));
vi.mock('@capacitor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/core')>()),
  SystemBars: { setStyle: native.setStyle },
}));

/** A fresh copy of the shell and the modules it listens to, so no test hears an earlier one's. */
async function load() {
  vi.resetModules();
  const [{ installShell }, theme, dialogs, bars] = await Promise.all([
    import('./shell'),
    import('@/lib/theme'),
    import('@/lib/dialogStack'),
    import('@/lib/systemBars'),
  ]);
  return { installShell, ...theme, ...dialogs, ...bars };
}

function pressBack(canGoBack: boolean) {
  const listener = native.listeners.backButton;
  if (!listener) throw new Error('The shell never listened for the back button');
  listener({ canGoBack });
}

function stubMatchMedia(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  native.listeners = {};
  native.addListener.mockImplementation(async (event: string, cb: Listener) => {
    native.listeners[event] = cb;
    return { remove: async () => {} };
  });
  vi.stubGlobal('localStorage', memoryStorage());
  stubMatchMedia(false);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('installShell: back button', () => {
  it('closes an open dialog first', async () => {
    const { installShell, pushDialog } = await load();
    await installShell();
    const dialog = document.createElement('dialog');
    const cancelled = vi.fn();
    dialog.addEventListener('cancel', cancelled);
    pushDialog(dialog);
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});

    pressBack(true);

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(native.minimizeApp).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('goes back in history while there is some', async () => {
    const { installShell } = await load();
    await installShell();
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});

    pressBack(true);

    expect(back).toHaveBeenCalledTimes(1);
    expect(native.minimizeApp).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('backgrounds the app on the first screen', async () => {
    const { installShell } = await load();
    await installShell();
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});

    pressBack(false);

    expect(native.minimizeApp).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('logs a back button that cannot be listened to, and the app still starts', async () => {
    const failure = new Error('bridge down');
    native.addListener.mockRejectedValue(failure);
    const { installShell } = await load();

    await expect(installShell()).resolves.toBeUndefined();

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('back'), failure),
    );
  });
});

describe('installShell: system bars', () => {
  /** The style last asked of one bar, `'StatusBar'` or `'NavigationBar'`. */
  const styleOf = (bar: string) =>
    native.setStyle.mock.calls.filter(([options]) => options.bar === bar).at(-1)?.[0].style;

  it('sets light icons on a dark theme and dark icons on a light one, on both bars, as the theme changes', async () => {
    const { installShell, initTheme, setThemePreference } = await load();
    initTheme();
    await installShell();
    // The theme was applied before the shell was installed: its style is set straight away.
    expect([styleOf('StatusBar'), styleOf('NavigationBar')]).toEqual(['LIGHT', 'LIGHT']);

    setThemePreference('dark');
    expect([styleOf('StatusBar'), styleOf('NavigationBar')]).toEqual(['DARK', 'DARK']);
    setThemePreference('light');
    expect([styleOf('StatusBar'), styleOf('NavigationBar')]).toEqual(['LIGHT', 'LIGHT']);
  });

  it('sets light status-bar icons while a dark block holds the top of the screen, and leaves the navigation bar to the theme', async () => {
    const { installShell, initTheme, claimTop } = await load();
    initTheme();
    await installShell();

    const release = claimTop('dark');
    expect(styleOf('StatusBar')).toBe('DARK');
    // The bottom of the page is still light: its buttons keep their dark icons.
    expect(styleOf('NavigationBar')).toBe('LIGHT');
    release();
    expect(styleOf('StatusBar')).toBe('LIGHT');

    // Each style names its bar: one without a bar would land on both.
    for (const [options] of native.setStyle.mock.calls) expect(options.bar).toBeDefined();
    expect(native.setStyle).not.toHaveBeenCalledWith({ style: 'DARK', bar: 'NavigationBar' });
  });

  it('sets dark status-bar icons while a light block holds the top of the dark theme, and leaves the navigation bar to the theme', async () => {
    stubMatchMedia(true);
    const { installShell, initTheme, claimTop } = await load();
    initTheme();
    await installShell();

    const release = claimTop('light');
    expect(styleOf('StatusBar')).toBe('LIGHT');
    // The dark page still runs to the bottom edge: its buttons keep their light icons.
    expect(styleOf('NavigationBar')).toBe('DARK');
    release();
    expect(styleOf('StatusBar')).toBe('DARK');
    expect(native.setStyle).not.toHaveBeenCalledWith({ style: 'LIGHT', bar: 'NavigationBar' });
  });

  it('starts with light icons on both bars when the app opens in the dark theme', async () => {
    stubMatchMedia(true);
    const { installShell, initTheme } = await load();
    initTheme();

    await installShell();

    expect(native.setStyle.mock.calls).toEqual([
      [{ style: 'DARK', bar: 'StatusBar' }],
      [{ style: 'DARK', bar: 'NavigationBar' }],
    ]);
  });

  it('does not ask the system again for a style a bar already has', async () => {
    stubMatchMedia(true);
    const { installShell, initTheme, claimTop, setThemePreference } = await load();
    initTheme();
    await installShell();

    claimTop('dark')();
    setThemePreference('dark');

    expect(native.setStyle).toHaveBeenCalledTimes(2);
  });

  it('logs a style the system refuses instead of leaving the rejection unhandled', async () => {
    const failure = new Error('no activity');
    native.setStyle.mockRejectedValue(failure);
    const { installShell, initTheme } = await load();
    initTheme();

    await installShell();

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('system bar'), failure),
    );
  });
});
