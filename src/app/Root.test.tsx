import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySnapshot } from '@/domain/snapshot';
import { PlatformProvider } from '@/platform/PlatformProvider';
import type { Notifier } from '@/platform/types';
import { createWebPlatform } from '@/platform/web';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
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

function fakeNotifier(over: Partial<Notifier> = {}): Notifier {
  return {
    permission: vi.fn(async () => 'granted' as const),
    request: vi.fn(async () => true),
    replace: vi.fn(async () => {}),
    sendTest: vi.fn(async () => {}),
    onOpen: vi.fn(() => () => {}),
    ...over,
  };
}

/** The app as it runs on the phone, with a fake notifier in place of the Android plugin. */
function onPhone(notifier: Notifier, ui: ReactNode) {
  return (
    <PlatformProvider platform={{ ...createWebPlatform(), kind: 'android', notifier }}>
      {ui}
    </PlatformProvider>
  );
}

describe('Root with reminders', () => {
  afterEach(() => vi.useRealTimers());

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
});
