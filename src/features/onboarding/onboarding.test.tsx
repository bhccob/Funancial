import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { toastStore } from '@/lib/toast';
import { KeyDerivationError } from '@/data/accountCrypto';
import { AccountError } from '@/store/accountActions';
import { createFinanceActions, type OnboardingInput } from '@/store/financeActions';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { lacksClasses } from '@/test/classes';
import { fakeAccount, linkedAccount, withAccount } from '@/test/fakeAccount';
import { makeProfile } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { OnboardingWizard } from './OnboardingWizard';

const actions = vi.hoisted(() => ({
  completeOnboarding: vi.fn<(input: OnboardingInput) => Promise<void>>(async () => {}),
}));
vi.mock('@/store/useFinance', () => ({ useFinanceActions: () => actions }));

const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;

/** The phone is in `timeZone`, with its language set to `language`. */
function phoneIn(timeZone: string, language = 'en-US') {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    return { ...realResolvedOptions.call(this), timeZone };
  });
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);
}

beforeEach(() => {
  actions.completeOnboarding.mockClear();
  toastStore.setState({ toasts: [] });
  // Setup starts on the phone's currency, so the machine running the tests must not decide it.
  phoneIn('America/New_York');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const PASSWORD = 'a long enough password';
const CODE_LEAD =
  'We sent a 6-digit code to robin@example.com. Your account is made once you type it.';
const CODE_HINT = 'The code works for 10 minutes. Wrong email? Go back and fix it.';
const SERVICE_DOWN =
  "Funcial's service isn't answering right now. You can make an account later in Settings.";
/** What setup no longer asks: the money steps that are gone. */
const MONEY_LABELS = [
  'In your bank account',
  'In savings',
  'Monthly take-home pay',
  'Credit cards',
];

/** The step showing now: the one that is leaving stays a moment, with fields of its own. */
const nowShowing = () => within(document.querySelector<HTMLElement>('[data-motion="current"]')!);
let user = userEvent.setup();
beforeEach(() => {
  user = userEvent.setup();
});
/**
 * A clock that moves only when the test moves it (`advance`), so a 30 s hold is measured to the
 * millisecond. Under it a test acts with `fireEvent` in `act` (`tap`, `typeIn`): user-event and
 * `findBy…` wait on a `setTimeout` of Testing Library's own, which a stopped clock never runs.
 */
function fakeClock() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
}
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
/** A tap, and whatever it sets going (a request answered at once) settled. */
const tap = (element: HTMLElement) => act(async () => void fireEvent.click(element));
const typeIn = (label: string, value: string) =>
  act(() => void fireEvent.change(nowShowing().getByLabelText(label), { target: { value } }));
/** `toCode`, under the stopped clock. */
async function toCodeOnTheClock() {
  typeIn('Username', 'Robin');
  typeIn('Email', 'robin@example.com');
  typeIn('Password', PASSWORD);
  await tap(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Check your email' })).toBeInTheDocument();
}
const press = (name: string) => user.click(screen.getByRole('button', { name }));
const next = () => press('Continue');
const verify = () => press('Verify');
const resendButton = () => screen.getByRole('button', { name: 'Send a new code' });

/** The wizard under an account layer (a fake unless one is given), with spies for what it asks of the app. */
function renderWizard(
  options: {
    account?: ReturnType<typeof fakeAccount>;
    store?: ReturnType<typeof createStubStore>;
  } = {},
  onFinishing = vi.fn(),
) {
  const account = options.account ?? fakeAccount();
  const rendered = renderWithStore(
    withAccount(
      account,
      <>
        <OnboardingWizard onFinishing={onFinishing} />
        <Toaster />
      </>,
    ),
    options.store,
  );
  return { account, onFinishing, ...rendered };
}

/** Types the three fields of the account step. */
async function fillAccount(username = 'Robin', email = 'robin@example.com', password = PASSWORD) {
  await user.type(screen.getByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
}

/** The account step filled and sent: on the code step. */
async function toCode() {
  await fillAccount();
  await next();
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Check your email' }),
  ).toBeInTheDocument();
}

/** Types `code` on the code step and verifies it. */
async function enterCode(code = '481529') {
  await user.type(nowShowing().getByLabelText('Code'), code);
  await verify();
}

/** Past the account step by the way a phone with no connection takes: on to Currency and name. */
async function skipAccount() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  act(() => void window.dispatchEvent(new Event('offline')));
  await user.click(await screen.findByRole('button', { name: 'Skip for now' }));
}

/** From Currency and name on to the lock. */
const toLock = () => next();

describe('four steps, no money asked', () => {
  it('reads Step 1 of 4 to Step 4 of 4, and never asks for a balance, a salary or a card', async () => {
    renderWizard();
    const noMoney = () => {
      for (const label of MONEY_LABELS) {
        expect(screen.queryByLabelText(label), label).not.toBeInTheDocument();
        expect(screen.queryByText(label), label).not.toBeInTheDocument();
      }
    };
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    noMoney();
    await toCode();
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    noMoney();
    await enterCode();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your currency and name' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
    noMoney();
    await toLock();
    expect(screen.getByRole('heading', { level: 1, name: 'Lock Funcial?' })).toBeInTheDocument();
    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument();
    noMoney();
    await press('Start my adventure');
    expect(
      await screen.findByRole('heading', { level: 1, name: "You're all set" }),
    ).toBeInTheDocument();
    expect(actions.completeOnboarding).toHaveBeenCalledWith({ name: '', currency: 'USD' });
  });
});

describe('the account step', () => {
  it('is the first of four, with the words the owner chose', () => {
    renderWizard();
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('So you can move to a new phone and keep everything.'),
    ).toBeInTheDocument();
    for (const label of ['Username', 'Email', 'Password']) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument();
    }
    // What the email is for, under its row.
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('For "forgot password".');
    // Where a friend agrees to the account: that the owner could unlock the copy, and why.
    expect(
      screen.getByText(
        'A locked copy of your data is kept so you can move to a new phone. The app\'s owner runs the service and could unlock it, which is how "forgot password" brings your data back.',
      ),
    ).toBeInTheDocument();
    // The old first step is gone, and with it the checkbox.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Before we start')).not.toBeInTheDocument();
  });

  it('has no way to skip while online', () => {
    renderWizard();
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
  });

  it('offline at the account step offers Skip for now, which goes on to Currency and name', async () => {
    const { account } = renderWizard();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(
      await screen.findByText("You're offline. Create your account later in Settings."),
    ).toBeInTheDocument();

    await press('Skip for now');
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your currency and name' }),
    ).toBeInTheDocument();
    expect(account.requestCode).not.toHaveBeenCalled();
    expect(account.signUp).not.toHaveBeenCalled();
  });

  it('takes the skip back when the connection returns', async () => {
    renderWizard();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(await screen.findByRole('button', { name: 'Skip for now' })).toBeInTheDocument();
    online.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument(),
    );
  });

  it('checks the username, email and password with a message each, before asking anyone', async () => {
    const { account } = renderWizard();
    await next();
    expect(screen.getByText(/Use 3 to 30 letters/)).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(account.requestCode).not.toHaveBeenCalled();
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
  });

  it('shows how strong the password is, and refuses a common one or the username before asking anyone', async () => {
    const { account } = renderWizard();
    await user.type(screen.getByLabelText('Username'), 'robin.smith1');
    await user.type(screen.getByLabelText('Email'), 'robin@example.com');
    const password = screen.getByLabelText('Password');
    expect(screen.queryByText(/^(Weak|Okay|Strong)$/)).not.toBeInTheDocument();

    await user.type(password, 'password123');
    expect(screen.getByText('Weak')).toBeInTheDocument();
    await next();
    expect(screen.getByText('That password is too common. Pick another one.')).toBeInTheDocument();

    await user.clear(password);
    await user.type(password, 'ROBIN.smith1');
    // The bar agrees with what Continue will say, whatever the password looks like.
    expect(screen.getByText('Weak')).toBeInTheDocument();
    await next();
    expect(
      screen.getByText("Don't use your username or email as your password."),
    ).toBeInTheDocument();

    await user.clear(password);
    await user.type(password, 'abcdefghijk');
    expect(screen.getByText('Okay')).toBeInTheDocument();
    await user.clear(password);
    await user.type(password, 'Tr0ub4dor&3xyz');
    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(account.requestCode).not.toHaveBeenCalled();
  });

  it('can show what was typed in the password', async () => {
    renderWizard();
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    await press('Show password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });

  it('shows it is working and sends one request for two taps in the same instant', async () => {
    const account = fakeAccount();
    account.requestCode.mockReturnValue(new Promise(() => {}));
    renderWizard({ account });
    await fillAccount();
    const form = screen.getByLabelText('Username').closest('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(account.requestCode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });

  it('a taken name shows on the username field, and stays', async () => {
    const account = fakeAccount();
    account.requestCode.mockRejectedValue(new AccountError('taken'));
    renderWizard({ account });
    await fillAccount();
    await next();
    const alert = await screen.findByText('That username is taken. Try another one.');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('Robin');
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
    expect(account.signUp).not.toHaveBeenCalled();
  });

  // `unavailable` is any 5xx (a 503 "not set up" too) and a refused shared token (401 unauthorized).
  it.each([
    ['unavailable', new AccountError('unavailable')],
    ['busy', new AccountError('busy')],
  ] as const)(
    'offers the skip, with one calm line, when the service fails (%s), and still lets the person try again',
    async (_, error) => {
      const account = fakeAccount();
      account.requestCode.mockRejectedValueOnce(error);
      renderWizard({ account });
      await fillAccount();
      await next();
      expect(await screen.findByText(SERVICE_DOWN)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();

      // Or the next try sends the code.
      await next();
      expect(account.requestCode).toHaveBeenCalledTimes(2);
      expect(await screen.findByText('Step 2 of 4')).toBeInTheDocument();
    },
  );

  it('says how long to wait after too many codes, in the calm line, and still offers the skip', async () => {
    const account = fakeAccount();
    account.requestCode.mockRejectedValueOnce(
      new AccountError('limited', 'Too many tries. Try again in 60 minutes.', 3600),
    );
    renderWizard({ account });
    await fillAccount();
    await next();
    expect(await screen.findByText('Too many tries. Try again in 60 minutes.')).toBeInTheDocument();
    // Its own words, not the service's: it is answering, and holding back.
    expect(screen.queryByText(SERVICE_DOWN)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();

    // Or the next try sends the code.
    await next();
    expect(await screen.findByText('Step 2 of 4')).toBeInTheDocument();
  });

  it('skips on from a failed service, without asking it again', async () => {
    const account = fakeAccount();
    account.requestCode.mockRejectedValue(new AccountError('unavailable'));
    renderWizard({ account });
    await fillAccount();
    await next();
    await user.click(await screen.findByRole('button', { name: 'Skip for now' }));
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
    expect(account.requestCode).toHaveBeenCalledTimes(1);
    expect(account.signUp).not.toHaveBeenCalled();
  });

  it('offers no skip for what the person typed, and takes back one an earlier failure offered', async () => {
    const account = fakeAccount();
    account.requestCode
      .mockRejectedValueOnce(new AccountError('unavailable'))
      .mockRejectedValueOnce(new AccountError('invalid'));
    renderWizard({ account });
    await fillAccount();
    await next();
    expect(await screen.findByRole('button', { name: 'Skip for now' })).toBeInTheDocument();

    await next();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check what you typed and try again.',
    );
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
    expect(screen.queryByText(/isn't answering/)).not.toBeInTheDocument();
  });

  it('offers the skip too when nothing comes back, though the phone thinks it is online', async () => {
    const account = fakeAccount();
    account.requestCode.mockRejectedValue(new AccountError('offline'));
    renderWizard({ account });
    await fillAccount();
    await next();
    // One offline line, the owner's words, with the way on: not a second one from the layer too.
    expect(
      await screen.findByText("You're offline. Create your account later in Settings."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Try again when you're connected/)).not.toBeInTheDocument();
    await press('Skip for now');
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
  });

  it('cannot be skipped while the code is being asked for', async () => {
    const account = fakeAccount();
    account.requestCode.mockReturnValue(new Promise(() => {}));
    renderWizard({ account });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    await fillAccount();
    await next();
    expect(account.requestCode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeDisabled();
  });

  it('forgets the password when the step is skipped, and keeps the rest for a return', async () => {
    renderWizard();
    await user.type(screen.getByLabelText('Username'), 'Robin');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await skipAccount();
    await press('Back');
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(nowShowing().getByLabelText('Password')).toHaveValue('');
    expect(nowShowing().getByLabelText('Username')).toHaveValue('Robin');
  });

  describe('for someone who already has an account', () => {
    const link = () => screen.getByRole('button', { name: 'I already have an account' });

    it('offers a way to log in instead, which opens Log in and can come back to setup', async () => {
      renderWizard();
      await user.type(screen.getByLabelText('Username'), 'Robin');
      await user.click(link());
      expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toHaveFocus();
      expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
      expect(screen.queryByText('Step 1 of 4')).not.toBeInTheDocument();

      await press('Back');
      expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toHaveFocus();
      expect(nowShowing().getByLabelText('Username')).toHaveValue('Robin');
      expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    });

    it('logs in over setup, holding the app on this screen until the PIN is dealt with', async () => {
      const { account, onFinishing, store } = renderWizard();
      await user.click(link());
      await user.type(nowShowing().getByLabelText('Username'), 'robin');
      await user.type(nowShowing().getByLabelText('Password'), PASSWORD);
      await press('Log in');
      expect(account.logIn).toHaveBeenCalledWith(
        { username: 'robin', password: PASSWORD },
        { replace: false },
      );
      expect(onFinishing).toHaveBeenLastCalledWith(true);
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Lock this phone' }),
      ).toBeInTheDocument();
      await user.type(screen.getByLabelText('Choose a PIN'), '2468');
      await user.type(screen.getByLabelText('Confirm PIN'), '2468');
      await press('Set PIN');
      await vi.waitFor(() => expect(onFinishing).toHaveBeenLastCalledWith(false));
      expect(store.getState().setSecret).toHaveBeenCalledWith('2468', 'pin');
    });

    it('is not offered while the code is being asked for, or when the phone has one', async () => {
      const account = fakeAccount();
      account.requestCode.mockReturnValue(new Promise(() => {}));
      const { unmount } = renderWizard({ account });
      await fillAccount();
      await next();
      expect(link()).toBeDisabled();
      unmount();

      renderWizard({ account: fakeAccount(linkedAccount()) });
      expect(
        screen.queryByRole('button', { name: 'I already have an account' }),
      ).not.toBeInTheDocument();
    });

    it('waits for the phone to read its account, as Continue does', () => {
      renderWizard({ account: fakeAccount(null, false) });
      expect(link()).toBeDisabled();
    });
  });

  it('a linked account skips the code step, and asks for no code or account', async () => {
    const account = fakeAccount(linkedAccount());
    renderWizard({ account });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your account is ready' }),
    ).toBeInTheDocument();
    expect(screen.getByText("You're signed in as robin.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
    await next();
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your currency and name' }),
    ).toBeInTheDocument();
    expect(account.requestCode).not.toHaveBeenCalled();
    expect(account.signUp).not.toHaveBeenCalled();
    // And Back goes to the account, past the code step there was none of.
    await press('Back');
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
  });

  it('waits for the phone to read whether it has an account', () => {
    renderWizard({ account: fakeAccount(null, false) });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  describe('Back, to the Welcome screen', () => {
    const back = () => screen.queryByRole('button', { name: 'Back' });

    it('erases the still-empty data "Create an account" made, by the Delete all data path', async () => {
      const { store } = renderWizard();
      await user.click(back()!);
      expect(store.getState().deleteAllData).toHaveBeenCalledTimes(1);
    });

    it('is not offered with an account, with data, or before the phone has read its account', () => {
      const data = emptySnapshot();
      const withData = {
        ...data,
        tables: { ...data.tables, transaction: [{ id: 't1' }] },
      } as unknown as DataSnapshot;
      for (const options of [
        { account: fakeAccount(linkedAccount()) },
        { account: fakeAccount(linkedAccount({ status: 'moved' })) },
        { account: fakeAccount(null, false) },
        { store: createStubStore({ data: withData }) },
      ]) {
        const { unmount } = renderWizard(options);
        expect(back()).not.toBeInTheDocument();
        unmount();
      }
    });

    it('waits while the code is being asked for', async () => {
      const account = fakeAccount();
      account.requestCode.mockReturnValue(new Promise(() => {}));
      renderWizard({ account });
      await fillAccount();
      await next();
      expect(back()).toBeDisabled();
    });
  });
});

describe('the code step', () => {
  it('asks for a code, then makes the account with it', async () => {
    const { account } = renderWizard();
    await fillAccount();
    await next();
    expect(account.requestCode).toHaveBeenCalledTimes(1);
    expect(account.requestCode).toHaveBeenCalledWith({
      username: 'Robin',
      email: 'robin@example.com',
    });
    // Nothing is made before the code: the keys come with it.
    expect(account.signUp).not.toHaveBeenCalled();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Check your email' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.getByText('Security', { selector: 'header > p' })).toBeInTheDocument();
    expect(screen.getByText(CODE_LEAD)).toBeInTheDocument();
    expect(screen.getByText(CODE_HINT)).toBeInTheDocument();
    expect(nowShowing().getByLabelText('Code')).toHaveAttribute('autocomplete', 'one-time-code');
    // Tab from the heading to the field, and a screen reader is told where the code went.
    expect(nowShowing().getByLabelText('Code')).toHaveAccessibleDescription(CODE_LEAD);
    expect(resendButton()).toBeInTheDocument();

    await enterCode('481529');
    expect(account.signUp).toHaveBeenCalledTimes(1);
    expect(account.signUp).toHaveBeenCalledWith({
      username: 'Robin',
      email: 'robin@example.com',
      password: PASSWORD,
      code: '481529',
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your currency and name' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
    // The step is headed You: About you is gone from the app.
    expect(screen.getByText('You', { selector: 'header > p' })).toBeInTheDocument();
    expect(screen.queryByText('About you')).not.toBeInTheDocument();
    expect(account.requestCode).toHaveBeenCalledTimes(1);
  });

  it('pastes a spaced code, and signs up with its digits', async () => {
    const { account } = renderWizard();
    await toCode();
    await user.click(nowShowing().getByLabelText('Code'));
    await user.paste('481 529');
    expect(nowShowing().getByLabelText('Code')).toHaveValue('481529');
    await verify();
    expect(account.signUp).toHaveBeenCalledWith(expect.objectContaining({ code: '481529' }));
  });

  it('back from the code keeps what was typed, and asks again only for a changed address', async () => {
    const { account } = renderWizard();
    await toCode();
    await user.type(nowShowing().getByLabelText('Code'), '48');
    await press('Back');
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(nowShowing().getByLabelText('Username')).toHaveValue('Robin');
    expect(nowShowing().getByLabelText('Email')).toHaveValue('robin@example.com');
    expect(nowShowing().getByLabelText('Password')).toHaveValue(PASSWORD);

    // Nothing changed: on to the code that was sent, with what was typed of it.
    await next();
    expect(await screen.findByText('Step 2 of 4')).toBeInTheDocument();
    expect(account.requestCode).toHaveBeenCalledTimes(1);
    expect(nowShowing().getByLabelText('Code')).toHaveValue('48');

    // A fixed address gets a code of its own.
    await press('Back');
    const email = nowShowing().getByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'robin@mail.example');
    await next();
    expect(await screen.findByText('Step 2 of 4')).toBeInTheDocument();
    expect(account.requestCode).toHaveBeenCalledTimes(2);
    expect(account.requestCode).toHaveBeenLastCalledWith({
      username: 'Robin',
      email: 'robin@mail.example',
    });
    expect(
      screen.getByText(
        'We sent a 6-digit code to robin@mail.example. Your account is made once you type it.',
      ),
    ).toBeInTheDocument();
    expect(nowShowing().getByLabelText('Code')).toHaveValue('');
    await enterCode('135790');
    expect(account.signUp).toHaveBeenCalledWith({
      username: 'Robin',
      email: 'robin@mail.example',
      password: PASSWORD,
      code: '135790',
    });
  });

  it('goes on to the code already sent when only the name changed, too soon for another mail', async () => {
    const account = fakeAccount();
    account.requestCode
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(
        new AccountError('limited', 'Too many tries. Try again in a minute.', 20),
      );
    renderWizard({ account });
    await toCode();
    await press('Back');
    await user.type(nowShowing().getByLabelText('Username'), '2');
    await next();
    // The name is asked about again; the address's code still works, so the step is the code's.
    expect(account.requestCode).toHaveBeenLastCalledWith({
      username: 'Robin2',
      email: 'robin@example.com',
    });
    expect(await screen.findByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.queryByText(SERVICE_DOWN)).not.toBeInTheDocument();
    expect(resendButton()).toBeDisabled();
    await enterCode();
    expect(account.signUp).toHaveBeenCalledWith(expect.objectContaining({ username: 'Robin2' }));
  });

  it('a wrong code says so and stays, and the right one then goes on', async () => {
    const account = fakeAccount();
    account.signUp.mockRejectedValueOnce(new AccountError('code'));
    renderWizard({ account });
    await toCode();
    await enterCode('111111');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("That code isn't right. Check the email and try again.");
    expect(nowShowing().getByLabelText('Code')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();

    const code = nowShowing().getByLabelText('Code');
    await user.clear(code);
    await enterCode('481529');
    expect(account.signUp).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Step 3 of 4')).toBeInTheDocument();
  });

  it('asks for all six digits of a code that is short, before the slow work', async () => {
    const { account } = renderWizard();
    await toCode();
    await enterCode('4815');
    expect(await screen.findByRole('alert')).toHaveTextContent('Type all 6 digits.');
    expect(nowShowing().getByLabelText('Code')).toHaveAttribute('aria-invalid', 'true');
    expect(account.signUp).not.toHaveBeenCalled();
  });

  it('says an expired code has expired, and offers a new one at once', async () => {
    const account = fakeAccount();
    account.signUp.mockRejectedValueOnce(new AccountError('expired'));
    renderWizard({ account });
    await toCode();
    expect(resendButton()).toBeDisabled();
    await enterCode();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code has expired. Send a new one.',
    );
    expect(resendButton()).toBeEnabled();
    await user.click(resendButton());
    expect(account.requestCode).toHaveBeenCalledTimes(2);
  });

  it('send a new code waits 30 seconds after each send', async () => {
    fakeClock();
    const { account } = renderWizard();
    await toCodeOnTheClock();
    typeIn('Code', '48');
    expect(resendButton()).toBeDisabled();
    advance(29_999);
    expect(resendButton()).toBeDisabled();
    advance(1);
    expect(resendButton()).toBeEnabled();

    await tap(resendButton());
    expect(account.requestCode).toHaveBeenCalledTimes(2);
    expect(account.requestCode).toHaveBeenLastCalledWith({
      username: 'Robin',
      email: 'robin@example.com',
    });
    expect(screen.getByRole('status')).toHaveTextContent('We sent a new code.');
    // The code typed so far was the old one's.
    expect(nowShowing().getByLabelText('Code')).toHaveValue('');
    expect(resendButton()).toBeDisabled();
    advance(29_999);
    expect(resendButton()).toBeDisabled();
    advance(1);
    expect(resendButton()).toBeEnabled();
  });

  it('holds Send a new code as long as the service says when it refuses one', async () => {
    fakeClock();
    const account = fakeAccount();
    account.requestCode
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(
        new AccountError('limited', 'Too many tries. Try again in 2 minutes.', 120),
      );
    renderWizard({ account });
    await toCodeOnTheClock();
    advance(30_000);
    await tap(resendButton());
    expect(screen.getByRole('alert')).toHaveTextContent('Too many tries. Try again in 2 minutes.');
    expect(resendButton()).toBeDisabled();
    advance(119_999);
    expect(resendButton()).toBeDisabled();
    advance(1);
    expect(resendButton()).toBeEnabled();
  });

  it('keeps the code that was typed when a new one could not be sent', async () => {
    fakeClock();
    const account = fakeAccount();
    account.requestCode
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new AccountError('unavailable'));
    renderWizard({ account });
    await toCodeOnTheClock();
    typeIn('Code', '481');
    advance(30_000);
    await tap(resendButton());
    // The service keeps the last code when a mail fails, so what was typed of it stays.
    expect(screen.getByText(SERVICE_DOWN)).toBeInTheDocument();
    expect(nowShowing().getByLabelText('Code')).toHaveValue('481');
  });

  it('offers a new code after too many tries at Verify, as the code may be spent', async () => {
    const account = fakeAccount();
    account.signUp.mockRejectedValueOnce(
      new AccountError('limited', 'Too many tries. Try again in 60 minutes.', 3600),
    );
    renderWizard({ account });
    await toCode();
    await enterCode();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many tries. Try again in 60 minutes.',
    );
    expect(resendButton()).toBeEnabled();
    // Nor does a limit block setup.
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
  });

  it('holds Verify while a new code is on its way, and Send a new code while the account is made', async () => {
    fakeClock();
    const account = fakeAccount();
    let sent = () => {};
    account.requestCode
      .mockResolvedValueOnce()
      .mockReturnValueOnce(new Promise<void>((resolve) => (sent = resolve)));
    account.signUp.mockReturnValue(new Promise(() => {}));
    renderWizard({ account });
    await toCodeOnTheClock();
    advance(30_000);
    await tap(resendButton());
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    expect(resendButton()).toBeDisabled();
    await act(async () => sent());
    expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled();

    advance(30_000);
    expect(resendButton()).toBeEnabled();
    typeIn('Code', '481529');
    await tap(screen.getByRole('button', { name: 'Verify' }));
    expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled();
    expect(resendButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('sends one sign-up for two taps on Verify in the same instant', async () => {
    const account = fakeAccount();
    account.signUp.mockReturnValue(new Promise(() => {}));
    renderWizard({ account });
    await toCode();
    await user.type(nowShowing().getByLabelText('Code'), '481529');
    const form = nowShowing().getByLabelText('Code').closest('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(account.signUp).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled();
  });

  it('offers the skip, with one calm line, when the service fails at Verify', async () => {
    const account = fakeAccount();
    account.signUp.mockRejectedValue(new AccountError('unavailable'));
    renderWizard({ account });
    await toCode();
    await enterCode();
    expect(await screen.findByText(SERVICE_DOWN)).toBeInTheDocument();
    // Said politely, with the way on: not as an error in what was typed.
    expect(screen.getByRole('status')).toHaveTextContent(SERVICE_DOWN);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await press('Skip for now');
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
    expect(account.signUp).toHaveBeenCalledTimes(1);
  });

  it("says plainly when this phone couldn't make the keys, and still offers the skip", async () => {
    const account = fakeAccount();
    account.signUp.mockRejectedValueOnce(
      new KeyDerivationError(new RangeError('WebAssembly.instantiate(): Out of memory')),
    );
    renderWizard({ account });
    await toCode();
    await enterCode();
    expect(
      await screen.findByText(
        "This phone couldn't make your keys. Close other apps and try again, or make an account later in Settings.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/WebAssembly|service isn't answering/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();

    // Or the next try makes the account.
    await verify();
    expect(await screen.findByText('Step 3 of 4')).toBeInTheDocument();
  });

  it('goes back to the account step for a name taken since the code was sent', async () => {
    const account = fakeAccount();
    account.signUp.mockRejectedValueOnce(new AccountError('taken'));
    renderWizard({ account });
    await toCode();
    await enterCode();
    expect(await screen.findByText('Step 1 of 4')).toBeInTheDocument();
    expect(await screen.findByText('That username is taken. Try another one.')).toHaveAttribute(
      'role',
      'alert',
    );
    expect(nowShowing().getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
  });

  it('forgets the password and the code once the account is made, and Back then skips the code', async () => {
    const account = fakeAccount();
    account.signUp.mockImplementation(async () => {
      account.view.setState({ state: linkedAccount() });
    });
    renderWizard({ account });
    await toCode();
    await enterCode();
    expect(await screen.findByText('Step 3 of 4')).toBeInTheDocument();
    await press('Back');
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your account is ready' }),
    ).toBeInTheDocument();
    await next();
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
    expect(account.requestCode).toHaveBeenCalledTimes(1);
    expect(account.signUp).toHaveBeenCalledTimes(1);
  });
});

describe('the code step, after the person went to their email app', () => {
  it('comes back after a lock took setup down: the name and address are there, and the code sent is gone back to', async () => {
    fakeClock();
    const account = fakeAccount();
    const first = renderWizard({ account });
    await toCodeOnTheClock();
    advance(12_000);
    // The phone locks while the person reads their email: every screen is taken down.
    first.unmount();

    renderWizard({ account });
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(nowShowing().getByLabelText('Username')).toHaveValue('Robin');
    expect(nowShowing().getByLabelText('Email')).toHaveValue('robin@example.com');
    // Never the password: it is typed again.
    expect(nowShowing().getByLabelText('Password')).toHaveValue('');
    typeIn('Password', PASSWORD);
    await tap(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    // No second mail: the one sent is the code to type, and a new one waits out the rest of its 30 s.
    expect(account.requestCode).toHaveBeenCalledTimes(1);
    expect(resendButton()).toBeDisabled();
    advance(17_999);
    expect(resendButton()).toBeDisabled();
    advance(1);
    expect(resendButton()).toBeEnabled();

    typeIn('Code', '481529');
    await tap(screen.getByRole('button', { name: 'Verify' }));
    expect(account.signUp).toHaveBeenCalledWith({
      username: 'Robin',
      email: 'robin@example.com',
      password: PASSWORD,
      code: '481529',
    });
  });

  it('comes back after the app reloaded, from what the phone kept', async () => {
    const first = renderWizard();
    await toCode();
    first.unmount();

    // A reload: the app's modules start again, with nothing in memory.
    vi.resetModules();
    const { OnboardingWizard: Fresh } = await import('./OnboardingWizard');
    const fresh = await import('@/test/fakeAccount');
    const stub = await import('@/test/appStoreStub');
    const account = fresh.fakeAccount();
    stub.renderWithStore(fresh.withAccount(account, <Fresh />));

    expect(screen.getByLabelText('Username')).toHaveValue('Robin');
    expect(screen.getByLabelText('Email')).toHaveValue('robin@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await next();
    expect(await screen.findByText('Step 2 of 4')).toBeInTheDocument();
    expect(account.requestCode).not.toHaveBeenCalled();
    (await import('@/features/account/pendingCode')).keepPendingCode(null);
  });

  it('forgets the code sent once the person skips, and starts empty next time', async () => {
    const { unmount } = renderWizard();
    await toCode();
    await press('Back');
    await skipAccount();
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
    unmount();

    renderWizard();
    expect(nowShowing().getByLabelText('Username')).toHaveValue('');
    expect(nowShowing().getByLabelText('Email')).toHaveValue('');
  });

  it('forgets the code sent once the address is changed', async () => {
    const { account, unmount } = renderWizard();
    await toCode();
    await press('Back');
    await user.type(nowShowing().getByLabelText('Email'), 'x');
    unmount();

    renderWizard({ account });
    expect(nowShowing().getByLabelText('Email')).toHaveValue('');
  });

  it('takes the 30 s gap on an address it sent nothing to as a code that just went there', async () => {
    fakeClock();
    const account = fakeAccount();
    // A code went to this address 20 s ago, and this phone never heard back (or has since reloaded).
    account.requestCode.mockRejectedValueOnce(
      new AccountError('limited', 'Too many tries. Try again in a minute.', 10),
    );
    renderWizard({ account });
    await toCodeOnTheClock();
    expect(screen.queryByText(/Too many tries/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
    expect(screen.getByText(CODE_LEAD)).toBeInTheDocument();
    // A new code may be sent once the gap is over, and not before.
    expect(resendButton()).toHaveTextContent('Send a new code (0:10)');
    advance(9_999);
    expect(resendButton()).toBeDisabled();
    advance(1);
    expect(resendButton()).toBeEnabled();
  });
});

describe('Send a new code', () => {
  it('counts down the seconds until it may be sent, with its name kept for a screen reader', async () => {
    fakeClock();
    renderWizard();
    await toCodeOnTheClock();
    expect(resendButton()).toHaveTextContent('Send a new code (0:30)');
    expect(resendButton()).toHaveAccessibleName('Send a new code');
    advance(1_000);
    expect(resendButton()).toHaveTextContent('Send a new code (0:29)');
    advance(22_000);
    expect(resendButton()).toHaveTextContent('Send a new code (0:07)');
    advance(7_000);
    expect(resendButton()).toHaveTextContent(/^Send a new code$/);
    expect(resendButton()).toBeEnabled();
  });

  it('says where else to look for the email', async () => {
    renderWizard();
    await toCode();
    expect(screen.getByText('Not there? Check your spam folder.')).toBeInTheDocument();
  });
});

describe('setting up again, after Delete all data started over', () => {
  function startedOver() {
    const data = emptySnapshot();
    data.tables.profile.push(makeProfile({ name: 'Robin', currency: 'EUR', onboardedAt: null }));
    return renderWizard({
      account: fakeAccount(linkedAccount()),
      store: createStubStore({ data, lockMode: 'pin' }),
    });
  }

  it('starts from the name and currency that were kept', async () => {
    startedOver();
    await next();
    expect(screen.getByLabelText('Currency')).toHaveValue('EUR');
    expect(screen.getByLabelText('What should we call you?')).toHaveValue('Robin');
  });

  it('keeps the lock there is, rather than asking for one', async () => {
    const { store } = startedOver();
    await next();
    await toLock();
    expect(screen.getByRole('heading', { level: 1, name: 'Your PIN stays' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'No lock' })).not.toBeInTheDocument();
    await press('Start my adventure');
    expect(actions.completeOnboarding).toHaveBeenCalledWith({ name: 'Robin', currency: 'EUR' });
    expect(store.getState().setSecret).not.toHaveBeenCalled();
    expect(store.getState().clearSecret).not.toHaveBeenCalled();
  });
});

describe('OnboardingWizard', () => {
  it('keeps the lock step on screen while the PIN chosen on it is set', async () => {
    const store = createStubStore();
    vi.mocked(store.getState().setSecret).mockImplementation(async () => {
      store.setState({ lockMode: 'pin' });
    });
    actions.completeOnboarding.mockReturnValueOnce(new Promise(() => {}));
    renderWizard({ store });
    await skipAccount();
    await toLock();
    await user.click(screen.getByRole('radio', { name: 'PIN' }));
    await user.type(screen.getByLabelText('Choose a PIN'), '2468');
    await user.type(screen.getByLabelText('Confirm PIN'), '2468');
    await press('Start my adventure');
    expect(store.getState().setSecret).toHaveBeenCalledWith('2468', 'pin');
    expect(screen.getByRole('heading', { level: 1, name: 'Lock Funcial?' })).toBeInTheDocument();
  });

  it('keeps what was entered on a step when the person goes back to it', async () => {
    renderWizard();
    await skipAccount();
    await user.selectOptions(screen.getByLabelText('Currency'), 'GBP');
    await user.type(screen.getByLabelText('What should we call you?'), 'Sam');
    await toLock();
    await press('Back');
    expect(nowShowing().getByLabelText('Currency')).toHaveValue('GBP');
    expect(nowShowing().getByLabelText('What should we call you?')).toHaveValue('Sam');
  });

  it("starts on the currency of the phone's region, and the person can still pick another", async () => {
    phoneIn('Europe/Amsterdam');
    renderWizard();
    await skipAccount();
    expect(screen.getByLabelText('Currency')).toHaveValue('EUR');

    await user.selectOptions(screen.getByLabelText('Currency'), 'GBP');
    expect(screen.getByLabelText('Currency')).toHaveValue('GBP');
  });

  it('starts on the language region when the time zone is not one it knows', async () => {
    phoneIn('Mars/Olympus', 'nl-NL');
    renderWizard();
    await skipAccount();
    expect(screen.getByLabelText('Currency')).toHaveValue('EUR');
  });

  it('makes the account, finishes with a PIN, and says the person is all set', async () => {
    const { store, onFinishing, account } = renderWizard();
    await toCode();
    await enterCode();
    expect(await screen.findByText('Step 3 of 4')).toBeInTheDocument();
    expect(account.signUp).toHaveBeenCalledTimes(1);

    expect(screen.getByLabelText('Currency')).toHaveValue('USD');
    await user.type(screen.getByLabelText('What should we call you?'), 'Sam');
    await toLock();

    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'PIN' }));
    // A device without fingerprint or face (and the web) is not offered it.
    expect(
      screen.queryByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Choose a PIN'), '2468');
    await user.type(screen.getByLabelText('Confirm PIN'), '2468');
    await press('Start my adventure');

    expect(
      await screen.findByRole('heading', { level: 1, name: "You're all set, Sam" }),
    ).toBeInTheDocument();
    expect(actions.completeOnboarding).toHaveBeenCalledWith({ name: 'Sam', currency: 'USD' });
    const setSecret = vi.mocked(store.getState().setSecret);
    expect(setSecret).toHaveBeenCalledWith('2468', 'pin');
    // The lock is in place before the profile flips the app to the Dashboard.
    const [onboardedAt] = actions.completeOnboarding.mock.invocationCallOrder;
    const [lockedAt] = setSecret.mock.invocationCallOrder;
    expect(lockedAt).toBeLessThan(onboardedAt ?? 0);
    expect(store.getState().enableBiometric).not.toHaveBeenCalled();

    // The app is held on this screen while it shows the last step, and let go by Open Funcial.
    expect(onFinishing).toHaveBeenLastCalledWith(true);
    expect(onFinishing).not.toHaveBeenCalledWith(false);
    await press('Open Funcial');
    expect(onFinishing).toHaveBeenLastCalledWith(false);
  });

  it('says only that the person is all set when they gave no name', async () => {
    renderWizard();
    await skipAccount();
    await toLock();
    await press('Start my adventure');
    expect(
      await screen.findByRole('heading', { level: 1, name: "You're all set" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/your first quest is waiting/)).toBeInTheDocument();
  });

  it('stays on the last step, and lets go of the app, when setting up fails', async () => {
    actions.completeOnboarding.mockRejectedValueOnce(new Error('Storage is full.'));
    const { onFinishing } = renderWizard();
    await skipAccount();
    await toLock();
    await press('Start my adventure');
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is full.');
    expect(screen.queryByRole('heading', { name: /all set/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start my adventure' })).toBeEnabled();
    expect(onFinishing).toHaveBeenLastCalledWith(false);
  });

  it('sends only the name and the currency, and no secret without a lock', async () => {
    const { store } = renderWizard();
    await skipAccount();
    await user.type(screen.getByLabelText('What should we call you?'), 'Sam');
    await toLock();
    await press('Start my adventure');

    expect(actions.completeOnboarding).toHaveBeenCalledWith({ name: 'Sam', currency: 'USD' });
    expect(store.getState().setSecret).not.toHaveBeenCalled();
  });

  it('creates Main account at 0 as the default, and no other account', async () => {
    const { store } = await freshRealStore();
    // The real setup, on a real store.
    actions.completeOnboarding.mockImplementationOnce((input) =>
      createFinanceActions(store).completeOnboarding(input),
    );
    renderWizard({ store });
    await skipAccount();
    await toLock();
    await press('Start my adventure');

    expect(
      await screen.findByRole('heading', { level: 1, name: "You're all set" }),
    ).toBeInTheDocument();
    const { account, settings, profile } = store.getState().data.tables;
    expect(account.map((a) => [a.id, a.name, a.kind, a.openingBalance, a.inAvailable])).toEqual([
      ['acct-main', 'Main account', 'debit', 0, true],
    ]);
    expect(settings[0]?.defaultAccountId).toBe('acct-main');
    expect(profile[0]?.salary).toBeNull();
  });

  it('turns on biometric unlock after setting the PIN', async () => {
    const { store } = renderWizard({ store: createStubStore({ biometric: 'off' }) });
    await skipAccount();
    await toLock();
    expect(
      screen.queryByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'PIN' }));
    expect(
      screen.getByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    ).toHaveAttribute('aria-checked', 'true');
    await user.type(screen.getByLabelText('Choose a PIN'), '2468');
    await user.type(screen.getByLabelText('Confirm PIN'), '2468');
    await press('Start my adventure');

    const setSecret = vi.mocked(store.getState().setSecret);
    const enableBiometric = vi.mocked(store.getState().enableBiometric);
    await vi.waitFor(() => expect(enableBiometric).toHaveBeenCalledTimes(1));
    expect(setSecret).toHaveBeenCalledWith('2468', 'pin');
    const [lockedAt] = setSecret.mock.invocationCallOrder;
    const [onboardedAt] = actions.completeOnboarding.mock.invocationCallOrder;
    const [biometricAt] = enableBiometric.mock.invocationCallOrder;
    expect(lockedAt).toBeLessThan(biometricAt ?? 0);
    // Last, once set up: it is an extra, and a failure must not stop the person finishing.
    expect(onboardedAt).toBeLessThan(biometricAt ?? 0);
  });

  it('finishes setting up, and says so plainly, when biometric unlock cannot be turned on', async () => {
    const store = createStubStore({
      biometric: 'off',
      enableBiometric: vi.fn(async () => {
        throw new Error('Failed to save data');
      }),
    });
    renderWizard({ store });
    await skipAccount();
    await toLock();
    await user.click(screen.getByRole('radio', { name: 'PIN' }));
    await user.type(screen.getByLabelText('Choose a PIN'), '2468');
    await user.type(screen.getByLabelText('Confirm PIN'), '2468');
    await press('Start my adventure');

    expect(await screen.findByRole('status')).toHaveTextContent(
      "Fingerprint or face unlock couldn't be turned on. You can try again in Settings.",
    );
    expect(store.getState().setSecret).toHaveBeenCalledWith('2468', 'pin');
    expect(actions.completeOnboarding).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Failed to save data')).not.toBeInTheDocument();
  });

  it('does not turn biometric unlock on when setting up fails, so a retry without it leaves it off', async () => {
    actions.completeOnboarding.mockRejectedValueOnce(new Error('Storage is full.'));
    const { store } = renderWizard({ store: createStubStore({ biometric: 'off' }) });
    await skipAccount();
    await toLock();
    await user.click(screen.getByRole('radio', { name: 'PIN' }));
    await user.type(screen.getByLabelText('Choose a PIN'), '2468');
    await user.type(screen.getByLabelText('Confirm PIN'), '2468');
    await press('Start my adventure');
    await vi.waitFor(() => expect(actions.completeOnboarding).toHaveBeenCalledTimes(1));
    expect(store.getState().enableBiometric).not.toHaveBeenCalled();

    await user.click(screen.getByRole('switch', { name: 'Also unlock with fingerprint or face' }));
    await press('Start my adventure');

    await vi.waitFor(() => expect(actions.completeOnboarding).toHaveBeenCalledTimes(2));
    expect(store.getState().enableBiometric).not.toHaveBeenCalled();
  });

  it('leaves biometric unlock off when switched off', async () => {
    const { store } = renderWizard({ store: createStubStore({ biometric: 'off' }) });
    await skipAccount();
    await toLock();
    await user.click(screen.getByRole('radio', { name: 'PIN' }));
    await user.click(screen.getByRole('switch', { name: 'Also unlock with fingerprint or face' }));
    await user.type(screen.getByLabelText('Choose a PIN'), '2468');
    await user.type(screen.getByLabelText('Confirm PIN'), '2468');
    await press('Start my adventure');

    await vi.waitFor(() => expect(actions.completeOnboarding).toHaveBeenCalledTimes(1));
    expect(store.getState().setSecret).toHaveBeenCalledWith('2468', 'pin');
    expect(store.getState().enableBiometric).not.toHaveBeenCalled();
  });

  it('refuses a PIN that does not match its confirmation', async () => {
    renderWizard();
    await skipAccount();
    await toLock();
    await user.click(screen.getByRole('radio', { name: 'PIN' }));
    await user.type(screen.getByLabelText('Choose a PIN'), '2468');
    await user.type(screen.getByLabelText('Confirm PIN'), '2469');
    await press('Start my adventure');
    expect(screen.getByText("Those don't match.")).toBeInTheDocument();
    expect(actions.completeOnboarding).not.toHaveBeenCalled();
  });
});

describe('the steps move', () => {
  const layerOf = (heading: string) =>
    screen.getByRole('heading', { level: 1, name: heading }).closest('[data-motion]');

  it('rises in from below on Continue, and lifts the old step away; reduced motion only fades', async () => {
    renderWizard();
    expect(layerOf('Create your account')).toHaveClass('motion-safe:animate-step-in-up');
    await skipAccount();

    const current = layerOf('Your currency and name');
    expect(current).toHaveAttribute('data-motion', 'current');
    expect(current).toHaveClass('motion-safe:animate-step-in-up', 'motion-reduce:animate-fade-in');
    expect(current?.className).not.toMatch(/(^|\s)animate-/);
    const leaving = document.querySelector('[data-motion="leaving"]');
    expect(leaving).toHaveTextContent('Create your account');
    expect(leaving).toHaveClass(
      'motion-safe:animate-step-out-up',
      'motion-reduce:animate-fade-out',
    );
    expect(leaving).toHaveAttribute('aria-hidden', 'true');
  });

  it('comes down from above on Back, and the old step leaves downward', async () => {
    renderWizard();
    await skipAccount();
    await press('Back');

    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(layerOf('Create your account')).toHaveClass(
      'motion-safe:animate-step-in-down',
      'motion-reduce:animate-fade-in',
    );
    expect(document.querySelector('[data-motion="leaving"]')).toHaveClass(
      'motion-safe:animate-step-out-down',
    );
  });

  it('moves focus to the new step so it is announced, and on the code step to the code', async () => {
    renderWizard();
    await toCode();
    // The code is what comes next: its field has the focus, heard with where the code went.
    const code = nowShowing().getByLabelText('Code');
    expect(code).toHaveFocus();
    expect(code).toHaveAccessibleDescription(CODE_LEAD);

    await press('Back');
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toHaveFocus();
    // And again when the step comes back.
    await next();
    expect(await screen.findByText('Step 2 of 4')).toBeInTheDocument();
    expect(nowShowing().getByLabelText('Code')).toHaveFocus();
  });

  it('glides the progress bar over four steps, and brings the lines in one by one', async () => {
    const { container } = renderWizard();
    const fill = () => container.querySelector<HTMLElement>('[data-progress]')!;
    expect(fill()).toHaveClass('motion-safe:transition-[width]', 'motion-safe:duration-700');
    expect(fill().style.width).toBe('0%');
    expect(layerOf('Create your account')).toHaveClass('motion-safe:stagger-lines');

    await toCode();
    expect(fill().style.width).toBe('25%');
    await enterCode();
    await screen.findByText('Step 3 of 4');
    expect(fill().style.width).toBe('50%');
    await toLock();
    expect(fill().style.width).toBe('75%');
  });
});

describe('OnboardingWizard in the glass look', () => {
  /** The hairline of the row a field sits in. */
  const rowOf = (label: string) => nowShowing().getByLabelText(label).closest('.border-b');
  const isRow = (label: string) => {
    const field = nowShowing().getByLabelText(label);
    expect(field, label).toHaveClass('text-right', 'h-11');
    lacksClasses(field, 'rounded-md', 'border-b', 'font-extrabold');
    expect(rowOf(label), label).toHaveClass('border-black/7', 'dark:border-white/8');
  };

  it('stands on the page with its still shapes', () => {
    const { container } = renderWizard();
    expect(container.querySelector('main')).toHaveClass('page-blobs');
  });

  it('has a round glass Back, a page title and a solid Continue', async () => {
    renderWizard();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('glass', 'rounded-full');
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toHaveClass(
      'text-page',
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('bg-primary');
    await toCode();
    expect(screen.getByRole('heading', { level: 1, name: 'Check your email' })).toHaveClass(
      'text-page',
    );
    expect(screen.getByRole('button', { name: 'Verify' })).toHaveClass('bg-primary');
  });

  it('has row fields on every step', async () => {
    renderWizard();
    for (const label of ['Username', 'Email', 'Password']) isRow(label);
    await skipAccount();
    for (const label of ['Currency', 'What should we call you?']) isRow(label);
    await toLock();
    await user.click(screen.getByRole('radio', { name: 'PIN' }));
    for (const label of ['Choose a PIN', 'Confirm PIN']) isRow(label);
  });

  it('has pills for the lock, the chosen one solid', async () => {
    renderWizard();
    await skipAccount();
    await toLock();
    expect(screen.getByText('No lock')).toHaveClass('bg-primary');
    expect(screen.getByText('PIN')).toHaveClass('glass');
    await user.click(screen.getByRole('radio', { name: 'PIN' }));
    expect(screen.getByText('PIN')).toHaveClass('bg-primary');
  });
});
