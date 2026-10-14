import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
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
      "Without your PIN, the data on this device can't be recovered. If you have a backup, you can restore it after starting over.",
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
