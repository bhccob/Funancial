import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformProvider } from '@/platform/PlatformProvider';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeAppLifecycle } from '@/test/fakeAppLifecycle';
import { LockScreen } from './LockScreen';
import { useAutoLock } from './useAutoLock';

afterEach(() => vi.useRealTimers());

describe('LockScreen', () => {
  it('PIN lock: a wrong PIN shows a message and clears the field', async () => {
    const store = createStubStore({
      phase: 'locked',
      lockMode: 'pin',
      unlock: vi.fn(async () => 'wrong' as const),
    });
    renderWithStore(<LockScreen />, store);
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();

    for (const d of ['2', '4', '6', '8'])
      await userEvent.click(screen.getByRole('button', { name: d }));
    expect(screen.getByLabelText('PIN')).toHaveValue('2468');
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(store.getState().unlock).toHaveBeenCalledWith('2468');
    expect(await screen.findByText("That didn't match. Try again.")).toBeInTheDocument();
    expect(screen.getByLabelText('PIN')).toHaveValue('');
  });

  it('PIN pad accepts typed digits and Enter, and needs at least 4 digits', async () => {
    const store = createStubStore({ phase: 'locked', lockMode: 'pin' });
    renderWithStore(<LockScreen />, store);
    const field = screen.getByLabelText('PIN');
    await userEvent.type(field, '12');
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    await userEvent.type(field, '34{Enter}');
    expect(store.getState().unlock).toHaveBeenCalledWith('1234');
  });

  it('passphrase lock shows a password field instead of a PIN pad', async () => {
    const store = createStubStore({ phase: 'locked', lockMode: 'passphrase' });
    renderWithStore(<LockScreen />, store);
    expect(screen.queryByRole('button', { name: '5' })).not.toBeInTheDocument();
    const field = screen.getByLabelText('Passphrase');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.type(field, 'correct horse{Enter}');
    expect(store.getState().unlock).toHaveBeenCalledWith('correct horse');
  });

  it('shows a countdown while unlocking is throttled', () => {
    const store = createStubStore({
      phase: 'locked',
      lockMode: 'pin',
      lockedUntil: Date.now() + 30_000,
    });
    renderWithStore(<LockScreen />, store);
    expect(screen.getByText('Too many tries. Try again in 30s.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });
});

function AutoLockProbe({ minutes }: { minutes: number }) {
  useAutoLock(minutes);
  return null;
}

describe('useAutoLock', () => {
  it('locks after the idle period and restarts the clock on activity', () => {
    vi.useFakeTimers();
    const store = createStubStore();
    render(
      <AppStoreProvider store={store}>
        <AutoLockProbe minutes={5} />
      </AppStoreProvider>,
    );
    act(() => vi.advanceTimersByTime(4 * 60_000));
    window.dispatchEvent(new Event('pointerdown'));
    act(() => vi.advanceTimersByTime(4 * 60_000));
    expect(store.getState().lock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_001));
    expect(store.getState().lock).toHaveBeenCalledTimes(1);
  });

  it('never locks when set to 0', () => {
    vi.useFakeTimers();
    const store = createStubStore();
    render(
      <AppStoreProvider store={store}>
        <AutoLockProbe minutes={0} />
      </AppStoreProvider>,
    );
    act(() => vi.advanceTimersByTime(24 * 60 * 60_000));
    expect(store.getState().lock).not.toHaveBeenCalled();
  });
});

describe('LockScreen review fixes', () => {
  it('disables the keypad while a PIN is being checked', () => {
    renderWithStore(
      <LockScreen />,
      createStubStore({ phase: 'locked', lockMode: 'pin', checking: true }),
    );
    expect(screen.getByRole('button', { name: '5' })).toBeDisabled();
    expect(screen.getByText('Checking…')).toBeInTheDocument();
  });

  it('offers a way out when the PIN is forgotten', async () => {
    const store = createStubStore({ phase: 'locked', lockMode: 'pin' });
    renderWithStore(<LockScreen />, store);
    await userEvent.click(screen.getByRole('button', { name: 'Forgot your PIN?' }));
    const dialog = screen.getByRole('dialog', { name: 'Erase this device and start over?' });
    expect(dialog).toHaveAccessibleDescription(
      "Without your PIN, the data on this device can't be recovered. If you have an account, log in after starting over to get your data back.",
    );
    const erase = within(dialog).getByRole('button', { name: 'Delete everything' });
    expect(erase).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'DELETE');
    await userEvent.click(erase);
    expect(store.getState().deleteAllData).toHaveBeenCalledTimes(1);
  });

  it('names the passphrase in the forgotten-secret link', () => {
    renderWithStore(<LockScreen />, createStubStore({ phase: 'locked', lockMode: 'passphrase' }));
    expect(screen.getByRole('button', { name: 'Forgot your passphrase?' })).toBeInTheDocument();
  });
});

describe('useAutoLock activity', () => {
  it('treats scrolling with the wheel as activity', () => {
    vi.useFakeTimers();
    const store = createStubStore();
    render(
      <AppStoreProvider store={store}>
        <AutoLockProbe minutes={1} />
      </AppStoreProvider>,
    );
    act(() => vi.advanceTimersByTime(50_000));
    window.dispatchEvent(new Event('wheel'));
    act(() => vi.advanceTimersByTime(50_000));
    expect(store.getState().lock).not.toHaveBeenCalled();
  });

  it('locks on return after being hidden longer than the timeout', () => {
    vi.useFakeTimers();
    const store = createStubStore();
    render(
      <AppStoreProvider store={store}>
        <AutoLockProbe minutes={1} />
      </AppStoreProvider>,
    );
    const setVisibility = (v: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    setVisibility('hidden');
    vi.setSystemTime(Date.now() + 61_000);
    setVisibility('visible');
    expect(store.getState().lock).toHaveBeenCalledTimes(1);
    setVisibility('visible');
  });
});

describe('LockScreen with biometric unlock', () => {
  const CHANGED =
    'Your fingerprints or face changed, so use your PIN this time. You can turn biometric unlock back on in Settings.';

  it('offers fingerprint or face and explains a changed enrolment', async () => {
    const store = createStubStore({ phase: 'locked', lockMode: 'pin', biometric: 'on' });
    const unlockWithBiometric = vi
      .fn<() => Promise<'ok' | 'cancelled' | 'changed'>>()
      .mockResolvedValueOnce('cancelled')
      .mockImplementationOnce(async () => {
        store.setState({ biometric: 'off' });
        return 'changed';
      });
    store.setState({ unlockWithBiometric });
    renderWithStore(<LockScreen />, store);

    // It asks once, on its own, as the lock screen opens.
    await vi.waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Use fingerprint or face' }));

    expect(await screen.findByText(CHANGED)).toBeInTheDocument();
    expect(unlockWithBiometric).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole('button', { name: 'Use fingerprint or face' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5' })).toBeEnabled();
  });

  it('neither asks nor offers it when biometric unlock is off', async () => {
    const store = createStubStore({ phase: 'locked', lockMode: 'pin', biometric: 'off' });
    renderWithStore(<LockScreen />, store);
    await act(async () => {});
    expect(store.getState().unlockWithBiometric).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Use fingerprint or face' }),
    ).not.toBeInTheDocument();
  });
});

describe('LockScreen biometric prompt and the app being on screen', () => {
  // The idle timer can lock the app while it is behind another app. A prompt started from there
  // can land over that app, come back cancelled, or never finish.
  afterEach(() => Reflect.deleteProperty(document, 'visibilityState'));

  const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
  };

  function renderLocked() {
    const native = fakeAppLifecycle();
    const store = createStubStore({ phase: 'locked', lockMode: 'pin', biometric: 'on' });
    const view = render(
      <PlatformProvider platform={native.platform}>
        <AppStoreProvider store={store}>
          <LockScreen />
        </AppStoreProvider>
      </PlatformProvider>,
    );
    return { ...native, ...view, asked: store.getState().unlockWithBiometric };
  }

  it('asks at once when it opens on screen, and only once', async () => {
    setVisibility('visible');
    const { asked, resume } = renderLocked();
    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(1));

    resume();
    await act(async () => {});
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('opened in the background, asks when the app comes back, and only once', async () => {
    setVisibility('hidden');
    const { asked, resume } = renderLocked();
    await act(async () => {});
    expect(asked).not.toHaveBeenCalled();

    resume();
    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(1));
    setVisibility('visible');
    resume();
    await act(async () => {});
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('opened in the background, asks when the page is shown, should that come first', async () => {
    setVisibility('hidden');
    const { asked, resume } = renderLocked();
    await act(async () => {});
    expect(asked).not.toHaveBeenCalled();

    setVisibility('visible');
    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(1));
    resume();
    await act(async () => {});
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('never asks once it has closed, even for a return already on its way', async () => {
    setVisibility('hidden');
    const { asked, queue, unmount } = renderLocked();
    const resumed = queue('resume');
    unmount();
    resumed();
    await act(async () => {});

    expect(asked).not.toHaveBeenCalled();
  });
});

describe('LockScreen after a throttle', () => {
  it('does not bring back the old error once the countdown ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const store = createStubStore({ phase: 'locked', lockMode: 'pin' });
    store.setState({
      unlock: vi.fn(async () => {
        store.setState({ lockedUntil: Date.now() + 2_000 });
        return 'wrong' as const;
      }),
    });
    renderWithStore(<LockScreen />, store);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText('PIN'), '0000{Enter}');
    expect(await screen.findByText(/Too many tries/)).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(3_500);
    });
    expect(screen.queryByText("That didn't match. Try again.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Too many tries/)).not.toBeInTheDocument();
  });
});

describe('LockScreen in the glass look', () => {
  /** The theme's block the lock stands on. */
  const blockOf = () =>
    screen
      .getByRole('heading', { level: 1, name: 'Welcome back' })
      .closest<HTMLElement>('[data-head-block]');

  it('stands the PIN pad, fingerprint and Forgot on the theme block, with its glow shapes', () => {
    renderWithStore(
      <LockScreen />,
      createStubStore({ phase: 'locked', lockMode: 'pin', biometric: 'on' }),
    );
    const head = blockOf();
    expect(head).toHaveClass('bg-head', 'rounded-b-hero');
    for (const part of [
      screen.getByLabelText('PIN'),
      screen.getByRole('button', { name: '5' }),
      screen.getByRole('button', { name: 'Unlock' }),
      screen.getByRole('button', { name: 'Use fingerprint or face' }),
      screen.getByRole('button', { name: 'Forgot your PIN?' }),
    ]) {
      expect(head).toContainElement(part);
    }
    // The block runs out to the screen's edges and down the screen, as the lock fills it.
    expect(head).toHaveClass('mx-0', 'flex-1');
  });

  it('draws the keys 44px or more tall in the block glass, and the unlock key as the main button', () => {
    renderWithStore(<LockScreen />, createStubStore({ phase: 'locked', lockMode: 'pin' }));
    const keys = [...'0123456789'].map((d) => screen.getByRole('button', { name: d }));
    keys.push(screen.getByRole('button', { name: 'Delete' }));
    expect(keys).toHaveLength(11);
    for (const key of keys) {
      expect(key, key.textContent || 'Delete').toHaveClass(
        'glass-head',
        'h-14',
        'rounded-key',
        'press',
      );
      expect(key).not.toHaveClass('glass', 'bg-primary');
    }
    expect(screen.getByRole('button', { name: 'Unlock' })).toHaveClass(
      'btn-head',
      'h-14',
      'rounded-key',
    );
    expect(screen.getByRole('button', { name: 'Unlock' })).not.toHaveClass('bg-primary');
  });

  it('draws the PIN in its own field on the block, in the ink the block reads, not the page surface', () => {
    renderWithStore(<LockScreen />, createStubStore({ phase: 'locked', lockMode: 'pin' }));
    const field = screen.getByLabelText('PIN');
    expect(field).toHaveClass('h-14', 'rounded-full', 'text-text');
    expect(field).not.toHaveClass('bg-surface', 'border-border-strong', 'rounded-md');
  });

  it('puts no glass inside glass', () => {
    renderWithStore(
      <LockScreen />,
      createStubStore({ phase: 'locked', lockMode: 'pin', biometric: 'on' }),
    );
    const glass = [...document.querySelectorAll<HTMLElement>('.glass, .glass-head, .glass-strong')];
    expect(glass.length).toBeGreaterThanOrEqual(12);
    for (const piece of glass) {
      const outer = piece.parentElement?.closest('.glass, .glass-head, .glass-strong');
      expect(outer, piece.outerHTML).toBeNull();
    }
  });

  it('is a glass pill for fingerprint or face, and a quiet text button for Forgot your PIN?', () => {
    renderWithStore(
      <LockScreen />,
      createStubStore({ phase: 'locked', lockMode: 'pin', biometric: 'on' }),
    );
    expect(screen.getByRole('button', { name: 'Use fingerprint or face' })).toHaveClass(
      'glass-head',
      'h-12',
      'rounded-full',
    );
    // 0.13's R4: a text button, in the ink of the block; a glass pill under the pad would be glass on glass.
    const forgot = screen.getByRole('button', { name: 'Forgot your PIN?' });
    expect(forgot).toHaveClass('text-text', 'underline', 'min-h-11');
    expect(forgot).not.toHaveClass('glass', 'glass-head', 'rounded-full', 'h-11');
  });

  it("says a wrong PIN in the block's ink with a mark, as the danger red would not hold on a dark block", async () => {
    const store = createStubStore({
      phase: 'locked',
      lockMode: 'pin',
      unlock: vi.fn(async () => 'wrong' as const),
    });
    renderWithStore(<LockScreen />, store);
    await userEvent.type(screen.getByLabelText('PIN'), '1357{Enter}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("That didn't match. Try again.");
    expect(alert).toHaveClass('font-bold');
    expect(alert).not.toHaveClass('text-danger');
    expect(alert.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(blockOf()).toContainElement(alert);
  });

  it('keeps the throttle message and the checking line on the block, in its ink', () => {
    renderWithStore(
      <LockScreen />,
      createStubStore({
        phase: 'locked',
        lockMode: 'pin',
        checking: true,
        lockedUntil: Date.now() + 30_000,
      }),
    );
    expect(screen.getByRole('alert')).not.toHaveClass('text-danger');
    expect(screen.getByText('Checking…')).not.toHaveClass('text-muted');
    expect(blockOf()).toContainElement(screen.getByText('Checking…'));
  });

  it('gives a changed fingerprint note the page ink, as it is a pale card on the block', async () => {
    const store = createStubStore({ phase: 'locked', lockMode: 'pin', biometric: 'on' });
    store.setState({
      unlockWithBiometric: vi.fn(async () => {
        store.setState({ biometric: 'off' });
        return 'changed' as const;
      }),
    });
    renderWithStore(<LockScreen />, store);
    const note = await screen.findByRole('status');
    expect(note).toHaveTextContent('Your fingerprints or face changed');
    expect(note).toHaveClass('page-ink', 'text-text');
    expect(blockOf()).toContainElement(note);
  });

  it('opens the Erase dialog off the block, so its words keep the page ink, with a row field', async () => {
    renderWithStore(<LockScreen />, createStubStore({ phase: 'locked', lockMode: 'pin' }));
    await userEvent.click(screen.getByRole('button', { name: 'Forgot your PIN?' }));
    const dialog = screen.getByRole('dialog', { name: 'Erase this device and start over?' });
    expect(dialog.closest('[data-head-block]')).toBeNull();
    const field = within(dialog).getByLabelText('Type DELETE to confirm');
    expect(field).toHaveClass('text-right', 'h-11');
    expect(field).not.toHaveClass('border-b', 'font-extrabold', 'rounded-md');
    expect(field.closest('.border-b')).toHaveClass('border-black/7', 'dark:border-white/8');
  });

  it('draws the passphrase form on the block too: its own field and the main button', () => {
    renderWithStore(<LockScreen />, createStubStore({ phase: 'locked', lockMode: 'passphrase' }));
    const field = screen.getByLabelText('Passphrase');
    expect(blockOf()).toContainElement(field);
    expect(field).toHaveClass('h-14', 'rounded-full', 'text-text');
    expect(field).not.toHaveClass('bg-surface', 'border-border-strong');
    expect(screen.getByRole('button', { name: 'Unlock' })).toHaveClass('btn-head', 'h-14');
    expect(screen.getByRole('button', { name: 'Forgot your passphrase?' })).toHaveClass(
      'underline',
    );
  });
});
