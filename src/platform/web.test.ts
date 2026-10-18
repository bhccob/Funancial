import { describe, expect, it, vi } from 'vitest';
import { browserKeyring } from '@/data/keyring';
import { createWebPlatform } from './web';

describe('createWebPlatform', () => {
  it('the web platform keeps browser storage and a device key', () => {
    const platform = createWebPlatform();

    expect(platform.kind).toBe('web');
    expect(platform.keyring).toBe(browserKeyring);
    expect(platform.biometric).toBeNull();
    expect(platform.notifier).toBeNull();
  });

  it('has no app version, since a web page is not an installed build', async () => {
    await expect(createWebPlatform().appVersion()).resolves.toBeNull();
  });

  it('reports a resume when the page becomes visible again', () => {
    const platform = createWebPlatform();
    const resumed = vi.fn();
    const stop = platform.onResume(resumed);
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resumed).not.toHaveBeenCalled();

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resumed).toHaveBeenCalledTimes(1);

    stop();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resumed).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it('reports a pause when the page is hidden', () => {
    const platform = createWebPlatform();
    const paused = vi.fn();
    const stop = platform.onPause(paused);
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(paused).not.toHaveBeenCalled();

    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(paused).toHaveBeenCalledTimes(1);

    stop();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(paused).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });
});
