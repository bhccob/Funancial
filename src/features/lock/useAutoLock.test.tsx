import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformProvider } from '@/platform/PlatformProvider';
import type { Platform } from '@/platform/types';
import { createWebPlatform } from '@/platform/web';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import { createStubStore } from '@/test/appStoreStub';
import { useAutoLock } from './useAutoLock';

afterEach(() => vi.useRealTimers());

/** A platform whose pause and resume the test fires by hand: the app's own signals, no page visibility. */
function nativePlatform() {
  const paused = new Set<() => void>();
  const resumed = new Set<() => void>();
  const platform: Platform = {
    ...createWebPlatform(),
    kind: 'android',
    onPause: (cb) => {
      paused.add(cb);
      return () => void paused.delete(cb);
    },
    onResume: (cb) => {
      resumed.add(cb);
      return () => void resumed.delete(cb);
    },
  };
  return {
    platform,
    pause: () => act(() => paused.forEach((cb) => cb())),
    resume: () => act(() => resumed.forEach((cb) => cb())),
    listeners: () => paused.size + resumed.size,
  };
}

function AutoLockProbe({ minutes }: { minutes: number }) {
  useAutoLock(minutes);
  return null;
}

function renderProbe(minutes: number, platform: Platform) {
  const store = createStubStore();
  const view = render(
    <PlatformProvider platform={platform}>
      <AppStoreProvider store={store}>
        <AutoLockProbe minutes={minutes} />
      </AppStoreProvider>
    </PlatformProvider>,
  );
  return { ...view, lock: store.getState().lock };
}

describe('useAutoLock on a native platform', () => {
  it('locks on resume after being away longer than the timeout, from platform pause and resume alone', () => {
    vi.useFakeTimers();
    const native = nativePlatform();
    const { lock } = renderProbe(1, native.platform);

    native.pause();
    // Timers are frozen while the app is in the background; only the clock moves on.
    vi.setSystemTime(Date.now() + 61_000);
    expect(lock).not.toHaveBeenCalled();
    native.resume();

    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('keeps the app unlocked after a short absence and starts the idle clock again', () => {
    vi.useFakeTimers();
    const native = nativePlatform();
    const { lock } = renderProbe(1, native.platform);

    native.pause();
    vi.setSystemTime(Date.now() + 30_000);
    native.resume();
    expect(lock).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(59_000));
    expect(lock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_001));
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('counts the whole time away when pause is reported more than once', () => {
    vi.useFakeTimers();
    const native = nativePlatform();
    const { lock } = renderProbe(1, native.platform);

    native.pause();
    vi.setSystemTime(Date.now() + 40_000);
    native.pause();
    vi.setSystemTime(Date.now() + 40_000);
    native.resume();

    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('stops listening when it unmounts, and never listens when auto-lock is off', () => {
    const native = nativePlatform();
    const { unmount } = renderProbe(1, native.platform);
    expect(native.listeners()).toBe(2);
    unmount();
    expect(native.listeners()).toBe(0);

    const off = renderProbe(0, native.platform);
    expect(native.listeners()).toBe(0);
    off.unmount();
  });
});
