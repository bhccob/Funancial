import type { CapacitorConfig } from '@capacitor/cli';
import { afterEach, describe, expect, it, vi } from 'vitest';
import appConfig from '../../capacitor.config';

const config: CapacitorConfig = appConfig;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('capacitor.config', () => {
  it('keeps the native bridge from logging plugin calls and results, even in a debug build', () => {
    // With logging on, the bridge writes every plugin call and result to the WebView console and
    // logcat, and those include the biometric copy of the data key.
    expect(config.loggingBehavior).toBe('none');
    // A platform setting would override the global one.
    expect(config.android?.loggingBehavior ?? 'none').toBe('none');
  });

  it('points at the dev server only when asked', async () => {
    // The installed app must load its bundled files. Only `npm run android:dev` sets the variable,
    // for live reload; over `adb reverse` that http://localhost address is a secure context.
    vi.stubEnv('FUNANCIAL_DEV_URL', undefined);
    vi.resetModules();
    const bundled: CapacitorConfig = (await import('../../capacitor.config')).default;
    expect(bundled.server).toBeUndefined();

    vi.stubEnv('FUNANCIAL_DEV_URL', 'http://localhost:5173');
    vi.resetModules();
    const live: CapacitorConfig = (await import('../../capacitor.config')).default;
    expect(live.server?.url).toBe('http://localhost:5173');
    expect(live.server?.cleartext).toBe(true);
    // Live reload must not turn the bridge's logging back on.
    expect(live.loggingBehavior).toBe('none');
  });
});
