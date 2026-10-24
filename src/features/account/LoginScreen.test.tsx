import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { toastStore } from '@/lib/toast';
import { KeyDerivationError } from '@/data/accountCrypto';
import { AccountError } from '@/store/accountActions';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeAccount, withAccount } from '@/test/fakeAccount';
import { LoginScreen } from './LoginScreen';

const PASSWORD = 'a long enough password';
const REPLACE = "Replace this phone's data with your account's copy?";

beforeEach(() => toastStore.setState({ toasts: [] }));
afterEach(() => vi.restoreAllMocks());

function show(
  actions = fakeAccount(),
  store = createStubStore({ phase: 'welcome' }),
  handlers = { onBack: vi.fn(), onForgot: vi.fn(), onHold: vi.fn() },
) {
  renderWithStore(
    withAccount(
      actions,
      <>
        <LoginScreen {...handlers} />
        <Toaster />
      </>,
    ),
    store,
  );
  return { actions, store, ...handlers };
}

async function fillIn(password = PASSWORD, username = 'Robin') {
  await userEvent.type(screen.getByLabelText('Username'), username);
  await userEvent.type(screen.getByLabelText('Password'), password);
}
/** A field in the glass look's `row`: the label left, the value right, a hairline under it. */
function isRow(label: string) {
  const field = screen.getByLabelText(label);
  expect(field, label).toHaveClass('text-right', 'h-11');
  expect(field, label).not.toHaveClass('rounded-md', 'border-b', 'font-extrabold');
  expect(field.closest('.border-b'), label).toHaveClass('border-black/7', 'dark:border-white/8');
}
const logIn = async () => {
  await fillIn();
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
};

