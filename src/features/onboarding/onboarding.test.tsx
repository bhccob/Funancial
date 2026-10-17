import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { toastStore } from '@/lib/toast';
import { AccountError } from '@/store/accountActions';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeAccount, linkedAccount, withAccount } from '@/test/fakeAccount';
import { OnboardingWizard } from './OnboardingWizard';

const actions = vi.hoisted(() => ({ completeOnboarding: vi.fn(async () => {}) }));
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
afterEach(() => vi.restoreAllMocks());

const PASSWORD = 'a long enough password';
/** The step showing now: the one that is leaving stays a moment, with fields of its own. */
const nowShowing = () => within(document.querySelector<HTMLElement>('[data-motion="current"]')!);
const next = () => userEvent.click(screen.getByRole('button', { name: 'Next' }));

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
  await userEvent.type(screen.getByLabelText('Username'), username);
  await userEvent.type(screen.getByLabelText('Email (for "forgot password")'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
}

/** Past the account step by the way a phone with no connection takes. */
async function skipAccount() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  act(() => void window.dispatchEvent(new Event('offline')));
  await userEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
}

async function fillBalances(cash = '1,000', savings = '5000') {
  await userEvent.type(screen.getByLabelText('Cash & checking'), cash);
  await userEvent.type(screen.getByLabelText('Savings'), savings);
  await next();
}

