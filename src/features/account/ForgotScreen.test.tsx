import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountError } from '@/store/accountActions';
import { renderWithStore } from '@/test/appStoreStub';
import { fakeAccount, withAccount } from '@/test/fakeAccount';
import { ForgotScreen } from './ForgotScreen';

const SENT = "If that account exists, we've emailed a link. It works for 30 minutes.";

function show(actions = fakeAccount(), onBack = vi.fn()) {
  renderWithStore(withAccount(actions, <ForgotScreen onBack={onBack} />));
  return { actions, onBack };
}

const ask = async (who: string) => {
  await userEvent.type(screen.getByLabelText('Username or email'), who);
  await userEvent.click(screen.getByRole('button', { name: 'Email me a link' }));
};

describe('ForgotScreen', () => {
  it('asks for a username or an email, and says what will happen', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Forgot password?' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username or email')).toHaveClass('border-b', 'font-extrabold');
    expect(screen.getByText(/We.ll email you a link/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeEmptyDOMElement();
  });

  it('says what to fix, and asks the service nothing, when it is neither a username nor an email', async () => {
    const { actions } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Email me a link' }));
    expect(screen.getByText('Enter your username or your email address.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Username or email'), 'robin@');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a link' }));
    expect(screen.getByText('Enter your username or your email address.')).toBeInTheDocument();
    expect(actions.forgot).not.toHaveBeenCalled();
  });

  it.each(['robin', 'robin@example.com'])(
    'shows the same line, whoever the account is, for %s',
    async (who) => {
      const { actions } = show();
      await ask(who);
      expect(actions.forgot).toHaveBeenCalledWith(who);
      expect(await screen.findByRole('status')).toHaveTextContent(SENT);
      // Nothing tells whether there is such an account.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('shows a calm line, and no success, when the service is not answering, and lets the person try again', async () => {
    const actions = fakeAccount();
    actions.forgot.mockRejectedValueOnce(new AccountError('unavailable'));
    show(actions);
    await ask('robin');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Funancial's service isn't answering right now. Try again in a moment.",
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByLabelText('Username or email')).toHaveValue('robin');

    await userEvent.click(screen.getByRole('button', { name: 'Email me a link' }));
    expect(await screen.findByRole('status')).toHaveTextContent(SENT);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the wait of a rate limit', async () => {
    const actions = fakeAccount();
    actions.forgot.mockRejectedValueOnce(
      new AccountError('limited', 'Too many tries. Try again in 30 minutes.'),
    );
    show(actions);
    await ask('robin');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many tries. Try again in 30 minutes.',
    );
  });

  it('sends one request for two taps in the same instant, and shows it is working', async () => {
    const actions = fakeAccount();
    actions.forgot.mockReturnValue(new Promise(() => {}));
    show(actions);
    await userEvent.type(screen.getByLabelText('Username or email'), 'robin');
    const form = screen.getByLabelText('Username or email').closest('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(actions.forgot).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('goes back to log in from the arrow, and from the line that says the link is on its way', async () => {
    const { onBack } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await ask('robin');
    await userEvent.click(await screen.findByRole('button', { name: 'Back to log in' }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
