import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeAccount, withAccount } from '@/test/fakeAccount';
import { WelcomeScreen } from './WelcomeScreen';

const choice = (name: string) => screen.getByRole('button', { name });

function show(store = createStubStore({ phase: 'welcome' }), onHold = vi.fn()) {
  const actions = fakeAccount();
  renderWithStore(
    withAccount(
      actions,
      <>
        <WelcomeScreen onHold={onHold} />
        <Toaster />
      </>,
    ),
    store,
  );
  return { store, actions, onHold };
}

it('introduces the app and its promise, in the words the owner chose', () => {
  show();
  expect(screen.getByRole('heading', { level: 1, name: 'Funancial' })).toBeInTheDocument();
  expect(screen.getByText('Level up your real financial life.')).toBeInTheDocument();
  expect(
    screen.getByText("Funancial helps you track and plan your money. It isn't financial advice."),
  ).toBeInTheDocument();
});

it('offers three choices, and the old first step of setup is gone', () => {
  show();
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Create an account',
    'I have an account',
    'Try with demo money',
  ]);
  expect(screen.queryByRole('button', { name: 'Start with my real data' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByText('Before we start')).not.toBeInTheDocument();
});

it('puts the choices where a thumb reaches, 44px or more tall, with the demo the quietest', () => {
  show();
  expect(choice('Create an account')).toHaveClass('h-14');
  expect(choice('I have an account')).toHaveClass('h-14');
  expect(choice('Try with demo money')).toHaveClass('h-11');
  expect(choice('Try with demo money')).not.toHaveClass('bg-primary', 'border');
});

it('has colour shapes behind it, which are decoration', () => {
  const { container } = renderWithStore(<WelcomeScreen />, createStubStore({ phase: 'welcome' }));
  expect(container.querySelectorAll('[data-blob]').length).toBeGreaterThanOrEqual(2);
  expect(container.querySelector('[data-blob]')?.closest('[aria-hidden="true"]')).not.toBeNull();
});

it('brings the choices in with the same rise as setup', () => {
  show();
  const layer = screen.getByRole('heading', { name: 'Funancial' }).closest('[data-motion]');
  expect(layer).toHaveClass('motion-safe:animate-step-in-up', 'motion-reduce:animate-fade-in');
});

it('starts setup, at its account step, with Create an account', async () => {
  const { store } = show();
  await userEvent.click(choice('Create an account'));
  expect(store.getState().startFresh).toHaveBeenCalledTimes(1);
  expect(store.getState().startDemo).not.toHaveBeenCalled();
});

it('starts demo mode, as it always did', async () => {
  const { store } = show();
  await userEvent.click(choice('Try with demo money'));
  expect(store.getState().startDemo).toHaveBeenCalledTimes(1);
  expect(store.getState().startFresh).not.toHaveBeenCalled();
});

it('opens Log in with I have an account, without making anything on the phone', async () => {
  const { store } = show();
  await userEvent.click(choice('I have an account'));
  expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
  expect(store.getState().startFresh).not.toHaveBeenCalled();
  const layer = screen.getByRole('heading', { name: 'Log in' }).closest('[data-motion]');
  expect(layer).toHaveClass('motion-safe:animate-step-in-up');

  // The arrow returns to the three choices, the step coming down from above.
  await userEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Funancial' })).toBeInTheDocument();
  expect(choice('Create an account')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Funancial' }).closest('[data-motion]')).toHaveClass(
    'motion-safe:animate-step-in-down',
  );
});

it('opens Forgot password from Log in, and returns to Log in', async () => {
  show();
  await userEvent.click(choice('I have an account'));
  await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Forgot password?' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
});

it('tells the app to hold this screen while a log-in moves the phone on', async () => {
  const { actions, onHold } = show();
  actions.logIn.mockResolvedValue('done');
  await userEvent.click(choice('I have an account'));
  await userEvent.type(screen.getByLabelText('Username'), 'robin');
  await userEvent.type(screen.getByLabelText('Password'), 'a long enough password');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
  expect(onHold).toHaveBeenCalledWith(true);
  expect(await screen.findByRole('heading', { name: 'Lock this phone' })).toBeInTheDocument();
});

it('tells the user when starting fails instead of doing nothing', async () => {
  const store = createStubStore({
    phase: 'welcome',
    startFresh: vi.fn(async () => {
      throw new Error('This browser blocks encryption here.');
    }),
  });
  show(store);
  await userEvent.click(choice('Create an account'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This browser blocks encryption here.',
  );
  expect(choice('Create an account')).toBeEnabled();
});

it('does not start twice while it is starting', async () => {
  const store = createStubStore({
    phase: 'welcome',
    startFresh: vi.fn(() => new Promise<void>(() => {})),
  });
  show(store);
  await userEvent.click(choice('Create an account'));
  expect(choice('Create an account')).toBeDisabled();
  expect(choice('I have an account')).toBeDisabled();
  expect(choice('Try with demo money')).toBeDisabled();
});
