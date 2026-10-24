import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeAccount, withAccount } from '@/test/fakeAccount';
import { lacksClasses } from '@/test/classes';
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
  expect(screen.getByRole('heading', { level: 1, name: 'Funcial' })).toBeInTheDocument();
  expect(screen.getByText('Level up your real financial life.')).toBeInTheDocument();
  expect(
    screen.getByText("Funcial helps you track and plan your money. It isn't financial advice."),
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
  expect(choice('Create an account')).toHaveClass('h-14', 'bg-primary');
  expect(choice('I have an account')).toHaveClass('h-14', 'glass');
  // 0.13's R4: the demo is the quiet text button, not a glass pill.
  expect(choice('Try with demo money')).toHaveClass('min-h-11', 'underline');
  lacksClasses(
    choice('Try with demo money'),
    'glass',
    'bg-primary',
    'border',
    'rounded-full',
    'h-11',
  );
});

it('stands the name on the theme block, and the choices on the page', () => {
  show();
  const name = screen.getByRole('heading', { level: 1, name: 'Funcial' });
  const block = name.closest<HTMLElement>('[data-head-block]');
  expect(block).toHaveClass('bg-head', 'rounded-b-hero');
  expect(block).toContainElement(screen.getByText('Level up your real financial life.'));
  // The actions and the line under them are on the page, where a thumb reaches, not on the block.
  for (const choiceName of ['Create an account', 'I have an account', 'Try with demo money']) {
    expect(block, choiceName).not.toContainElement(choice(choiceName));
  }
  expect(block).not.toContainElement(
    screen.getByText("Funcial helps you track and plan your money. It isn't financial advice."),
  );
  // The block runs out to the screen's edges, not just the column the choices stand in, and keeps the
  // compact room under its name: its own classes, with none of the screen's to fight them.
  expect(block).toHaveClass('mx-[calc(50%-50vw)]', 'pb-[22px]');
  lacksClasses(block, '-mx-5', 'px-5', 'pb-[60px]', 'pb-12', 'px-[22px]');
});

it("draws the block's words in its own ink: no colour of the page lands on the name or the tagline", () => {
  show();
  const block = screen
    .getByRole('heading', { level: 1, name: 'Funcial' })
    .closest<HTMLElement>('[data-head-block]')!;
  // The accent is as dark as the block in Black & White, the danger red falls under 4.5:1 on a dark
  // one: axe cannot judge text over the block's gradient, so nothing but this would notice them.
  const page =
    /(^|\s)(text-(accent|accent-text|primary|danger|success|warning|xp-text)|bg-primary)(\s|$)/;
  for (const el of [block, ...block.querySelectorAll('*')]) {
    expect(el.getAttribute('class') ?? '', el.outerHTML.slice(0, 80)).not.toMatch(page);
  }
  // The name's second half is dimmed in the block's own dim ink, which holds 4.5:1 on every block.
  expect(screen.getByText('cial')).toHaveClass('text-head-dim');
});

it('stands on the page with its still shapes', () => {
  const { container } = renderWithStore(<WelcomeScreen />, createStubStore({ phase: 'welcome' }));
  expect(container.querySelector('main')).toHaveClass('page-blobs');
});

it('keeps Log in and Forgot password on the light page, off the block', async () => {
  show();
  await userEvent.click(choice('I have an account'));
  const login = screen.getByRole('heading', { level: 1, name: 'Log in' });
  expect(login.closest('[data-head-block]')).toBeNull();
  expect(login).toHaveClass('text-page');
  expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('glass', 'rounded-full');
  expect(screen.getByRole('button', { name: 'Log in' })).toHaveClass('bg-primary');
  await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  const forgot = screen.getByRole('heading', { level: 1, name: 'Forgot password?' });
  expect(forgot.closest('[data-head-block]')).toBeNull();
  expect(forgot).toHaveClass('text-page');
  expect(screen.getByLabelText('Username or email')).toHaveClass('text-right', 'h-11');
});

it('brings the choices in with the same rise as setup', () => {
  show();
  const layer = screen.getByRole('heading', { name: 'Funcial' }).closest('[data-motion]');
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
  // A screen reader is told about the new screen.
  expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toHaveFocus();

  // The arrow returns to the three choices, the step coming down from above.
  await userEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Funcial' })).toBeInTheDocument();
  expect(choice('Create an account')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Funcial' })).toHaveFocus();
  expect(screen.getByRole('heading', { name: 'Funcial' }).closest('[data-motion]')).toHaveClass(
    'motion-safe:animate-step-in-down',
  );
});

it('opens Forgot password from Log in, and returns to Log in', async () => {
  show();
  await userEvent.click(choice('I have an account'));
  await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Forgot password?' })).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toHaveFocus();
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
