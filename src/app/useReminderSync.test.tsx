import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { defaultSettings, type Settings } from '@/domain/entities';
import { upcomingReminders } from '@/domain/notifications';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { toastStore } from '@/lib/toast';
import { PlatformProvider } from '@/platform/PlatformProvider';
import type { Notifier, Platform } from '@/platform/types';
import { createWebPlatform } from '@/platform/web';
import type { AppState } from '@/store/appStore';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import { createStubStore } from '@/test/appStoreStub';
import { makeProfile, makeSettings } from '@/test/fixtures';
import { useReminderSync } from './useReminderSync';

/** 10:00 on a Wednesday, local time. */
const NOW = new Date(2026, 9, 14, 10, 0);
const NOW_LOCAL = '2026-10-14T10:00';
const SETTLE_MS = 1_000;

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  toastStore.setState({ toasts: [] });
});
afterEach(() => {
  vi.useRealTimers();
  consoleError.mockRestore();
});

/** A profile and settings with reminders `enabled`: the daily nudge and the rest at their defaults. */
function dataWith(enabled: boolean, extra: Partial<Settings> = {}) {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ onboardedAt: '2026-10-01T09:00:00.000Z' })];
  data.tables.settings = [
    makeSettings({
      reminders: { ...defaultSettings('2026-10-01T09:00:00.000Z').reminders, enabled },
      ...extra,
    }),
  ];
  return data;
}

function fakeNotifier() {
  return {
    permission: vi.fn<Notifier['permission']>(async () => 'granted'),
    request: vi.fn<Notifier['request']>(async () => true),
    replace: vi.fn<Notifier['replace']>(async () => {}),
    sendTest: vi.fn<Notifier['sendTest']>(async () => {}),
    onOpen: vi.fn<Notifier['onOpen']>(() => () => {}),
  };
}
type FakeNotifier = ReturnType<typeof fakeNotifier>;

/** A platform whose resume the test fires by hand. */
function nativePlatform(notifier: Notifier | null) {
  const resumed = new Set<() => void>();
  const platform: Platform = {
    ...createWebPlatform(),
    kind: 'android',
    notifier,
    onResume: (cb) => {
      resumed.add(cb);
      return () => void resumed.delete(cb);
    },
  };
  return {
    platform,
    resume: () => act(() => resumed.forEach((cb) => cb())),
    listeners: () => resumed.size,
  };
}

function Probe({ notifier }: { notifier: Notifier | null }) {
  useReminderSync(notifier);
  return null;
}

/** `withoutNotifier`: the web, where the platform has none (the fake is made, but never given). */
function setup(opts: { data?: DataSnapshot; withoutNotifier?: boolean } = {}) {
  const notifier = fakeNotifier();
  const given = opts.withoutNotifier ? null : notifier;
  const native = nativePlatform(given);
  const store: StoreApi<AppState> = createStubStore({
    phase: 'unlocked',
    namespace: 'real',
    data: opts.data ?? dataWith(true),
    today: '2026-10-14',
  });
  const view = render(
    <PlatformProvider platform={native.platform}>
      <AppStoreProvider store={store}>
        <Probe notifier={given} />
      </AppStoreProvider>
    </PlatformProvider>,
  );
  return { notifier, store, ...native, ...view };
}

/** Lets the debounce run out. Async, so the promise the hook awaits settles inside `act`. */
const settle = (ms = SETTLE_MS) => act(() => vi.advanceTimersByTimeAsync(ms));

const replaced = (notifier: FakeNotifier) =>
  notifier.replace.mock.calls.map(([reminders]) => reminders);

