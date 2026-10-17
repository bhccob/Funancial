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
    expect(
      screen.getByText('A locked copy of your data is kept so you can move to a new phone.'),
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

  it('creates an account from what is typed, with the checks before any request', async () => {
    const actions = show();
    await userEvent.click(button('Create account'));
    const dialog = screen.getByRole('dialog', { name: 'Create your account' });
    expect(
      within(dialog).getByText('So you can move to a new phone and keep everything.'),
    ).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Username'), 'ro');
    await userEvent.type(within(dialog).getByLabelText('Email (for "forgot password")'), 'nobody');
    await userEvent.type(within(dialog).getByLabelText('Password'), 'short');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create account' }));
    expect(within(dialog).getByText(/Use 3 to 30 letters/)).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(within(dialog).getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(actions.signUp).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText('Username'), 'bin');
    await userEvent.clear(within(dialog).getByLabelText('Email (for "forgot password")'));
    await userEvent.type(
      within(dialog).getByLabelText('Email (for "forgot password")'),
      'robin@example.com',
    );
    await userEvent.type(within(dialog).getByLabelText('Password'), ' and then some');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create account' }));
    expect(actions.signUp).toHaveBeenCalledWith({
      username: 'robin',
      email: 'robin@example.com',
      password: 'short and then some',
    });
    expect(screen.queryByRole('dialog', { name: 'Create your account' })).not.toBeInTheDocument();
    expect(await screen.findByText('Your account is ready.')).toBeInTheDocument();
  });

  it('sends one request for two taps in the same instant', async () => {
    const actions = fakeAccount();
    actions.signUp.mockReturnValue(new Promise(() => {}));
    show(actions);
    await userEvent.click(button('Create account'));
    const dialog = screen.getByRole('dialog', { name: 'Create your account' });
    await userEvent.type(within(dialog).getByLabelText('Username'), 'robin');
    await userEvent.type(
      within(dialog).getByLabelText('Email (for "forgot password")'),
      'robin@example.com',
    );
    await userEvent.type(within(dialog).getByLabelText('Password'), PASSWORD);
    const form = dialog.querySelector('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(actions.signUp).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('shows why an account could not be made, and keeps the form', async () => {
    const actions = fakeAccount();
    actions.signUp.mockRejectedValue(new AccountError('taken'));
    show(actions);
    await userEvent.click(button('Create account'));
    const dialog = screen.getByRole('dialog', { name: 'Create your account' });
    await userEvent.type(within(dialog).getByLabelText('Username'), 'robin');
    await userEvent.type(
      within(dialog).getByLabelText('Email (for "forgot password")'),
      'robin@example.com',
    );
    await userEvent.type(within(dialog).getByLabelText('Password'), PASSWORD);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create account' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'That username is taken. Try another one.',
    );
    expect(within(dialog).getByLabelText('Username')).toHaveValue('robin');
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

  it('keeps the dialog and says why when the copy could not be deleted', async () => {
    const actions = fakeAccount(linkedAccount());
    actions.deleteAccount.mockRejectedValue(new AccountError('offline'));
    show(actions);
    await userEvent.click(button('Turn off and delete my copy'));
    const dialog = screen.getByRole('dialog', { name: 'Turn off and delete my copy?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my copy' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("You're offline.");
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

describe('Settings → Account after another phone logged in', () => {
  const moved = () => fakeAccount(linkedAccount({ status: 'moved' }));

  it('says so, and offers to log in again or carry on without an account', () => {
    show(moved());
    expect(screen.getByText('Your account moved to another phone')).toBeInTheDocument();
    expect(button('Log in again')).toBeInTheDocument();
    expect(button('Keep using without an account')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
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
