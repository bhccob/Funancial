import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { PlatformProvider } from '@/platform/PlatformProvider';
import type { Notifier } from '@/platform/types';
import { createWebPlatform } from '@/platform/web';

/**
 * A notifier whose methods are spies. By default the phone allows notifications and everything
 * succeeds; `over` swaps in the behaviour of the methods a test cares about.
 */
export function fakeNotifier(over: Partial<Notifier> = {}) {
  return {
    permission: vi.fn<Notifier['permission']>(over.permission ?? (async () => 'granted')),
    request: vi.fn<Notifier['request']>(over.request ?? (async () => true)),
    replace: vi.fn<Notifier['replace']>(over.replace ?? (async () => {})),
    sendTest: vi.fn<Notifier['sendTest']>(over.sendTest ?? (async () => {})),
    onOpen: vi.fn<Notifier['onOpen']>(over.onOpen ?? (() => () => {})),
  } satisfies Notifier;
}
export type FakeNotifier = ReturnType<typeof fakeNotifier>;

/** The app as it runs on the phone, with `notifier` in place of the Android plugin (`null`: none). */
export function onPhone(notifier: Notifier | null, ui: ReactNode) {
  return (
    <PlatformProvider platform={{ ...createWebPlatform(), kind: 'android', notifier }}>
      {ui}
    </PlatformProvider>
  );
}
