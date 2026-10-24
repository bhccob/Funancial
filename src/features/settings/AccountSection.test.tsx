import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { toastStore } from '@/lib/toast';
import { AccountError } from '@/store/accountActions';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeAccount, linkedAccount, withAccount } from '@/test/fakeAccount';
import { AccountSection } from './AccountSection';

beforeEach(() => toastStore.setState({ toasts: [] }));
afterEach(() => vi.restoreAllMocks());

function show(actions = fakeAccount()) {
  renderWithStore(
    withAccount(
      actions,
      <>
        <AccountSection />
        <Toaster />
      </>,
    ),
    createStubStore(),
  );
  return actions;
}

const button = (name: string) => screen.getByRole('button', { name });
const PASSWORD = 'a long enough password';

async function fillLogIn(password = PASSWORD, username = 'robin') {
  await userEvent.click(button('Log in'));
  const dialog = screen.getByRole('dialog', { name: 'Log in' });
  await userEvent.type(within(dialog).getByLabelText('Username'), username);
  await userEvent.type(within(dialog).getByLabelText('Password'), password);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Log in' }));
  return dialog;
}

describe('Settings → Account without an account', () => {
  it('offers Create account and Log in', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(button('Create account')).toBeInTheDocument();
    expect(button('Log in')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'A locked copy of your data is kept so you can move to a new phone. The app\'s owner runs the service and could unlock it, which is how "forgot password" brings your data back.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/offline/)).not.toBeInTheDocument();
  });

  it('shows nothing until the account has been read', () => {
    show(fakeAccount(null, false));
    expect(screen.queryByRole('heading', { name: 'Account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument();
  });

  it('says so when the phone is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    show();
    expect(screen.getByText(/You're offline\./)).toBeInTheDocument();
  });

  it('logs in without asking when nothing needs replacing', async () => {
    const actions = show();
    await fillLogIn();
    expect(actions.logIn).toHaveBeenCalledWith(
      { username: 'robin', password: PASSWORD },
      { replace: false },
    );
    expect(screen.queryByRole('dialog', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('asks before replacing the data on this phone, and only then logs in', async () => {
    const actions = fakeAccount();
    actions.logIn.mockResolvedValueOnce('needs-confirm');
    show(actions);
    const dialog = await fillLogIn();

    expect(
      within(dialog).getByText("Replace this phone's data with your account's copy?"),
    ).toBeInTheDocument();
    // Plainly what happens, and no advice to make a backup: there are none to make.
    expect(
      within(dialog).getByText("What is on this phone now is replaced by your account's copy."),
    ).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/backup/i);
    expect(actions.logIn).toHaveBeenCalledTimes(1);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace' }));
    expect(actions.logIn).toHaveBeenLastCalledWith(
      { username: 'robin', password: PASSWORD },
      { replace: true },
    );
    expect(screen.queryByRole('dialog', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('a declined replace logs nothing in', async () => {
    const actions = fakeAccount();
    actions.logIn.mockResolvedValueOnce('needs-confirm');
    show(actions);
    const dialog = await fillLogIn();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(actions.logIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('shows a wrong password as an error and stays on the form', async () => {
    const actions = fakeAccount();
    actions.logIn.mockRejectedValue(new AccountError('wrong'));
    show(actions);
    const dialog = await fillLogIn('not the password');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "That username and password don't match.",
    );
  });
});

describe('Settings → Create account, in two steps', () => {
  const CODE_LEAD =
    'We sent a 6-digit code to robin@example.com. Your account is made once you type it.';
  const CODE_HINT = 'The code works for 10 minutes. Wrong email? Go back and fix it.';
  const WRONG_CODE = "That code isn't right. Check the email and try again.";

  const accountStep = () => screen.getByRole('dialog', { name: 'Create your account' });
  const codeStep = () => screen.findByRole('dialog', { name: 'Check your email' });

  /** Opens the sheet and types the account step (what is not given is Robin's). */
  async function fillAccount(typed: { username?: string; email?: string; password?: string } = {}) {
    await userEvent.click(button('Create account'));
    const dialog = accountStep();
    await userEvent.type(within(dialog).getByLabelText('Username'), typed.username ?? 'robin');
    await userEvent.type(
      within(dialog).getByLabelText('Email'),
      typed.email ?? 'robin@example.com',
    );
    await userEvent.type(within(dialog).getByLabelText('Password'), typed.password ?? PASSWORD);
    return dialog;
  }
  const press = (dialog: HTMLElement, name: string) =>
    userEvent.click(within(dialog).getByRole('button', { name }));

  /** The sheet on its second step: the account typed, a code asked for. */
  async function toCode(actions = fakeAccount()) {
    show(actions);
    await press(await fillAccount(), 'Continue');
    return { actions, dialog: await codeStep() };
  }
  async function enterCode(dialog: HTMLElement, digits = '481529') {
    await userEvent.type(within(dialog).getByLabelText('Code'), digits);
    await press(dialog, 'Verify');
  }

  it('creates an account with a code from Settings', async () => {
    const actions = show();
    await userEvent.click(button('Create account'));
    const dialog = accountStep();
    expect(
      within(dialog).getByText('So you can move to a new phone and keep everything.'),
    ).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Username'), 'ro');
    await userEvent.type(within(dialog).getByLabelText('Email'), 'nobody');
    await userEvent.type(within(dialog).getByLabelText('Password'), 'short');
    await press(dialog, 'Continue');
    expect(within(dialog).getByText(/Use 3 to 30 letters/)).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(within(dialog).getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(actions.requestCode).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText('Username'), 'bin');
    await userEvent.clear(within(dialog).getByLabelText('Email'));
    await userEvent.type(within(dialog).getByLabelText('Email'), 'robin@example.com');
    await userEvent.type(within(dialog).getByLabelText('Password'), ' and then some');
    await press(dialog, 'Continue');
    expect(actions.requestCode).toHaveBeenCalledTimes(1);
    expect(actions.requestCode).toHaveBeenCalledWith({
      username: 'robin',
      email: 'robin@example.com',
    });
    // Nothing is made before the code: the keys come with it.
    expect(actions.signUp).not.toHaveBeenCalled();

    const step = await codeStep();
    expect(within(step).getByText('Security')).toBeInTheDocument();
    expect(within(step).getByText(CODE_LEAD)).toBeInTheDocument();
    expect(within(step).getByText(CODE_HINT)).toBeInTheDocument();
    expect(within(step).getByRole('button', { name: 'Send a new code' })).toBeInTheDocument();
    const field = within(step).getByLabelText('Code');
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
    // The button that was tapped is gone: the code is where the keyboard goes, and a screen reader
    // that is moved there is told where the code went.
    expect(field).toHaveFocus();
    expect(field).toHaveAccessibleDescription(CODE_LEAD);

    await userEvent.type(field, '481529');
    await press(step, 'Verify');
    expect(actions.signUp).toHaveBeenCalledTimes(1);
    expect(actions.signUp).toHaveBeenCalledWith({
      username: 'robin',
      email: 'robin@example.com',
      password: 'short and then some',
      code: '481529',
    });
    expect(screen.queryByRole('dialog', { name: 'Check your email' })).not.toBeInTheDocument();
    expect(await screen.findByText('Your account is ready.')).toBeInTheDocument();
  });

  it('back keeps what was typed, and asks again only for a changed address', async () => {
    const { actions, dialog } = await toCode();
    await userEvent.type(within(dialog).getByLabelText('Code'), '48');
    await press(dialog, 'Back');
    expect(accountStep()).toBe(dialog);
    expect(within(dialog).getByLabelText('Username')).toHaveValue('robin');
    expect(within(dialog).getByLabelText('Email')).toHaveValue('robin@example.com');
    expect(within(dialog).getByLabelText('Password')).toHaveValue(PASSWORD);

    // Nothing changed: on to the code that was sent, with what was typed of it.
    await press(dialog, 'Continue');
    expect(await codeStep()).toBe(dialog);
    expect(actions.requestCode).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByLabelText('Code')).toHaveValue('48');

    // A fixed address gets a code of its own, and the sheet says where it went.
    await press(dialog, 'Back');
    const email = within(dialog).getByLabelText('Email');
    await userEvent.clear(email);
    await userEvent.type(email, 'robin@mail.example');
    await press(dialog, 'Continue');
    await codeStep();
    expect(actions.requestCode).toHaveBeenCalledTimes(2);
    expect(actions.requestCode).toHaveBeenLastCalledWith({
      username: 'robin',
      email: 'robin@mail.example',
    });
    expect(
      within(dialog).getByText(
        'We sent a 6-digit code to robin@mail.example. Your account is made once you type it.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Code')).toHaveValue('');
  });

  it('a wrong code stays on the code step, and the right one then makes the account', async () => {
    const actions = fakeAccount();
    actions.signUp.mockRejectedValueOnce(new AccountError('code'));
    const { dialog } = await toCode(actions);
    await enterCode(dialog, '111111');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(WRONG_CODE);
    expect(within(dialog).getByLabelText('Code')).toHaveAttribute('aria-invalid', 'true');
    // The lead is still read with the field, and the error after it.
    expect(within(dialog).getByLabelText('Code')).toHaveAccessibleDescription(
      `${CODE_LEAD} ${WRONG_CODE}`,
    );
    expect(screen.getByRole('dialog', { name: 'Check your email' })).toBe(dialog);
    expect(screen.queryByText('Your account is ready.')).not.toBeInTheDocument();

    // Typing again takes the message away.
    await userEvent.clear(within(dialog).getByLabelText('Code'));
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    await enterCode(dialog, '481529');
    expect(actions.signUp).toHaveBeenCalledTimes(2);
    expect(actions.signUp).toHaveBeenLastCalledWith(expect.objectContaining({ code: '481529' }));
    expect(await screen.findByText('Your account is ready.')).toBeInTheDocument();
  });

  it('asks for all six digits of a code that is short, and sends nothing', async () => {
    const { actions, dialog } = await toCode();
    await enterCode(dialog, '4815');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Type all 6 digits.');
    expect(actions.signUp).not.toHaveBeenCalled();
  });

  it('the email row has its hint', async () => {
    show();
    await userEvent.click(button('Create account'));
    const dialog = accountStep();
    const email = within(dialog).getByLabelText('Email');
    // A row: the label on the left, the value on the right, and the hint under it.
    expect(email).toHaveClass('text-right', 'h-11');
    expect(email).toHaveAccessibleDescription('For "forgot password".');
    expect(email.closest('.border-b')).toHaveClass('border-black/7', 'dark:border-white/8');
    expect(within(dialog).queryByLabelText(/forgot password/)).not.toBeInTheDocument();
  });

  it('shows how strong the password is as it is typed, and refuses a common one or the username before any request', async () => {
    const actions = show();
    await userEvent.click(button('Create account'));
    const dialog = accountStep();
    const password = within(dialog).getByLabelText('Password');
    await userEvent.type(within(dialog).getByLabelText('Username'), 'robin.smith1');
    await userEvent.type(within(dialog).getByLabelText('Email'), 'robin@example.com');

    await userEvent.type(password, 'password123');
    expect(within(dialog).getByText('Weak')).toBeInTheDocument();
    await press(dialog, 'Continue');
    expect(
      within(dialog).getByText('That password is too common. Pick another one.'),
    ).toBeInTheDocument();

    await userEvent.clear(password);
    await userEvent.type(password, 'Robin.Smith1');
    // The bar agrees with what sending will say, whatever the password looks like.
    expect(within(dialog).getByText('Weak')).toBeInTheDocument();
    await press(dialog, 'Continue');
    expect(
      within(dialog).getByText("Don't use your username or email as your password."),
    ).toBeInTheDocument();

    await userEvent.clear(password);
    await userEvent.type(password, 'abcdefghijk');
    expect(within(dialog).getByText('Okay')).toBeInTheDocument();
    await userEvent.clear(password);
    await userEvent.type(password, 'Tr0ub4dor&3xyz');
    expect(within(dialog).getByText('Strong')).toBeInTheDocument();
    expect(actions.requestCode).not.toHaveBeenCalled();
    expect(actions.signUp).not.toHaveBeenCalled();
  });

  it('says a taken name under the username, and stays on the account step with the form kept', async () => {
    const actions = fakeAccount();
    actions.requestCode.mockRejectedValue(new AccountError('taken'));
    show(actions);
    const dialog = await fillAccount();
    await press(dialog, 'Continue');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'That username is taken. Try another one.',
    );
    expect(accountStep()).toBe(dialog);
    expect(within(dialog).getByLabelText('Username')).toHaveValue('robin');
    expect(within(dialog).getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Password')).toHaveValue(PASSWORD);
    expect(actions.signUp).not.toHaveBeenCalled();
  });

  it('takes the person back to the account step when the name was taken since the code was sent', async () => {
    const actions = fakeAccount();
    actions.signUp.mockRejectedValueOnce(new AccountError('taken'));
    const { dialog } = await toCode(actions);
    await enterCode(dialog);
    expect(await within(dialog).findByLabelText('Username')).toHaveValue('robin');
    expect(accountStep()).toBe(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'That username is taken. Try another one.',
    );
    expect(within(dialog).getByLabelText('Password')).toHaveValue(PASSWORD);
  });

  it('says a service that is not answering on the step it met it, and keeps the form', async () => {
    const actions = fakeAccount();
    actions.requestCode.mockRejectedValueOnce(new AccountError('unavailable'));
    actions.signUp.mockRejectedValueOnce(new AccountError('offline'));
    show(actions);
    const dialog = await fillAccount();
    await press(dialog, 'Continue');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Funcial's service isn't answering right now. Try again in a moment.",
    );
    expect(accountStep()).toBe(dialog);
    expect(within(dialog).getByLabelText('Username')).toHaveValue('robin');

    // And once it answers, the code step says its own: the code typed stays for another try.
    await press(dialog, 'Continue');
    await codeStep();
    await enterCode(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "You're offline. Try again when you're connected.",
    );
    expect(screen.getByRole('dialog', { name: 'Check your email' })).toBe(dialog);
    expect(within(dialog).getByLabelText('Code')).toHaveValue('481529');
  });

  it('says too many tries once, with the wait, on the code step', async () => {
    const actions = fakeAccount();
    actions.signUp.mockRejectedValueOnce(
      new AccountError('limited', 'Too many tries. Try again in 30 minutes.', 1800),
    );
    const { dialog } = await toCode(actions);
    await enterCode(dialog);
    await within(dialog).findByRole('alert');
    expect(within(dialog).getAllByText('Too many tries. Try again in 30 minutes.')).toHaveLength(1);
    // The code may be spent: a new one may be asked for at once.
    expect(within(dialog).getByRole('button', { name: 'Send a new code' })).toBeEnabled();
  });

  it('holds Send a new code right after a send, and lets it go for a code that has run out', async () => {
    const actions = fakeAccount();
    actions.signUp.mockRejectedValueOnce(new AccountError('expired'));
    const { dialog } = await toCode(actions);
    const resend = within(dialog).getByRole('button', { name: 'Send a new code' });
    expect(resend).toBeDisabled();

    await enterCode(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'That code has expired. Send a new one.',
    );
    expect(resend).toBeEnabled();
    await userEvent.click(resend);
    expect(actions.requestCode).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('We sent a new code.')).toBeInTheDocument();
    expect(resend).toBeDisabled();
  });

  it('takes the person back to the account step when Send a new code finds the name taken', async () => {
    const actions = fakeAccount();
    actions.requestCode.mockResolvedValueOnce().mockRejectedValueOnce(new AccountError('taken'));
    // An expired code lets the hold on Send a new code go at once.
    actions.signUp.mockRejectedValueOnce(new AccountError('expired'));
    const { dialog } = await toCode(actions);
    await enterCode(dialog);
    await within(dialog).findByRole('alert');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send a new code' }));

    expect(actions.requestCode).toHaveBeenCalledTimes(2);
    expect(await within(dialog).findByLabelText('Username')).toHaveValue('robin');
    expect(accountStep()).toBe(dialog);
    expect(within(dialog).getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'That username is taken. Try another one.',
    );
    // Everything else is as it was typed, and no new code is claimed.
    expect(within(dialog).getByLabelText('Email')).toHaveValue('robin@example.com');
    expect(within(dialog).getByLabelText('Password')).toHaveValue(PASSWORD);
    expect(screen.queryByText('We sent a new code.')).not.toBeInTheDocument();
  });

  it('forgets the name and address once the account is made, and the next sheet starts empty', async () => {
    const { dialog } = await toCode();
    await enterCode(dialog);
    expect(await screen.findByText('Your account is ready.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Check your email' })).not.toBeInTheDocument();

    // (The fake account layer stays unlinked, so the button is still there to open it again.)
    await userEvent.click(button('Create account'));
    const again = accountStep();
    expect(within(again).getByLabelText('Username')).toHaveValue('');
    expect(within(again).getByLabelText('Email')).toHaveValue('');
    expect(within(again).getByLabelText('Password')).toHaveValue('');
  });

  it('sends one request for two taps in the same instant, and does not close meanwhile', async () => {
    const actions = fakeAccount();
    actions.requestCode.mockReturnValue(new Promise(() => {}));
    show(actions);
    const dialog = await fillAccount();
    const form = dialog.querySelector('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(actions.requestCode).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    // Escape and the back gesture (a `cancel` event) wait too: a close that left the request running
    // would have its answer land in a sheet nobody sees.
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(accountStep()).toBe(dialog);
  });

  it('makes one account for two taps on Verify in the same instant', async () => {
    const actions = fakeAccount();
    actions.signUp.mockReturnValue(new Promise(() => {}));
    const { dialog } = await toCode(actions);
    await userEvent.type(within(dialog).getByLabelText('Code'), '481529');
    const form = dialog.querySelector('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(actions.signUp).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('button', { name: 'Verifying…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Send a new code' })).toBeDisabled();
    // And nothing leaves the sheet while the account is being made, by key or by back gesture.
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog', { name: 'Check your email' })).toBe(dialog);
  });

  it('closes with Cancel, keeping the name and address but not the password', async () => {
    const actions = show();
    const dialog = await fillAccount();
    await press(dialog, 'Cancel');
    expect(screen.queryByRole('dialog', { name: 'Create your account' })).not.toBeInTheDocument();
    expect(actions.requestCode).not.toHaveBeenCalled();

    await userEvent.click(button('Create account'));
    expect(within(accountStep()).getByLabelText('Username')).toHaveValue('robin');
    expect(within(accountStep()).getByLabelText('Email')).toHaveValue('robin@example.com');
    expect(within(accountStep()).getByLabelText('Password')).toHaveValue('');
  });

  it('closes on Escape and on the back gesture when nothing is under way', async () => {
    show();
    for (const close of [
      (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: 'Escape' }),
      (dialog: HTMLElement) => fireEvent(dialog, new Event('cancel', { cancelable: true })),
    ]) {
      await userEvent.click(button('Create account'));
      close(accountStep());
      expect(screen.queryByRole('dialog', { name: 'Create your account' })).not.toBeInTheDocument();
    }
  });

  it('focuses the code each time the code step comes, heard with where the code went', async () => {
    const { dialog } = await toCode();
    expect(within(dialog).getByLabelText('Code')).toHaveFocus();
    await press(dialog, 'Back');
    await press(dialog, 'Continue');
    await codeStep();
    expect(within(dialog).getByLabelText('Code')).toHaveFocus();
    expect(within(dialog).getByLabelText('Code')).toHaveAccessibleDescription(CODE_LEAD);
  });

  it('says where else to look for the email, and counts down until a new code may be sent', async () => {
    const { dialog } = await toCode();
    expect(within(dialog).getByText('Not there? Check your spam folder.')).toBeInTheDocument();
    const resend = within(dialog).getByRole('button', { name: 'Send a new code' });
    expect(resend).toHaveTextContent(/^Send a new code \(0:(30|29)\)$/);
  });

  it('comes back after a lock took Settings down: the sheet opens with the name and address, and goes back to the code sent', async () => {
    const actions = fakeAccount();
    const first = renderWithStore(withAccount(actions, <AccountSection />), createStubStore());
    await press(await fillAccount(), 'Continue');
    await codeStep();
    // The phone locks while the person reads their email: every screen is taken down.
    first.unmount();

    show(actions);
    await userEvent.click(button('Create account'));
    const again = accountStep();
    expect(within(again).getByLabelText('Username')).toHaveValue('robin');
    expect(within(again).getByLabelText('Email')).toHaveValue('robin@example.com');
    // Never the password: it is typed again.
    expect(within(again).getByLabelText('Password')).toHaveValue('');
    await userEvent.type(within(again).getByLabelText('Password'), PASSWORD);
    await press(again, 'Continue');
    await codeStep();
    expect(actions.requestCode).toHaveBeenCalledTimes(1);
    expect(within(again).getByRole('button', { name: 'Send a new code' })).toBeDisabled();

    await enterCode(again);
    expect(actions.signUp).toHaveBeenCalledWith({
      username: 'robin',
      email: 'robin@example.com',
      password: PASSWORD,
      code: '481529',
    });
    expect(await screen.findByText('Your account is ready.')).toBeInTheDocument();
  });

  it('comes back after the app reloaded, from what the phone kept', async () => {
    const first = renderWithStore(
      withAccount(fakeAccount(), <AccountSection />),
      createStubStore(),
    );
    await press(await fillAccount(), 'Continue');
    await codeStep();
    first.unmount();

    // A reload: the app's modules start again, with nothing in memory.
    vi.resetModules();
    const { AccountSection: Fresh } = await import('./AccountSection');
    const fresh = await import('@/test/fakeAccount');
    const stub = await import('@/test/appStoreStub');
    const actions = fresh.fakeAccount();
    stub.renderWithStore(fresh.withAccount(actions, <Fresh />), stub.createStubStore());
    await userEvent.click(button('Create account'));
    const again = accountStep();
    expect(within(again).getByLabelText('Username')).toHaveValue('robin');
    expect(within(again).getByLabelText('Email')).toHaveValue('robin@example.com');
    await userEvent.type(within(again).getByLabelText('Password'), PASSWORD);
    await press(again, 'Continue');
    await codeStep();
    expect(actions.requestCode).not.toHaveBeenCalled();
    (await import('@/lib/pendingCode')).keepPendingCode(null);
  });

  it('takes the 30 s gap on an address it sent nothing to as a code that just went there', async () => {
    const actions = fakeAccount();
    actions.requestCode.mockRejectedValueOnce(
      new AccountError('limited', 'Too many tries. Try again in a minute.', 25, {
        justSent: true,
      }),
    );
    const { dialog } = await toCode(actions);
    expect(within(dialog).queryByText(/Too many tries/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(CODE_LEAD)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send a new code' })).toBeDisabled();
  });

  it('lets go of the keys kept for a Verify again when the name or password changes, and on closing', async () => {
    const actions = show();
    const dialog = await fillAccount();
    actions.forgetKeys.mockClear();
    await userEvent.type(within(dialog).getByLabelText('Password'), '!');
    expect(actions.forgetKeys).toHaveBeenCalledTimes(1);
    await userEvent.type(within(dialog).getByLabelText('Username'), 's');
    expect(actions.forgetKeys).toHaveBeenCalledTimes(2);
    await press(dialog, 'Cancel');
    expect(actions.forgetKeys).toHaveBeenCalledTimes(3);
  });

  it('opens on the account step again after it was closed on the code step, and goes back to the code sent', async () => {
    const { actions, dialog } = await toCode();
    await userEvent.type(within(dialog).getByLabelText('Code'), '48');
    // The back gesture, as the phone sends it.
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog', { name: 'Check your email' })).not.toBeInTheDocument();

    await userEvent.click(button('Create account'));
    const again = accountStep();
    expect(within(again).getByLabelText('Password')).toHaveValue('');
    await userEvent.type(within(again).getByLabelText('Password'), PASSWORD);
    await press(again, 'Continue');
    await codeStep();
    // The code sent a moment ago still works: no second mail, and what was typed of it is gone.
    expect(actions.requestCode).toHaveBeenCalledTimes(1);
    expect(within(again).getByLabelText('Code')).toHaveValue('');
  });
});

describe('Forgot password from the log-in dialog', () => {
  const SENT = "If that account exists, we've emailed a link. It works for 30 minutes.";

  async function openForgot(actions = fakeAccount()) {
    show(actions);
    await userEvent.click(button('Log in'));
    const login = screen.getByRole('dialog', { name: 'Log in' });
    await userEvent.click(within(login).getByRole('button', { name: 'Forgot password?' }));
    return actions;
  }

  it('opens the same Forgot password form, in place of the log-in dialog', async () => {
    await openForgot();
    expect(screen.queryByRole('dialog', { name: 'Log in' })).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Forgot password?' });
    expect(within(dialog).getByLabelText('Username or email')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Email me a link' })).toBeInTheDocument();
  });

  it('says the same line for a username as for an email, and closes with Close', async () => {
    const actions = await openForgot();
    const dialog = screen.getByRole('dialog', { name: 'Forgot password?' });
    await userEvent.type(within(dialog).getByLabelText('Username or email'), 'robin');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Email me a link' }));
    expect(actions.forgot).toHaveBeenCalledWith('robin');
    expect(await within(dialog).findByRole('status')).toHaveTextContent(SENT);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Forgot password?' })).not.toBeInTheDocument();
  });

  it('is not offered while a log-in is on its way', async () => {
    const actions = fakeAccount();
    actions.logIn.mockReturnValue(new Promise(() => {}));
    show(actions);
    const dialog = await fillLogIn();
    expect(within(dialog).getByRole('button', { name: 'Forgot password?' })).toBeDisabled();
  });

  it('does not keep a typed password across the trip to Forgot password', async () => {
    show();
    await userEvent.click(button('Log in'));
    const login = screen.getByRole('dialog', { name: 'Log in' });
    await userEvent.type(within(login).getByLabelText('Username'), 'robin');
    await userEvent.type(within(login).getByLabelText('Password'), PASSWORD);
    await userEvent.click(within(login).getByRole('button', { name: 'Forgot password?' }));
    const forgot = screen.getByRole('dialog', { name: 'Forgot password?' });
    await userEvent.click(within(forgot).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(button('Log in'));
    const again = screen.getByRole('dialog', { name: 'Log in' });
    expect(within(again).getByLabelText('Password')).toHaveValue('');
    expect(within(again).getByLabelText('Username')).toHaveValue('robin');
  });

  it('can be cancelled before anything is sent', async () => {
    const actions = await openForgot();
    const dialog = screen.getByRole('dialog', { name: 'Forgot password?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Forgot password?' })).not.toBeInTheDocument();
    expect(actions.forgot).not.toHaveBeenCalled();
  });

  it("is not offered in the question about replacing this phone's data", async () => {
    const actions = fakeAccount();
    actions.logIn.mockResolvedValueOnce('needs-confirm');
    show(actions);
    const dialog = await fillLogIn();
    expect(
      within(dialog).queryByRole('button', { name: 'Forgot password?' }),
    ).not.toBeInTheDocument();
  });
});

describe('Settings → Account with an account', () => {
  it('shows who it is, when the copy was saved, and what can be done', () => {
    show(fakeAccount(linkedAccount()));
    expect(screen.getByText('robin')).toBeInTheDocument();
    expect(screen.getByText('robin@example.com')).toBeInTheDocument();
    const saved = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date('2026-10-14T10:00:00.000Z'));
    expect(screen.getByText(`Last copy saved ${saved}`)).toBeInTheDocument();
    expect(button('Change password')).toBeInTheDocument();
    expect(button('Turn off and delete my copy')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument();
  });

  it('says so before the first copy is saved, and leaves out an email it does not know', () => {
    show(fakeAccount(linkedAccount({ savedAt: null, email: null })));
    expect(screen.getByText('No copy saved yet.')).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it('says when the copy is too big to save, and only then', () => {
    const { unmount } = renderWithStore(
      withAccount(fakeAccount(linkedAccount()), <AccountSection />),
      createStubStore(),
    );
    expect(screen.queryByText(/too big/)).not.toBeInTheDocument();
    unmount();
    show(fakeAccount(linkedAccount({ tooBig: true })));
    expect(
      screen.getByText("Your copy is too big to save. Ask the app's owner for help."),
    ).toBeInTheDocument();
  });

  it('offers Log out between Change password and turning the copy off', () => {
    show(fakeAccount(linkedAccount()));
    const asked = ['Change password', 'Log out', 'Turn off and delete my copy'];
    const shown = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((name) => asked.includes(name));
    expect(shown).toEqual(asked);
  });

  it('leaves everything as it was when Log out is cancelled', async () => {
    const actions = show(fakeAccount(linkedAccount()));
    await userEvent.click(button('Log out'));
    const dialog = screen.getByRole('dialog', { name: 'Log out on this phone?' });
    expect(
      within(dialog).getByText(
        "Your data stays on this phone, and your account and its copy stay on Funcial's service. This phone stops saving to your account until you log in again. If you log in again later, your account's copy replaces what is on this phone.",
      ),
    ).toBeInTheDocument();
    expect(actions.unlink).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Log out on this phone?' })).toBeNull();
    expect(actions.unlink).not.toHaveBeenCalled();
    expect(toastStore.getState().toasts).toEqual([]);
    expect(screen.getByText('robin')).toBeInTheDocument();
  });

  it('logs out once confirmed, says the data is still here, and asks the service for nothing', async () => {
    const actions = fakeAccount(linkedAccount());
    actions.unlink.mockImplementation(async () => actions.view.setState({ state: null }));
    show(actions);
    await userEvent.click(button('Log out'));
    const dialog = screen.getByRole('dialog', { name: 'Log out on this phone?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log out' }));

    expect(actions.unlink).toHaveBeenCalledTimes(1);
    expect(actions.deleteAccount).not.toHaveBeenCalled();
    expect(actions.logIn).not.toHaveBeenCalled();
    expect(toastStore.getState().toasts).toEqual([
      expect.objectContaining({
        tone: 'success',
        message: 'Logged out. Your data is still on this phone.',
      }),
    ]);
    expect(screen.queryByRole('dialog', { name: 'Log out on this phone?' })).toBeNull();
  });

  it('sends one log-out for two taps in the same instant', async () => {
    const actions = fakeAccount(linkedAccount());
    actions.unlink.mockReturnValue(new Promise(() => {}));
    show(actions);
    await userEvent.click(button('Log out'));
    const dialog = screen.getByRole('dialog', { name: 'Log out on this phone?' });
    const confirm = within(dialog).getByRole('button', { name: 'Log out' });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(actions.unlink).toHaveBeenCalledTimes(1);
  });

  it('then offers Create account and Log in, as a phone without an account does', async () => {
    const actions = fakeAccount(linkedAccount());
    actions.unlink.mockImplementation(async () => actions.view.setState({ state: null }));
    show(actions);
    await userEvent.click(button('Log out'));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Log out on this phone?' })).getByRole('button', {
        name: 'Log out',
      }),
    );
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull();
    expect(button('Create account')).toBeInTheDocument();

    await userEvent.click(button('Log in'));
    expect(screen.getByRole('dialog', { name: 'Log in' })).toBeInTheDocument();
  });

  it('confirms before turning off and deleting the copy', async () => {
    const actions = show(fakeAccount(linkedAccount()));
    await userEvent.click(button('Turn off and delete my copy'));
    const dialog = screen.getByRole('dialog', { name: 'Turn off and delete my copy?' });
    expect(actions.deleteAccount).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(actions.deleteAccount).not.toHaveBeenCalled();

    await userEvent.click(button('Turn off and delete my copy'));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Turn off and delete my copy?' })).getByRole(
        'button',
        { name: 'Delete my copy' },
      ),
    );
    expect(actions.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('says the account and its copy are deleted only when they were', async () => {
    const actions = fakeAccount(linkedAccount());
    actions.deleteAccount.mockResolvedValue('deleted');
    show(actions);
    await userEvent.click(button('Turn off and delete my copy'));
    const dialog = screen.getByRole('dialog', { name: 'Turn off and delete my copy?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my copy' }));
    expect(toastStore.getState().toasts).toEqual([
      expect.objectContaining({
        tone: 'success',
        message: 'Your account and its copy are deleted.',
      }),
    ]);
    expect(screen.queryByRole('dialog', { name: 'Turn off and delete my copy?' })).toBeNull();
  });

  it('says plainly that nothing was deleted when this phone was no longer signed in', async () => {
    const actions = fakeAccount(linkedAccount());
    actions.deleteAccount.mockResolvedValue('moved');
    show(actions);
    await userEvent.click(button('Turn off and delete my copy'));
    const dialog = screen.getByRole('dialog', { name: 'Turn off and delete my copy?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my copy' }));
    const toasts = toastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.tone).toBe('info');
    expect(toasts[0]!.message).toBe(
      'This phone was no longer signed in, so nothing was deleted. If you use your account on another phone, delete it from there.',
    );
    expect(screen.queryByRole('dialog', { name: 'Turn off and delete my copy?' })).toBeNull();
  });

  it('keeps the dialog and says why when the copy could not be deleted', async () => {
    const actions = fakeAccount(linkedAccount());
    actions.deleteAccount.mockRejectedValue(new AccountError('offline'));
    show(actions);
    await userEvent.click(button('Turn off and delete my copy'));
    const dialog = screen.getByRole('dialog', { name: 'Turn off and delete my copy?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my copy' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("You're offline.");
  });

  it('shows the strength of the new password, and refuses a common one, the account email or the username', async () => {
    const actions = show(fakeAccount(linkedAccount({ username: 'robin.smith1' })));
    await userEvent.click(button('Change password'));
    const dialog = screen.getByRole('dialog', { name: 'Change password' });
    const fresh = within(dialog).getByLabelText('New password');
    await userEvent.type(within(dialog).getByLabelText('Current password'), 'old password here');
    // Only the new password gets a bar.
    expect(within(dialog).queryAllByText(/^(Weak|Okay|Strong)$/)).toHaveLength(0);

    await userEvent.type(fresh, 'password123');
    expect(within(dialog).getAllByText(/^(Weak|Okay|Strong)$/)).toHaveLength(1);
    expect(within(dialog).getByText('Weak')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Confirm new password'), 'password123');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(
      within(dialog).getByText('That password is too common. Pick another one.'),
    ).toBeInTheDocument();

    // The account's email, as it was made: the bar says Weak before it is sent, and sending says why.
    await userEvent.clear(fresh);
    await userEvent.type(fresh, 'Robin@Example.com');
    expect(within(dialog).getByText('Weak')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(
      within(dialog).queryByText('That password is too common. Pick another one.'),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("Don't use your username or email as your password."),
    ).toBeInTheDocument();

    // A good one clears the line (its confirmation is still the old one), then the username is refused alike.
    await userEvent.clear(fresh);
    await userEvent.type(fresh, 'Tr0ub4dor&3xyz');
    expect(within(dialog).getByText('Strong')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(
      within(dialog).queryByText("Don't use your username or email as your password."),
    ).not.toBeInTheDocument();
    await userEvent.clear(fresh);
    await userEvent.type(fresh, 'Robin.Smith1');
    expect(within(dialog).getByText('Weak')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(
      within(dialog).getByText("Don't use your username or email as your password."),
    ).toBeInTheDocument();
    expect(actions.changePassword).not.toHaveBeenCalled();
  });

  it('changes the password after checking the new one', async () => {
    const actions = show(fakeAccount(linkedAccount()));
    await userEvent.click(button('Change password'));
    const dialog = screen.getByRole('dialog', { name: 'Change password' });
    await userEvent.type(within(dialog).getByLabelText('Current password'), 'old password here');
    await userEvent.type(within(dialog).getByLabelText('New password'), 'short');
    await userEvent.type(within(dialog).getByLabelText('Confirm new password'), 'short');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(within(dialog).getByText('Use at least 10 characters.')).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('New password'));
    await userEvent.type(within(dialog).getByLabelText('New password'), 'a brand new password');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(within(dialog).getByText("Those don't match.")).toBeInTheDocument();
    expect(actions.changePassword).not.toHaveBeenCalled();

    await userEvent.clear(within(dialog).getByLabelText('Confirm new password'));
    await userEvent.type(
      within(dialog).getByLabelText('Confirm new password'),
      'a brand new password',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(actions.changePassword).toHaveBeenCalledWith(
      'old password here',
      'a brand new password',
    );
    expect(screen.queryByRole('dialog', { name: 'Change password' })).not.toBeInTheDocument();
  });

  it('shows a wrong current password in the dialog', async () => {
    const actions = fakeAccount(linkedAccount());
    actions.changePassword.mockRejectedValue(
      new AccountError('wrong', "That isn't your current password."),
    );
    show(actions);
    await userEvent.click(button('Change password'));
    const dialog = screen.getByRole('dialog', { name: 'Change password' });
    await userEvent.type(within(dialog).getByLabelText('Current password'), 'nope');
    await userEvent.type(within(dialog).getByLabelText('New password'), 'a brand new password');
    await userEvent.type(
      within(dialog).getByLabelText('Confirm new password'),
      'a brand new password',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "That isn't your current password.",
    );
  });
});

describe("Settings' account dialogs", () => {
  it.each([
    ['Create account', 'Create your account', false, ['Password']],
    ['Log in', 'Log in', false, ['Password']],
    [
      'Change password',
      'Change password',
      true,
      ['Current password', 'New password', 'Confirm new password'],
    ],
  ] as const)(
    '%s can show each password typed, as setup and Log in can',
    async (open, title, linked, labels) => {
      show(linked ? fakeAccount(linkedAccount()) : fakeAccount());
      await userEvent.click(button(open));
      const dialog = screen.getByRole('dialog', { name: title });
      const toggles = within(dialog).getAllByRole('button', { name: 'Show password' });
      expect(toggles).toHaveLength(labels.length);
      for (const [i, label] of labels.entries()) {
        const field = within(dialog).getByLabelText(label);
        expect(field).toHaveAttribute('type', 'password');
        await userEvent.click(toggles[i]!);
        expect(field).toHaveAttribute('type', 'text');
      }
    },
  );
});

describe('Settings → Account after another phone logged in', () => {
  const moved = () => fakeAccount(linkedAccount({ status: 'moved' }));

  it('says so, and offers to log in again or carry on without an account', () => {
    show(moved());
    expect(screen.getByText('Your account moved to another phone')).toBeInTheDocument();
    expect(button('Log in again')).toBeInTheDocument();
    expect(button('Keep using without an account')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Last copy saved/)).not.toBeInTheDocument();
  });

  it('carries on without an account', async () => {
    const actions = show(moved());
    await userEvent.click(button('Keep using without an account'));
    expect(actions.unlink).toHaveBeenCalledTimes(1);
  });

  it("logs in again, asking before it replaces this phone's data", async () => {
    const actions = moved();
    actions.logIn.mockResolvedValueOnce('needs-confirm');
    show(actions);
    await userEvent.click(button('Log in again'));
    const dialog = screen.getByRole('dialog', { name: 'Log in' });
    expect(within(dialog).getByLabelText('Username')).toHaveValue('robin');
    await userEvent.type(within(dialog).getByLabelText('Password'), PASSWORD);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log in' }));
    expect(
      within(dialog).getByText("Replace this phone's data with your account's copy?"),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace' }));
    expect(actions.logIn).toHaveBeenLastCalledWith(
      { username: 'robin', password: PASSWORD },
      { replace: true },
    );
  });
});