describe('useReminderSync', () => {
  it('schedules what the rules give after changes settle', async () => {
    const data = dataWith(true);
    const expected = upcomingReminders(data, NOW_LOCAL);
    expect(expected.length).toBeGreaterThan(0);
    const { notifier, store } = setup({ data });

    await settle(SETTLE_MS - 1);
    expect(notifier.replace).not.toHaveBeenCalled();
    await settle(1);
    expect(replaced(notifier)).toEqual([expected]);

    // Each change starts the wait again, so a burst of edits schedules once, with the last data.
    const first = dataWith(true, { weekStartsOn: 0 });
    act(() => store.setState({ data: first }));
    await settle(SETTLE_MS - 1);
    const last = dataWith(true, { weekStartsOn: 1, autoLockMinutes: 15 });
    act(() => store.setState({ data: last }));
    await settle(SETTLE_MS - 1);
    expect(notifier.replace).toHaveBeenCalledTimes(1);
    await settle(1);
    expect(replaced(notifier)).toEqual([expected, upcomingReminders(last, NOW_LOCAL)]);

    // A new day alone is a change too.
    vi.setSystemTime(new Date(2026, 9, 15, 7, 30));
    act(() => store.setState({ today: '2026-10-15' }));
    await settle();
    expect(notifier.replace).toHaveBeenCalledTimes(3);
    expect(replaced(notifier)[2]).toEqual(upcomingReminders(last, '2026-10-15T07:30'));
  });

  it('works out the reminders from the phone clock when it runs, not when it was asked', async () => {
    const data = dataWith(true);
    const { notifier } = setup({ data });

    vi.setSystemTime(new Date(2026, 9, 14, 21, 30));
    await settle();

    // Today's 20:00 nudge was still ahead when the change was made and has passed by now.
    expect(upcomingReminders(data, NOW_LOCAL).map((r) => r.key)).toContain('daily:2026-10-14');
    expect(replaced(notifier)).toEqual([upcomingReminders(data, '2026-10-14T21:30')]);
    expect(replaced(notifier)[0]?.map((r) => r.key)).not.toContain('daily:2026-10-14');
  });

  it('clears reminders in demo and when turned off', async () => {
    const { notifier, store } = setup();
    await settle();
    expect(replaced(notifier)[0]?.length).toBeGreaterThan(0);

    // Demo data never reaches the phone, whatever its settings say.
    act(() => store.setState({ namespace: 'demo' }));
    await settle();
    expect(replaced(notifier)[1]).toEqual([]);

    act(() => store.setState({ namespace: 'real' }));
    await settle();
    expect(replaced(notifier)[2]?.length).toBeGreaterThan(0);

    // Turned off in Settings: the rules give nothing, so the phone's reminders are cleared.
    act(() => store.setState({ data: dataWith(false) }));
    await settle();
    expect(replaced(notifier)[3]).toEqual([]);
    expect(notifier.replace).toHaveBeenCalledTimes(4);
  });

  it('reschedules when the app comes back', async () => {
    const { notifier, store, resume } = setup();
    await settle();
    expect(notifier.replace).toHaveBeenCalledTimes(1);

    // Hours later, with nothing changed in the app: the phone's list has moved on.
    vi.setSystemTime(new Date(2026, 9, 14, 21, 30));
    resume();
    expect(notifier.replace).toHaveBeenCalledTimes(2);
    expect(replaced(notifier)[1]).toEqual(
      upcomingReminders(store.getState().data, '2026-10-14T21:30'),
    );

    // A change still waiting its turn is covered by that same run, not repeated.
    act(() => store.setState({ data: dataWith(true, { autoLockMinutes: 30 }) }));
    await settle(SETTLE_MS / 2);
    resume();
    expect(notifier.replace).toHaveBeenCalledTimes(3);
    await settle(SETTLE_MS);
    expect(notifier.replace).toHaveBeenCalledTimes(3);
    expect(replaced(notifier)[2]).toEqual(
      upcomingReminders(store.getState().data, '2026-10-14T21:30'),
    );
  });

  it('keeps working when scheduling fails', async () => {
    // Review Focus 3: no crash, no toast, and the next change tries again.
    const { notifier, store, resume } = setup();
    notifier.replace.mockRejectedValueOnce(new Error('notifications are disabled'));

    await settle();
    expect(notifier.replace).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    expect(toastStore.getState().toasts).toEqual([]);

    act(() => store.setState({ data: dataWith(true, { autoLockMinutes: 15 }) }));
    await settle();
    expect(notifier.replace).toHaveBeenCalledTimes(2);

    // Nor does a failure that is thrown rather than rejected escape into the page.
    notifier.replace.mockImplementationOnce(() => {
      throw new Error('bridge down');
    });
    resume();
    expect(notifier.replace).toHaveBeenCalledTimes(3);
    await settle(0);
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(toastStore.getState().toasts).toEqual([]);

    act(() => store.setState({ data: dataWith(true, { autoLockMinutes: 30 }) }));
    await settle();
    expect(notifier.replace).toHaveBeenCalledTimes(4);
  });

  it('does nothing without a notifier, as on the web', async () => {
    const { notifier, store, listeners } = setup({ withoutNotifier: true });

    expect(vi.getTimerCount()).toBe(0);
    expect(listeners()).toBe(0);
    act(() => store.setState({ data: dataWith(true, { autoLockMinutes: 15 }) }));
    expect(vi.getTimerCount()).toBe(0);
    await settle();
    expect(notifier.replace).not.toHaveBeenCalled();
  });

  it('stops listening and waiting when it goes away', async () => {
    const { notifier, store, unmount, listeners } = setup();
    expect(listeners()).toBe(1);
    act(() => store.setState({ data: dataWith(true, { autoLockMinutes: 15 }) }));

    unmount();

    expect(listeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await settle();
    expect(notifier.replace).not.toHaveBeenCalled();
  });
});
