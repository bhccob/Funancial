import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformProvider } from '@/platform/PlatformProvider';
import type { Platform } from '@/platform/types';
import { AppStoreProvider, useApp } from '@/store/AppStoreProvider';
import { createStubStore } from '@/test/appStoreStub';
import { fakeAppLifecycle } from '@/test/fakeAppLifecycle';
import { useAutoLock } from './useAutoLock';

afterEach(() => {
  vi.useRealTimers();
  // Back to jsdom's own answer.
  Reflect.deleteProperty(document, 'visibilityState');
});

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
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
    const native = fakeAppLifecycle();
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
    const native = fakeAppLifecycle();
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
    const native = fakeAppLifecycle();
    const { lock } = renderProbe(1, native.platform);

    native.pause();
    vi.setSystemTime(Date.now() + 40_000);
    native.pause();
    vi.setSystemTime(Date.now() + 40_000);
    native.resume();

    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('stops listening when it unmounts, and never listens when auto-lock is off', async () => {
    const native = fakeAppLifecycle();
    const { unmount } = renderProbe(1, native.platform);
    expect(native.listeners()).toBe(2);
    unmount();
    // Capacitor removes a listener asynchronously.
    await vi.waitFor(() => expect(native.listeners()).toBe(0));

    const off = renderProbe(0, native.platform);
    expect(native.listeners()).toBe(0);
    off.unmount();
  });

  it('leaves no idle clock behind when coming back locks the app', () => {
    // The page reports coming back first: that locks the app, and the lock unmounts this hook.
    // The app's own resume was queued for it before the unmount. Were it to start the idle clock
    // in the unmounted hook, nothing would stop that clock, and it would lock the app a minute
    // after the next unlock, however busy the person was.
    vi.useFakeTimers();
    const native = fakeAppLifecycle();
    const store = createStubStore({ lockMode: 'pin' });
    const lock = vi.fn(() => store.setState({ phase: 'locked' }));
    store.setState({ lock });
    function LockingRoot() {
      const unlocked = useApp((s) => s.phase === 'unlocked');
      return unlocked ? <AutoLockProbe minutes={1} /> : null;
    }
    render(
      <PlatformProvider platform={native.platform}>
        <AppStoreProvider store={store}>
          <LockingRoot />
        </AppStoreProvider>
      </PlatformProvider>,
    );

    native.pause();
    setVisibility('hidden');
    vi.setSystemTime(Date.now() + 61_000);
    const resumed = native.queue('resume');
    setVisibility('visible');
    expect(lock).toHaveBeenCalledTimes(1);
    resumed();

    act(() => store.setState({ phase: 'unlocked' }));
    // Two busy minutes: a tap every 20 seconds.
    for (let i = 0; i < 6; i++) {
      act(() => vi.advanceTimersByTime(20_000));
      window.dispatchEvent(new Event('pointerdown'));
    }

    expect(lock).toHaveBeenCalledTimes(1);
    expect(store.getState().phase).toBe('unlocked');
  });
});
