import { act, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { purchaseEntry } from '@/domain/game/shop';
import { emptySnapshot } from '@/domain/snapshot';
import { toastStore } from '@/lib/toast';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeNotifier, onPhone } from '@/test/fakeNotifier';
import { makeProfile, makeSettings } from '@/test/fixtures';
import { DemoBanner } from './DemoBanner';
import { Root } from './Root';

/** Data for someone who finished onboarding. */
function onboarded() {
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile({ onboardedAt: '2026-10-01T09:00:00.000Z' }));
  return data;
}

describe('Root', () => {
  it('shows a loading state while booting', () => {
    renderWithStore(<Root />, createStubStore({ phase: 'booting' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('explains when storage is unavailable', () => {
    renderWithStore(<Root />, createStubStore({ phase: 'unavailable' }));
    expect(
      screen.getByRole('heading', { level: 1, name: "Funancial can't save data here" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your browser is blocking storage (this can happen in private windows). Open Funancial in a normal window to continue.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the welcome screen on first run', () => {
    renderWithStore(<Root />, createStubStore({ phase: 'welcome' }));
    expect(screen.getByRole('button', { name: 'Try with demo money' })).toBeInTheDocument();
  });

  it('shows the lock screen when locked', () => {
    renderWithStore(<Root />, createStubStore({ phase: 'locked', lockMode: 'pin' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
  });

  it('shows the app when unlocked', async () => {
    renderWithStore(<Root />, createStubStore({ phase: 'unlocked', data: onboarded() }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
  });

  it('puts the equipped game theme on the page while unlocked, and takes it off when locked', () => {
    const data = onboarded();
    data.tables.ledger = [purchaseEntry('theme-ocean', 'p1', '2026-10-01T10:00:00.000Z')];
    data.tables.settings = [
      makeSettings({
        cosmetics: { theme: 'theme-ocean', avatar: 'avatar-sprout', frame: 'frame-none' },
      }),
    ];
    const store = createStubStore({ phase: 'unlocked', data });
    renderWithStore(<Root />, store);
    expect(document.documentElement.dataset.gameTheme).toBe('ocean');

    act(() => store.setState({ phase: 'locked', lockMode: 'pin' }));
    expect(document.documentElement.dataset.gameTheme).toBeUndefined();
  });

  it('runs onboarding for real data that has not been set up yet', () => {
    renderWithStore(<Root />, createStubStore({ phase: 'unlocked', namespace: 'real' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Before we start' })).toBeInTheDocument();
  });

  it('leaves onboarding as soon as the profile is saved', async () => {
    const store = createStubStore({ phase: 'unlocked', namespace: 'real' });
    renderWithStore(<Root />, store);
    act(() => store.setState({ data: onboarded() }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
  });
});

describe('DemoBanner', () => {
  it('is absent with real data', () => {
    renderWithStore(<DemoBanner />, createStubStore({ namespace: 'real' }));
    expect(screen.queryByText("You're using demo money.")).not.toBeInTheDocument();
  });

  it('asks before leaving demo, and only leaves on confirm', async () => {
    const { store } = renderWithStore(<DemoBanner />, createStubStore({ namespace: 'demo' }));
    expect(screen.getByText("You're using demo money.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Start with my real data' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave demo?' });
    expect(dialog).toHaveAccessibleDescription(
      "Demo data will be deleted. Your real data isn't affected.",
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(store.getState().exitDemo).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Start with my real data' }));
    await userEvent.click(screen.getByRole('button', { name: 'Leave demo' }));
    expect(store.getState().exitDemo).toHaveBeenCalledTimes(1);
  });
});

describe('Root across lock cycles', () => {
  it('reuses one router instead of creating a new one per unlock', async () => {
    const routerModule = await import('./router');
    const spy = vi.spyOn(routerModule, 'createAppRouter');
    const store = createStubStore({ phase: 'unlocked', data: onboarded() });
    renderWithStore(<Root />, store);
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    act(() => store.setState({ phase: 'locked', lockMode: 'pin' }));
    act(() => store.setState({ phase: 'unlocked' }));
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    act(() => store.setState({ phase: 'locked' }));
    act(() => store.setState({ phase: 'unlocked' }));
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });

  it('lands on Home after onboarding, wherever the last session left off', async () => {
    const store = createStubStore({ phase: 'unlocked', data: onboarded() });
    renderWithStore(<Root />, store);
    await userEvent.click(
      (await screen.findAllByRole('link', { name: 'Settings' }))[0] as HTMLElement,
    );
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    act(() => store.setState({ data: emptySnapshot() }));
    expect(screen.getByRole('heading', { level: 1, name: 'Before we start' })).toBeInTheDocument();
    act(() => store.setState({ data: onboarded() }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
  });

  it('shows toasts on every screen', () => {
    renderWithStore(<Root />, createStubStore({ phase: 'welcome' }));
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('Root with reminders', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    toastStore.setState({ toasts: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    consoleError.mockRestore();
  });

  it('takes an opened reminder to its screen, listening once across lock cycles', async () => {
    let open: (route: string) => void = () => {};
    const stop = vi.fn();
    const notifier = fakeNotifier({
      onOpen: vi.fn((cb) => {
        open = cb;
        return stop;
      }),
    });
    const store = createStubStore({ phase: 'unlocked', data: onboarded() });
    const { unmount } = renderWithStore(onPhone(notifier, <Root />), store);
    await screen.findByRole('heading', { level: 1, name: 'Home' });

    // Tapped while the app is open, and again after it locked and unlocked.
    act(() => open('/add'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Add' })).toBeInTheDocument();
    act(() => store.setState({ phase: 'locked', lockMode: 'pin' }));
    act(() => store.setState({ phase: 'unlocked' }));
    act(() => open('/'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();

    expect(notifier.onOpen).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('keeps the phone reminders in step with the data once unlocked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const data = onboarded();
    data.tables.settings = [
      makeSettings({ reminders: { ...makeSettings().reminders, enabled: true } }),
    ];
    const notifier = fakeNotifier();
    renderWithStore(
      onPhone(notifier, <Root />),
      createStubStore({ phase: 'unlocked', namespace: 'real', data }),
    );
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(notifier.replace).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1_000));

    expect(notifier.replace).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifier.replace).mock.calls[0]?.[0].length).toBeGreaterThan(0);
  });

  it('clears the phone reminders once each time it reaches the welcome screen', async () => {
    // After "Delete all data" the app goes back to welcome; nothing may keep reminding about it.
    const notifier = fakeNotifier();
    const store = createStubStore({ phase: 'welcome' });
    renderWithStore(onPhone(notifier, <Root />), store);

    expect(notifier.replace).toHaveBeenCalledTimes(1);
    expect(notifier.replace).toHaveBeenLastCalledWith([]);
    // Other changes while it stays there do not repeat it.
    act(() => store.setState({ today: '2026-10-15' }));
    expect(notifier.replace).toHaveBeenCalledTimes(1);

    // Into the app and back out to welcome (data deleted again): once more.
    act(() => store.setState({ phase: 'unlocked', data: onboarded() }));
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(notifier.replace).toHaveBeenCalledTimes(1);
    act(() => store.setState({ phase: 'welcome', data: emptySnapshot() }));
    expect(notifier.replace).toHaveBeenCalledTimes(2);
    expect(notifier.replace).toHaveBeenLastCalledWith([]);
  });

  it('does not clear reminders while locked or booting', () => {
    const notifier = fakeNotifier();
    const store = createStubStore({ phase: 'booting' });
    renderWithStore(onPhone(notifier, <Root />), store);
    act(() => store.setState({ phase: 'locked', lockMode: 'pin' }));

    expect(notifier.replace).not.toHaveBeenCalled();
  });

  it('keeps going, quietly, when clearing the reminders fails', async () => {
    const rejecting = fakeNotifier({
      replace: vi.fn(async () => Promise.reject(new Error('down'))),
    });
    const throwing = fakeNotifier({
      replace: vi.fn(() => {
        throw new Error('bridge down');
      }),
    });

    for (const notifier of [rejecting, throwing]) {
      renderWithStore(onPhone(notifier, <Root />), createStubStore({ phase: 'welcome' }));
      await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
      consoleError.mockClear();
      expect(screen.getByRole('button', { name: 'Try with demo money' })).toBeInTheDocument();
      expect(toastStore.getState().toasts).toEqual([]);
      cleanup();
    }
  });

  it('has nothing to clear on the web, where there is no notifier', () => {
    renderWithStore(onPhone(null, <Root />), createStubStore({ phase: 'welcome' }));

    expect(screen.getByRole('button', { name: 'Try with demo money' })).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
