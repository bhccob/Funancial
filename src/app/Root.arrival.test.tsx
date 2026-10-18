import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySnapshot } from '@/domain/snapshot';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeAccount, linkedAccount, withAccount } from '@/test/fakeAccount';
import { makeProfile } from '@/test/fixtures';
import { Root } from './Root';

afterEach(() => vi.restoreAllMocks());

/** Data for someone who finished onboarding. */
function onboarded() {
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile({ onboardedAt: '2026-10-01T09:00:00.000Z', name: 'Sam' }));
  return data;
}

/** The screen showing now: the one that is leaving stays a moment, with fields of its own. */
const nowShowing = () => within(document.querySelector<HTMLElement>('[data-motion="current"]')!);
const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('after Log in', () => {
  it('keeps the log-in on screen while the phone moves on, asks for a PIN, then shows Home', async () => {
    const account = fakeAccount();
    const store = createStubStore({ phase: 'welcome' });
    // What the real account layer does: the vault is made (the app is "unlocked" with nothing in it),
    // then the account's copy is restored, then it is done.
    account.logIn.mockImplementation(async () => {
      store.setState({ phase: 'unlocked' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      store.setState({ data: onboarded() });
      return 'done';
    });
    renderWithStore(withAccount(account, <Root />), store);

    await userEvent.click(screen.getByRole('button', { name: 'I have an account' }));
    await userEvent.type(screen.getByLabelText('Username'), 'robin');
    await userEvent.type(screen.getByLabelText('Password'), 'a long enough password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    // Between the new vault and the restored copy the person would see a blank setup: they do not.
    expect(screen.queryByRole('heading', { name: 'Create your account' })).not.toBeInTheDocument();
    expect(await heading('Lock this phone')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create your account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Home' })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(screen.getByRole('button', { name: 'Set PIN' }));
    expect(store.getState().setSecret).toHaveBeenCalledWith('2468', 'pin');
    expect(await heading('Home')).toBeInTheDocument();
  });

  it('shows Home after skipping the lock too', async () => {
    const account = fakeAccount();
    const store = createStubStore({ phase: 'welcome' });
    account.logIn.mockImplementation(async () => {
      store.setState({ phase: 'unlocked', data: onboarded() });
      return 'done';
    });
    renderWithStore(withAccount(account, <Root />), store);
    await userEvent.click(screen.getByRole('button', { name: 'I have an account' }));
    await userEvent.type(screen.getByLabelText('Username'), 'robin');
    await userEvent.type(screen.getByLabelText('Password'), 'a long enough password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Skip the lock' }));
    expect(await heading('Home')).toBeInTheDocument();
  });

  it('goes on to setup when the account had no copy yet, with its account already made', async () => {
    const account = fakeAccount();
    const store = createStubStore({ phase: 'welcome' });
    account.logIn.mockImplementation(async () => {
      store.setState({ phase: 'unlocked' });
      return 'done';
    });
    renderWithStore(withAccount(account, <Root />), store);
    await userEvent.click(screen.getByRole('button', { name: 'I have an account' }));
    await userEvent.type(screen.getByLabelText('Username'), 'robin');
    await userEvent.type(screen.getByLabelText('Password'), 'a long enough password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Skip the lock' }));
    expect(await heading('Create your account')).toBeInTheDocument();
  });

  it("logs in from setup's first step, with the restored data and the PIN prompt, then Home", async () => {
    const account = fakeAccount();
    const store = createStubStore({ phase: 'unlocked', namespace: 'real' });
    // Setup's vault already exists: the copy is restored into it, and the profile it brings ends setup.
    account.logIn.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      store.setState({ data: onboarded() });
      return 'done';
    });
    renderWithStore(withAccount(account, <Root />), store);

    expect(await heading('Create your account')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    await userEvent.type(nowShowing().getByLabelText('Username'), 'robin');
    await userEvent.type(nowShowing().getByLabelText('Password'), 'a long enough password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    // The profile has arrived, which alone would have switched to Home: the PIN comes first.
    expect(await heading('Lock this phone')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Home' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Choose a PIN'), '2468');
    await userEvent.type(screen.getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(screen.getByRole('button', { name: 'Set PIN' }));
    expect(store.getState().setSecret).toHaveBeenCalledWith('2468', 'pin');
    expect(await heading('Home')).toBeInTheDocument();
  });

  it('goes back to setup, with the account made, when that account had no copy yet', async () => {
    const account = fakeAccount();
    const store = createStubStore({ phase: 'unlocked', namespace: 'real' });
    account.logIn.mockImplementation(async () => {
      account.view.setState({ state: linkedAccount() });
      return 'done';
    });
    renderWithStore(withAccount(account, <Root />), store);
    await userEvent.click(await screen.findByRole('button', { name: 'I already have an account' }));
    await userEvent.type(nowShowing().getByLabelText('Username'), 'robin');
    await userEvent.type(nowShowing().getByLabelText('Password'), 'a long enough password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Skip the lock' }));
    expect(await heading('Your account is ready')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
  });

  it('lets go of the app when the person goes back, so a later start is not held', async () => {
    const store = createStubStore({ phase: 'welcome' });
    renderWithStore(withAccount(fakeAccount(), <Root />), store);
    await userEvent.click(screen.getByRole('button', { name: 'I have an account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    act(() => store.setState({ phase: 'unlocked' }));
    expect(await heading('Create your account')).toBeInTheDocument();
  });
});

describe('at the end of setup', () => {
  it('shows "You\'re all set" after the profile is saved, and Home only once the person opens Funcial', async () => {
    const store = createStubStore({
      phase: 'unlocked',
      namespace: 'real',
      putMany: vi.fn(async () => {
        store.setState({ data: onboarded() });
      }),
    });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderWithStore(withAccount(fakeAccount(), <Root />), store);

    await userEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    const next = () => userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.type(screen.getByLabelText('What should we call you?'), 'Sam');
    await next();
    await userEvent.type(screen.getByLabelText('Cash & checking'), '0');
    await userEvent.type(screen.getByLabelText('Savings'), '0');
    await next();
    await userEvent.click(screen.getByRole('switch', { name: "I don't have a regular salary" }));
    await next();
    await next();
    await userEvent.click(screen.getByRole('button', { name: 'Start my adventure' }));

    // The profile is saved, which alone would have switched to Home.
    expect(await heading("You're all set, Sam")).toBeInTheDocument();
    expect(store.getState().putMany).toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Home' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open Funcial' }));
    expect(await heading('Home')).toBeInTheDocument();
  });
});