describe('LoginScreen', () => {
  it('is a calm Log in, with a way back and a way to reset a password', async () => {
    const { onBack, onForgot } = show();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
    for (const label of ['Username', 'Password']) isRow(label);
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(onForgot).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has a round glass Back, a page title, row fields and a solid Log in', () => {
    show();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('glass', 'rounded-full');
    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toHaveClass('text-page');
    expect(screen.getByRole('button', { name: 'Log in' })).toHaveClass('bg-primary', 'h-14');
    // Forgot password? is the quiet text button, in the accent.
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toHaveClass(
      'text-accent-text',
      'underline',
      'min-h-11',
    );
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveClass('underline');
  });

  it('keeps the button off until both are typed, and can show the password', async () => {
    show();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
    await fillIn();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('logs in from the welcome screen itself: the account layer makes the vault, not this screen', async () => {
    const { actions, store } = show();
    await logIn();
    expect(actions.logIn).toHaveBeenCalledTimes(1);
    expect(actions.logIn).toHaveBeenCalledWith(
      { username: 'Robin', password: PASSWORD },
      { replace: false },
    );
    expect(store.getState().startFresh).not.toHaveBeenCalled();
  });

  it('says plainly that the username and password do not match, and keeps the form', async () => {
    const actions = fakeAccount();
    actions.logIn.mockRejectedValue(new AccountError('wrong'));
    show(actions);
    await logIn();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That username and password don't match.",
    );
    expect(screen.getByLabelText('Username')).toHaveValue('Robin');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Lock this phone' })).not.toBeInTheDocument();
  });

  it.each([
    [
      'unreadable',
      "Your account's copy couldn't be opened on this phone. Nothing was changed. Try again later, or update Android System WebView.",
    ],
    ['unavailable', "Funcial's service isn't answering right now. Try again in a moment."],
    ['busy', 'Funcial is busy right now. Try again in a moment.'],
    ['offline', "You're offline. Try again when you're connected."],
  ] as const)('shows what the account layer says for %s', async (code, message) => {
    const actions = fakeAccount();
    actions.logIn.mockRejectedValue(new AccountError(code));
    show(actions);
    await logIn();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('shows it is working, and sends one request for two taps in the same instant', async () => {
    const actions = fakeAccount();
    actions.logIn.mockReturnValue(new Promise(() => {}));
    show(actions);
    await fillIn();
    const form = screen.getByLabelText('Username').closest('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(actions.logIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('offers no Forgot password while a log-in is on its way', async () => {
    const actions = fakeAccount();
    actions.logIn.mockReturnValue(new Promise(() => {}));
    show(actions);
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeEnabled();
    await logIn();
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeDisabled();
  });

  it('does no key work while typing: only a submit asks the account layer', async () => {
    const { actions } = show();
    await fillIn();
    expect(actions.logIn).not.toHaveBeenCalled();
  });

  it('says so when the phone is offline, and still lets the person try', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    show();
    expect(
      screen.getByText("You're offline. Connect to the internet to log in."),
    ).toBeInTheDocument();
    await fillIn();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  describe('after the account has answered', () => {
    async function loggedIn(
      actions = fakeAccount(),
      store = createStubStore({ phase: 'welcome' }),
    ) {
      const shown = show(actions, store);
      await logIn();
      await screen.findByRole('heading', { level: 1, name: 'Lock this phone' });
      return shown;
    }

    it('keeps the app on this screen from the first tap, as the phone moves to the new data', async () => {
      const actions = fakeAccount();
      let finish: (v: 'done') => void = () => {};
      actions.logIn.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      const { onHold } = show(actions);
      await logIn();
      expect(onHold).toHaveBeenLastCalledWith(true);
      await act(async () => finish('done'));
      expect(onHold).not.toHaveBeenCalledWith(false);
      expect(await screen.findByRole('heading', { name: 'Lock this phone' })).toBeInTheDocument();
    });

    it('asks for a new PIN for this phone, and lets go of the screen once it is set', async () => {
      const { store, onHold } = await loggedIn();
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Lock this phone' })).toHaveFocus();
      expect(screen.getByText('Choose a PIN to open Funcial on this phone.')).toBeInTheDocument();
      expect(screen.queryByText(/Your data is here/)).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
      await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
      await userEvent.click(screen.getByRole('button', { name: 'Set PIN' }));
      await vi.waitFor(() => expect(onHold).toHaveBeenLastCalledWith(false));
      expect(store.getState().setSecret).toHaveBeenCalledWith('2468', 'pin');
      expect(store.getState().enableBiometric).not.toHaveBeenCalled();
    });

    it('draws the PIN step in the glass look: row fields, a solid Set PIN and a quiet Skip the lock', async () => {
      await loggedIn(fakeAccount(), createStubStore({ phase: 'welcome', biometric: 'off' }));
      isRow('Choose a PIN');
      isRow('Confirm PIN');
      expect(screen.getByRole('heading', { level: 1, name: 'Lock this phone' })).toHaveClass(
        'text-page',
      );
      // The switch is a row of the same list, not a loose line.
      expect(
        screen.getByRole('switch', { name: 'Also unlock with fingerprint or face' }).parentElement,
      ).toHaveClass('min-h-[54px]');
      expect(screen.getByRole('button', { name: 'Set PIN' })).toHaveClass('bg-primary', 'h-14');
      // 0.13's R4: Skip the lock was a glass pill, and is now the quiet text button.
      const skip = screen.getByRole('button', { name: 'Skip the lock' });
      expect(skip).toHaveClass('text-accent-text', 'underline', 'min-h-11');
      expect(skip).not.toHaveClass('glass', 'rounded-full', 'h-11');
    });

    it('refuses a PIN that is too short, or that does not match', async () => {
      const { store, onHold } = await loggedIn();
      await userEvent.type(screen.getByLabelText('Choose a PIN'), '12');
      await userEvent.type(screen.getByLabelText('Confirm PIN'), '12');
      await userEvent.click(screen.getByRole('button', { name: 'Set PIN' }));
      expect(screen.getByText('Use 4 to 8 digits.')).toBeInTheDocument();

      await userEvent.clear(screen.getByLabelText('Choose a PIN'));
      await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
      await userEvent.click(screen.getByRole('button', { name: 'Set PIN' }));
      expect(screen.getByText("Those don't match.")).toBeInTheDocument();
      expect(store.getState().setSecret).not.toHaveBeenCalled();
      expect(onHold).not.toHaveBeenCalledWith(false);
    });

    it('can be left for later, with no lock set', async () => {
      const { store, onHold } = await loggedIn();
      await userEvent.click(screen.getByRole('button', { name: 'Skip the lock' }));
      expect(onHold).toHaveBeenLastCalledWith(false);
      expect(store.getState().setSecret).not.toHaveBeenCalled();
    });

    it('turns on fingerprint or face after the PIN when the phone has it', async () => {
      const store = createStubStore({ phase: 'welcome', biometric: 'off' });
      await loggedIn(fakeAccount(), store);
      expect(
        screen.getByRole('switch', { name: 'Also unlock with fingerprint or face' }),
      ).toHaveAttribute('aria-checked', 'true');
      await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
      await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
      await userEvent.click(screen.getByRole('button', { name: 'Set PIN' }));
      await vi.waitFor(() => expect(store.getState().enableBiometric).toHaveBeenCalledTimes(1));
      const [lockedAt] = vi.mocked(store.getState().setSecret).mock.invocationCallOrder;
      const [biometricAt] = vi.mocked(store.getState().enableBiometric).mock.invocationCallOrder;
      expect(lockedAt).toBeLessThan(biometricAt ?? 0);
    });

    it('does not offer fingerprint or face on a phone without it', async () => {
      await loggedIn();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('still finishes when fingerprint or face cannot be turned on, and says so', async () => {
      const store = createStubStore({
        phase: 'welcome',
        biometric: 'off',
        enableBiometric: vi.fn(async () => {
          throw new Error('Failed to save data');
        }),
      });
      const { onHold } = await loggedIn(fakeAccount(), store);
      await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
      await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
      await userEvent.click(screen.getByRole('button', { name: 'Set PIN' }));
      expect(await screen.findByRole('status')).toHaveTextContent(
        "Fingerprint or face unlock couldn't be turned on. You can try again in Settings.",
      );
      expect(onHold).toHaveBeenLastCalledWith(false);
    });
  });

  describe('on a phone that has data', () => {
    function needingConfirmation() {
      const actions = fakeAccount();
      actions.logIn.mockResolvedValueOnce('needs-confirm');
      return actions;
    }

    it('asks before replacing it, verbatim, and has changed nothing yet', async () => {
      const actions = needingConfirmation();
      show(actions);
      await logIn();
      expect(await screen.findByRole('heading', { level: 1, name: REPLACE })).toBeInTheDocument();
      expect(screen.getByText('Before you log in')).toBeInTheDocument();
      // Plainly what happens, and no advice to make a backup: there are none to make.
      expect(
        screen.getByText("What is on this phone now is replaced by your account's copy."),
      ).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(/backup/i);
      // A screen reader is told about the new screen.
      expect(screen.getByRole('heading', { level: 1, name: REPLACE })).toHaveFocus();
      expect(actions.logIn).toHaveBeenCalledTimes(1);
      expect(actions.logIn).toHaveBeenCalledWith(expect.anything(), { replace: false });
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    });

    it('keeps the data when the person says no: no second request, no account linked', async () => {
      const actions = needingConfirmation();
      const { onBack, onHold } = show(actions);
      await logIn();
      await userEvent.click(await screen.findByRole('button', { name: "Keep this phone's data" }));
      expect(actions.logIn).toHaveBeenCalledTimes(1);
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onHold).toHaveBeenLastCalledWith(false);
      expect(screen.queryByRole('heading', { name: 'Lock this phone' })).not.toBeInTheDocument();
    });

    it('replaces it only on a yes, and then asks for the PIN', async () => {
      const actions = needingConfirmation();
      show(actions);
      await logIn();
      await userEvent.click(await screen.findByRole('button', { name: 'Replace' }));
      expect(actions.logIn).toHaveBeenCalledTimes(2);
      expect(actions.logIn).toHaveBeenLastCalledWith(
        { username: 'Robin', password: PASSWORD },
        { replace: true },
      );
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Lock this phone' }),
      ).toBeInTheDocument();
    });

    it('shows why a confirmed log-in failed, back on the form', async () => {
      const actions = needingConfirmation();
      actions.logIn.mockRejectedValueOnce(new AccountError('wrong'));
      show(actions);
      await logIn();
      await userEvent.click(await screen.findByRole('button', { name: 'Replace' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "That username and password don't match.",
      );
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
    });
  });

  it("says in plain words when this phone couldn't make the keys, not the engine's message", async () => {
    const actions = fakeAccount();
    actions.logIn.mockRejectedValue(
      new KeyDerivationError(new RangeError('WebAssembly.instantiate(): Out of memory')),
    );
    show(actions);
    await logIn();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "This phone couldn't make your keys. Close other apps and try again.",
    );
    expect(alert).not.toHaveTextContent(/WebAssembly|memory/);
  });

  it('keeps a failure on the screen even after the new vault was made: the app holds this screen for a retry', async () => {
    const actions = fakeAccount();
    actions.logIn.mockRejectedValue(new Error('Storage is full.'));
    // Past the welcome phase the app shows this screen only because it is held, so the message must stay on it.
    show(actions, createStubStore({ phase: 'unlocked' }));
    await logIn();
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is full.');
  });
});