describe('the account step', () => {
  it('is the first of six, with the words the owner chose', () => {
    renderWizard();
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('So you can move to a new phone and keep everything.'),
    ).toBeInTheDocument();
    for (const label of ['Username', 'Email (for "forgot password")', 'Password']) {
      expect(screen.getByLabelText(label)).toHaveClass('border-b', 'font-extrabold');
    }
    expect(
      screen.getByText('A locked copy of your data is kept so you can move to a new phone.'),
    ).toBeInTheDocument();
    // The old first step is gone, and with it the checkbox.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Before we start')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('has no way to skip while online', () => {
    renderWizard();
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
  });

  it('offers to skip, and says why, when the phone is offline', async () => {
    const { account } = renderWizard();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(
      await screen.findByText("You're offline. Create your account later in Settings."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
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
    expect(account.signUp).not.toHaveBeenCalled();
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
  });

  it('makes the account with what was typed, then moves on to the next step', async () => {
    const { account } = renderWizard();
    await fillAccount();
    await next();
    expect(account.signUp).toHaveBeenCalledTimes(1);
    expect(account.signUp).toHaveBeenCalledWith({
      username: 'Robin',
      email: 'robin@example.com',
      password: PASSWORD,
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your currency and name' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
  });

  it('can show what was typed in the password', async () => {
    renderWizard();
    await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });

  it('shows it is working and sends one request for two taps in the same instant', async () => {
    const account = fakeAccount();
    account.signUp.mockReturnValue(new Promise(() => {}));
    renderWizard({ account });
    await fillAccount();
    const form = screen.getByLabelText('Username').closest('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(account.signUp).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(
      screen.queryByRole('heading', { name: 'Your currency and name' }),
    ).not.toBeInTheDocument();
  });

  it('puts a taken username under the username, and stays', async () => {
    const account = fakeAccount();
    account.signUp.mockRejectedValue(new AccountError('taken'));
    renderWizard({ account });
    await fillAccount();
    await next();
    const alert = await screen.findByText('That username is taken. Try another one.');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('Robin');
  });

  it.each([
    ['unavailable', "Funancial's service isn't answering right now. Try again in a moment."],
    ['busy', 'Funancial is busy right now. Try again in a moment.'],
  ] as const)(
    'shows a calm line when the service says %s, and lets the person try again',
    async (code, message) => {
      const account = fakeAccount();
      account.signUp.mockRejectedValueOnce(new AccountError(code));
      renderWizard({ account });
      await fillAccount();
      await next();
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();

      await next();
      expect(await screen.findByText('Step 2 of 6')).toBeInTheDocument();
    },
  );

  it('offers the skip too when nothing comes back, though the phone thinks it is online', async () => {
    const account = fakeAccount();
    account.signUp.mockRejectedValue(new AccountError('offline'));
    renderWizard({ account });
    await fillAccount();
    await next();
    // One offline line, the owner's words, with the way on: not a second one from the layer too.
    expect(
      await screen.findByText("You're offline. Create your account later in Settings."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Try again when you're connected/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
  });

  it('cannot be skipped while the account is being made', async () => {
    const account = fakeAccount();
    account.signUp.mockReturnValue(new Promise(() => {}));
    renderWizard({ account });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    await fillAccount();
    await next();
    expect(account.signUp).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeDisabled();
  });

  it('forgets the password when the step is skipped, and keeps the rest for a return', async () => {
    renderWizard();
    await userEvent.type(screen.getByLabelText('Username'), 'Robin');
    await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
    await skipAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Username')).toHaveValue('Robin');
  });

  describe('for someone who already has an account', () => {
    const link = () => screen.getByRole('button', { name: 'I already have an account' });

    it('offers a way to log in instead, which opens Log in and can come back to setup', async () => {
      renderWizard();
      await userEvent.type(screen.getByLabelText('Username'), 'Robin');
      await userEvent.click(link());
      expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toHaveFocus();
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
      expect(screen.queryByText('Step 1 of 6')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toHaveFocus();
      expect(nowShowing().getByLabelText('Username')).toHaveValue('Robin');
      expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    });

    it('logs in over setup, holding the app on this screen until the PIN is dealt with', async () => {
      const { account, onFinishing, store } = renderWizard();
      await userEvent.click(link());
      await userEvent.type(nowShowing().getByLabelText('Username'), 'robin');
      await userEvent.type(nowShowing().getByLabelText('Password'), PASSWORD);
      await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
      expect(account.logIn).toHaveBeenCalledWith(
        { username: 'robin', password: PASSWORD },
        { replace: false },
      );
      expect(onFinishing).toHaveBeenLastCalledWith(true);
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Lock this phone' }),
      ).toBeInTheDocument();
      await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
      await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
      await userEvent.click(screen.getByRole('button', { name: 'Set PIN' }));
      await vi.waitFor(() => expect(onFinishing).toHaveBeenLastCalledWith(false));
      expect(store.getState().setSecret).toHaveBeenCalledWith('2468', 'pin');
    });

    it('is not offered while the account is being made, or when the phone has one', async () => {
      const account = fakeAccount();
      account.signUp.mockReturnValue(new Promise(() => {}));
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

    it('waits for the phone to read its account, as Next does', () => {
      renderWizard({ account: fakeAccount(null, false) });
      expect(link()).toBeDisabled();
    });
  });

  it('does not ask again for an account the phone already has', async () => {
    const account = fakeAccount(linkedAccount());
    renderWizard({ account });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your account is ready' }),
    ).toBeInTheDocument();
    expect(screen.getByText("You're signed in as robin.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
    await next();
    expect(account.signUp).not.toHaveBeenCalled();
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
  });

  it('waits for the phone to read whether it has an account', () => {
    renderWizard({ account: fakeAccount(null, false) });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});

describe('OnboardingWizard', () => {
  it('keeps what was entered on a step when the person goes back to it', async () => {
    renderWizard();
    await skipAccount();
    await userEvent.selectOptions(screen.getByLabelText('Currency'), 'GBP');
    await userEvent.type(screen.getByLabelText('What should we call you?'), 'Sam');
    await next();
    await userEvent.type(screen.getByLabelText('Cash & checking'), '250');
    await userEvent.type(screen.getByLabelText('Savings'), '900');
    await next();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Cash & checking')).toHaveValue('250.00');
    expect(screen.getByLabelText('Savings')).toHaveValue('900.00');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Currency')).toHaveValue('GBP');
    expect(screen.getByLabelText('What should we call you?')).toHaveValue('Sam');
  });

  it("starts on the currency of the phone's region, and the person can still pick another", async () => {
    phoneIn('Europe/Amsterdam');
    renderWizard();
    await skipAccount();
    expect(screen.getByLabelText('Currency')).toHaveValue('EUR');

    await userEvent.selectOptions(screen.getByLabelText('Currency'), 'GBP');
    expect(screen.getByLabelText('Currency')).toHaveValue('GBP');
  });

  it('starts on the language region when the time zone is not one it knows', async () => {
    phoneIn('Mars/Olympus', 'nl-NL');
    renderWizard();
    await skipAccount();
    expect(screen.getByLabelText('Currency')).toHaveValue('EUR');
  });

  it('collects everything, finishes with a PIN, and says the person is all set', async () => {
    const { store, onFinishing, account } = renderWizard();
    await fillAccount();
    await next();
    expect(await screen.findByText('Step 2 of 6')).toBeInTheDocument();
    expect(account.signUp).toHaveBeenCalledTimes(1);

    expect(screen.getByLabelText('Currency')).toHaveValue('USD');
    await userEvent.type(screen.getByLabelText('What should we call you?'), 'Sam');
    await next();

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await fillBalances();

    expect(screen.getByRole('heading', { level: 1, name: 'Your salary' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Monthly take-home pay'), '4200');
    expect(screen.getByLabelText('Pay day')).toHaveValue('25');
    await next();

    expect(screen.getByRole('heading', { level: 1, name: 'Credit cards' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    await userEvent.type(screen.getByLabelText('Card name'), 'Visa');
    await userEvent.type(screen.getByLabelText('Current balance'), '230');
    await userEvent.selectOptions(screen.getByLabelText('Due day'), '21');
    expect(screen.getByRole('switch', { name: 'I pay it in full each month' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save card' }));
    expect(screen.getByText('Visa')).toBeInTheDocument();
    await next();

    expect(screen.getByText('Step 6 of 6')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    // A device without fingerprint or face (and the web) is not offered it.
    expect(
      screen.queryByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    ).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: "You're all set, Sam" }),
    ).toBeInTheDocument();
    expect(actions.completeOnboarding).toHaveBeenCalledWith({
      name: 'Sam',
      currency: 'USD',
      openingCash: 100000,
      openingSavings: 500000,
      salary: { monthlyAmount: 420000, payDay: 25 },
      cards: [{ name: 'Visa', balance: 23000, creditLimit: null, dueDay: 21, payInFull: true }],
    });
    const setSecret = vi.mocked(store.getState().setSecret);
    expect(setSecret).toHaveBeenCalledWith('2468', 'pin');
    // The lock is in place before the profile flips the app to the Dashboard.
    const [onboardedAt] = actions.completeOnboarding.mock.invocationCallOrder;
    const [lockedAt] = setSecret.mock.invocationCallOrder;
    expect(lockedAt).toBeLessThan(onboardedAt ?? 0);
    expect(store.getState().enableBiometric).not.toHaveBeenCalled();

    // The app is held on this screen while it shows the last step, and let go by Open Funancial.
    expect(onFinishing).toHaveBeenLastCalledWith(true);
    expect(onFinishing).not.toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Open Funancial' }));
    expect(onFinishing).toHaveBeenLastCalledWith(false);
  });

  it('says only that the person is all set when they gave no name', async () => {
    renderWizard();
    await skipAccount();
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: "You're all set" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/your first quest is waiting/)).toBeInTheDocument();
  });

  it('stays on the last step, and lets go of the app, when setting up fails', async () => {
    actions.completeOnboarding.mockRejectedValueOnce(new Error('Storage is full.'));
    const { onFinishing } = renderWizard();
    await skipAccount();
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is full.');
    expect(screen.queryByRole('heading', { name: /all set/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start my adventure' })).toBeEnabled();
    expect(onFinishing).toHaveBeenLastCalledWith(false);
  });

  it('sends no salary when there is no regular salary, and no secret without a lock', async () => {
    const { store } = renderWizard();
    await skipAccount();
    await next();
    await fillBalances('0', '0');

    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    expect(screen.queryByLabelText('Monthly take-home pay')).not.toBeInTheDocument();
    await next();
    await next();
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));

    expect(actions.completeOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ salary: null, cards: [], openingCash: 0, openingSavings: 0 }),
    );
    expect(store.getState().setSecret).not.toHaveBeenCalled();
  });

  it('turns on biometric unlock after setting the PIN', async () => {
    const { store } = renderWizard({ store: createStubStore({ biometric: 'off' }) });
    await skipAccount();
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    expect(
      screen.queryByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    expect(
      screen.getByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    ).toHaveAttribute('aria-checked', 'true');
    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));

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
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));

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
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));
    await vi.waitFor(() => expect(actions.completeOnboarding).toHaveBeenCalledTimes(1));
    expect(store.getState().enableBiometric).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));

    await vi.waitFor(() => expect(actions.completeOnboarding).toHaveBeenCalledTimes(2));
    expect(store.getState().enableBiometric).not.toHaveBeenCalled();
  });

  it('leaves biometric unlock off when switched off', async () => {
    const { store } = renderWizard({ store: createStubStore({ biometric: 'off' }) });
    await skipAccount();
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    await userEvent.click(
      screen.getByRole('switch', { name: 'Also unlock with fingerprint or face' }),
    );
    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));

    await vi.waitFor(() => expect(actions.completeOnboarding).toHaveBeenCalledTimes(1));
    expect(store.getState().setSecret).toHaveBeenCalledWith('2468', 'pin');
    expect(store.getState().enableBiometric).not.toHaveBeenCalled();
  });

  it('refuses a PIN that does not match its confirmation', async () => {
    renderWizard();
    await skipAccount();
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2469');
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));
    expect(screen.getByText("Those don't match.")).toBeInTheDocument();
    expect(actions.completeOnboarding).not.toHaveBeenCalled();
  });
});

describe('the steps move', () => {
  const layerOf = (heading: string) =>
    screen.getByRole('heading', { level: 1, name: heading }).closest('[data-motion]');

  it('rises in from below on Next, and lifts the old step away; reduced motion only fades', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    expect(layerOf('Create your account')).toHaveClass(
      'motion-safe:animate-step-in-down',
      'motion-reduce:animate-fade-in',
    );
    expect(document.querySelector('[data-motion="leaving"]')).toHaveClass(
      'motion-safe:animate-step-out-down',
    );
  });

  it('moves focus to the new step so it is announced', async () => {
    renderWizard();
    await skipAccount();
    expect(screen.getByRole('heading', { level: 1, name: 'Your currency and name' })).toHaveFocus();
  });

  it('glides the progress bar, shifts the colours with each step, and brings the lines in one by one', async () => {
    const { container } = renderWizard();
    const fill = () => container.querySelector<HTMLElement>('[data-progress]')!;
    const blobs = () =>
      [...container.querySelectorAll('[data-blob]')].map((b) => b.getAttribute('style'));
    expect(fill()).toHaveClass('motion-safe:transition-[width]', 'motion-safe:duration-700');
    expect(fill().style.width).toBe('0%');
    const first = blobs();
    expect(layerOf('Create your account')).toHaveClass('motion-safe:stagger-lines');

    await skipAccount();
    expect(fill().style.width).toBe('16.7%');
    expect(blobs()).not.toEqual(first);
  });
});

describe('OnboardingWizard in the line style', () => {
  const isLine = (el: HTMLElement, label: string) => {
    expect(el, label).toHaveClass('border-b', 'font-extrabold');
    expect(el, label).not.toHaveClass('rounded-md');
  };

  it('has line fields on every step', async () => {
    renderWizard();
    await skipAccount();
    for (const label of ['Currency', 'What should we call you?']) {
      isLine(screen.getByLabelText(label), label);
    }
    await next();
    for (const label of ['Cash & checking', 'Savings']) {
      isLine(screen.getByLabelText(label), label);
    }
    await fillBalances('0', '0');
    for (const label of ['Monthly take-home pay', 'Pay day']) {
      isLine(screen.getByLabelText(label), label);
    }
  });

  it('has line fields in the card form', async () => {
    renderWizard();
    await skipAccount();
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await userEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    for (const label of ['Card name', 'Current balance', 'Credit limit', 'Due day']) {
      isLine(screen.getByLabelText(label), label);
    }
  });

  it('has underline tabs for the lock, with line fields under them', async () => {
    renderWizard();
    await skipAccount();
    await next();
    await fillBalances('0', '0');
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    expect(screen.getByText('No lock')).toHaveClass('border-b-2', 'border-text');
    expect(screen.getByText('PIN')).toHaveClass('border-transparent');
    expect(screen.getByText('No lock').closest('div')).not.toHaveClass('bg-surface-2');
    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    for (const label of ['Choose a PIN', 'Confirm PIN']) {
      isLine(screen.getByLabelText(label), label);
    }
  });
});
