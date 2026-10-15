import { act } from '@testing-library/react';
import { listen } from '@/platform/android/listen';
import type { Platform } from '@/platform/types';
import { createWebPlatform } from '@/platform/web';

type AppEvent = 'pause' | 'resume';

/**
 * The phone app going to the background and coming back, delivered the way Capacitor delivers
 * them, through the `listen` the Android platform uses.
 *
 * When the event happens, the native side queues one message per listener it has, and each
 * message runs as its own task. Removing a listener takes a round trip. So a listener removed
 * after the event, say by an unmount that an earlier message caused, still has its message on
 * the way. `queue` takes the messages at the moment of the event; calling what it returns
 * delivers them.
 */
export function fakeAppLifecycle(over: Partial<Platform> = {}) {
  const native: Record<AppEvent, Set<() => void>> = { pause: new Set(), resume: new Set() };
  const addListener = (event: AppEvent) => async (handler: () => void) => {
    native[event].add(handler);
    return { remove: async () => void native[event].delete(handler) };
  };
  const queue = (event: AppEvent) => {
    const messages = [...native[event]];
    return () => messages.forEach((message) => act(() => message()));
  };
  const platform: Platform = {
    ...createWebPlatform(),
    kind: 'android',
    onPause: (cb) => listen(addListener('pause'), cb, 'the app going to the background'),
    onResume: (cb) => listen(addListener('resume'), cb, 'the app coming back'),
    ...over,
  };
  return {
    platform,
    pause: () => queue('pause')(),
    resume: () => queue('resume')(),
    queue,
    /** Listeners the native side still has. Removal is asynchronous, so this lags an unsubscribe. */
    listeners: () => native.pause.size + native.resume.size,
  };
}
