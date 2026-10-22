import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { topDialog } from '@/lib/dialogStack';
import { toast, toastStore } from '@/lib/toast';
import { handleBack } from '@/platform/back';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeAccount, makeExpense, makeLimit, makeProfile, makeSettings } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { appRouteObjects } from './router';

/** The app at `path`, with the Toaster beside it as Root has it. */
function renderAt(path: string, store = createStubStore()) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: [path] });
  renderWithStore(
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>,
    store,
  );
  return router;
}

const bar = () => screen.getByRole('navigation', { name: 'Primary' });
/** The ＋: "Add" while the fan is shut, "Close" while it is open. */
const plus = () => within(bar()).getByRole('button', { name: /^(Add|Close)$/ });
const fan = () => screen.queryByRole('dialog', { name: 'Add' });
const sheet = (name: string) => screen.queryByRole('dialog', { name });

/** What the Android back gesture is handed: the dialog stack, and spies for going back and out. */
const backEnv = () => ({ topDialog, back: vi.fn(), minimize: vi.fn() });
/** One press of the back gesture, as the shell makes it. */
function pressBack(env: ReturnType<typeof backEnv>) {
  let result: ReturnType<typeof handleBack> | undefined;
  act(() => {
    result = handleBack(true, env);
  });
  return result;
}

async function openFan() {
  await userEvent.click(plus());
  return screen.getByRole('dialog', { name: 'Add' });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  toastStore.setState({ toasts: [] });
});

describe('tab bar', () => {
  it('reads Home, Cards, Add, Spending, Invest, and shows the current tab with its label', () => {
    renderAt('/budget');
    const slots = [...bar().querySelectorAll('a, button')];
    expect(slots).toHaveLength(5);
    ['Home', 'Cards', 'Add', 'Spending', 'Invest'].forEach((name, i) =>
      expect(slots[i]).toHaveAccessibleName(name),
    );

    const link = (name: string) => within(bar()).getByRole('link', { name });
    expect(link('Home')).toHaveAttribute('href', '/');
    expect(link('Cards')).toHaveAttribute('href', '/subscriptions');
    expect(link('Spending')).toHaveAttribute('href', '/budget');
    expect(link('Invest')).toHaveAttribute('href', '/invest');

    expect(link('Spending')).toHaveAttribute('aria-current', 'page');
    expect(link('Home')).not.toHaveAttribute('aria-current');
    // The current tab draws its label in the ink pill; the others say it to a screen reader only.
    expect(within(link('Spending')).getByText('Spending')).not.toHaveClass('sr-only');
    expect(within(link('Home')).getByText('Home')).toHaveClass('sr-only');
    expect(link('Spending')).toHaveClass('flex-[2.2]');
    expect(link('Home')).toHaveClass('flex-1');
  });

  it('marks Home only on Home itself', () => {
    renderAt('/');
    expect(within(bar()).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(bar())
        .getAllByRole('link')
        .filter((a) => a.hasAttribute('aria-current')),
    ).toHaveLength(1);
  });

  it('goes to the tab tapped', async () => {
    const router = renderAt('/');
    await userEvent.click(within(bar()).getByRole('link', { name: 'Cards' }));
    expect(router.state.location.pathname).toBe('/subscriptions');
    expect(within(bar()).getByRole('link', { name: 'Cards' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('the ＋ fan', () => {
  it('opens from the ＋, which then reads Close, with focus on Expense', async () => {
    renderAt('/');
    expect(plus()).toHaveAccessibleName('Add');
    expect(plus()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(plus()).toHaveAttribute('aria-expanded', 'false');
    expect(fan()).not.toBeInTheDocument();

    const open = await openFan();
    expect(plus()).toHaveAttribute('aria-expanded', 'true');
    expect(plus()).toHaveAccessibleName('Close');
    // The ＋ turns into an ×.
    expect(plus().querySelector('svg')).toHaveClass('rotate-[135deg]');
    const expense = within(open).getByRole('button', { name: 'Expense' });
    expect(within(open).getByRole('button', { name: 'Income' })).toBeInTheDocument();
    expect(expense).toHaveFocus();
    // Shown, not modal: the bar stays usable above the scrim, and the page under it is inert.
    expect(open).toHaveAttribute('open');
    expect(topDialog()).toBe(open);
    expect(screen.getByRole('main')).toHaveAttribute('inert');
  });

  it('closes on Escape and puts focus back on the ＋', async () => {
    renderAt('/');
    await openFan();
    await userEvent.keyboard('{Escape}');
    expect(fan()).not.toBeInTheDocument();
    expect(plus()).toHaveAccessibleName('Add');
    expect(plus()).toHaveAttribute('aria-expanded', 'false');
    expect(plus()).toHaveFocus();
    expect(topDialog()).toBeNull();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  });

  it('closes when the ＋, now the ×, is tapped again', async () => {
    renderAt('/');
    await openFan();
    await userEvent.click(plus());
    expect(fan()).not.toBeInTheDocument();
    expect(plus()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on a tap on the scrim', async () => {
    renderAt('/');
    await openFan();
    const scrim = document.querySelector<HTMLElement>('[data-fan-scrim]')!;
    expect(scrim).toHaveClass('bg-scrim');
    await userEvent.click(scrim);
    expect(fan()).not.toBeInTheDocument();
    expect(plus()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when a tab is tapped, and opens that tab', async () => {
    const router = renderAt('/');
    await openFan();
    await userEvent.click(within(bar()).getByRole('link', { name: 'Invest' }));
    expect(router.state.location.pathname).toBe('/invest');
    expect(fan()).not.toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  });

  it('keeps a toast out of the fan and above its bubbles, which stay tappable', async () => {
    toastStore.setState({ toasts: [] });
    renderAt('/');
    act(() => toast('success', 'Expense saved.'));
    const region = screen.getByText('Expense saved.').closest('[aria-live]')!;
    // Just above the tab bar while the fan is shut.
    expect(region).toHaveClass('bottom-[calc(100px+env(safe-area-inset-bottom))]');

    const open = await openFan();
    const saved = screen.getByText('Expense saved.');
    // Not inside the fan (only a modal dialog takes the toasts in), and lifted clear of the
    // bubbles, which reach 196px up from the bottom edge.
    expect(open).not.toContainElement(saved);
    expect(saved.closest('[aria-live]')).toHaveClass(
      'bottom-[calc(208px+env(safe-area-inset-bottom))]',
      'md:bottom-8',
    );
    expect(open).toHaveClass('bottom-[calc(104px+env(safe-area-inset-bottom))]');

    await userEvent.click(within(open).getByRole('button', { name: 'Income' }));
    const adding = sheet('Add income')!;
    expect(adding).toBeInTheDocument();
    // Over a modal sheet the toast goes inside it, as before, where the page is inert.
    expect(adding).toContainElement(screen.getByText('Expense saved.'));
  });

  it('puts the toasts back just above the tab bar once the fan closes', async () => {
    toastStore.setState({ toasts: [] });
    renderAt('/');
    await openFan();
    await userEvent.keyboard('{Escape}');
    act(() => toast('success', 'Expense saved.'));
    expect(screen.getByText('Expense saved.').closest('[aria-live]')).toHaveClass(
      'bottom-[calc(100px+env(safe-area-inset-bottom))]',
    );
  });

  it('back closes the fan before leaving the screen', async () => {
    renderAt('/');
    await openFan();
    const env = backEnv();

    expect(pressBack(env)).toBe('dialog');
    expect(fan()).not.toBeInTheDocument();
    expect(plus()).toHaveAttribute('aria-expanded', 'false');
    expect(env.back).not.toHaveBeenCalled();

    expect(pressBack(env)).toBe('back');
    expect(env.back).toHaveBeenCalledTimes(1);
  });

  it('opens Add expense from Expense, on the Amount, with the fan shut; back closes the sheet only', async () => {
    renderAt('/');
    const open = await openFan();
    await userEvent.click(within(open).getByRole('button', { name: 'Expense' }));

    const adding = sheet('Add expense')!;
    expect(adding).toBeInTheDocument();
    expect(within(adding).getByRole('heading', { level: 2, name: 'Add expense' })).toHaveClass(
      'text-section',
    );
    expect(within(adding).getByLabelText('Amount')).toHaveFocus();
    expect(fan()).not.toBeInTheDocument();
    expect(plus()).toHaveAttribute('aria-expanded', 'false');
    expect(topDialog()).toBe(adding);

    const env = backEnv();
    expect(pressBack(env)).toBe('dialog');
    expect(sheet('Add expense')).not.toBeInTheDocument();
    expect(fan()).not.toBeInTheDocument();
    expect(env.back).not.toHaveBeenCalled();
    expect(pressBack(env)).toBe('back');
  });

  it('opens Add income from Income', async () => {
    renderAt('/');
    const open = await openFan();
    await userEvent.click(within(open).getByRole('button', { name: 'Income' }));
    const adding = sheet('Add income')!;
    expect(adding).toBeInTheDocument();
    expect(within(adding).getByLabelText('Amount')).toHaveFocus();
    expect(fan()).not.toBeInTheDocument();
    expect(sheet('Add expense')).not.toBeInTheDocument();
  });

  it('closes the add sheet with its Cancel', async () => {
    renderAt('/');
    await userEvent.click(within(await openFan()).getByRole('button', { name: 'Expense' }));
    await userEvent.click(within(sheet('Add expense')!).getByRole('button', { name: 'Cancel' }));
    expect(sheet('Add expense')).not.toBeInTheDocument();
    expect(topDialog()).toBeNull();
  });

  it('an expense from the fan on Invest crosses a limit and stays on Invest', async () => {
    // No price service: the Invest screen asks the network for nothing.
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
    toastStore.setState({ toasts: [] });
    const { store } = await freshRealStore();
    // Strict asks before going over. Food is at 95.00 of its 100.00 for October.
    await store.getState().putMany([
      { table: 'profile', record: makeProfile({ openingDate: '2026-10-01' }) },
      { table: 'settings', record: makeSettings({ warningTone: 'strict' }) },
      { table: 'account', record: makeAccount({ openingDate: '2026-10-01' }) },
      {
        table: 'budgetLimit',
        record: makeLimit({ category: 'food', period: 'monthly', amount: 100_00 }),
      },
      {
        table: 'expense',
        record: makeExpense({ category: 'food', amount: 95_00, date: '2026-10-10' }),
      },
    ]);
    const router = renderAt('/invest', store);
    expect(screen.getByRole('heading', { level: 1, name: 'Invest' })).toBeInTheDocument();

    await userEvent.click(within(await openFan()).getByRole('button', { name: 'Expense' }));
    const adding = sheet('Add expense')!;
    await userEvent.type(within(adding).getByLabelText('Amount'), '10');
    await userEvent.click(within(adding).getByRole('button', { name: 'Save' }));

    // The limit question opens over the sheet, which stays open under it.
    const ask = await screen.findByRole('dialog', { name: 'Over your limit?' });
    expect(sheet('Add expense')).toBeInTheDocument();
    expect(topDialog()).toBe(ask);

    await userEvent.click(within(ask).getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(sheet('Add expense')).not.toBeInTheDocument());
    expect(sheet('Over your limit?')).not.toBeInTheDocument();
    expect(topDialog()).toBeNull();
    expect(router.state.location.pathname).toBe('/invest');
    expect(screen.getByRole('heading', { level: 1, name: 'Invest' })).toBeInTheDocument();
    expect(
      store
        .getState()
        .data.tables.expense.map((e) => e.amount)
        .sort(),
    ).toEqual([10_00, 95_00]);
  });

  it('back closes the limit question first, then the sheet, then leaves', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
    const { store } = await freshRealStore();
    await store.getState().putMany([
      { table: 'profile', record: makeProfile({ openingDate: '2026-10-01' }) },
      { table: 'settings', record: makeSettings({ warningTone: 'strict' }) },
      { table: 'account', record: makeAccount({ openingDate: '2026-10-01' }) },
      {
        table: 'budgetLimit',
        record: makeLimit({ category: 'food', period: 'monthly', amount: 100_00 }),
      },
    ]);
    renderAt('/invest', store);
    await userEvent.click(within(await openFan()).getByRole('button', { name: 'Expense' }));
    const adding = sheet('Add expense')!;
    await userEvent.type(within(adding).getByLabelText('Amount'), '150');
    await userEvent.click(within(adding).getByRole('button', { name: 'Save' }));
    await screen.findByRole('dialog', { name: 'Over your limit?' });

    const env = backEnv();
    expect(pressBack(env)).toBe('dialog');
    expect(sheet('Over your limit?')).not.toBeInTheDocument();
    expect(sheet('Add expense')).toBeInTheDocument();

    expect(pressBack(env)).toBe('dialog');
    expect(sheet('Add expense')).not.toBeInTheDocument();
    expect(pressBack(env)).toBe('back');
    expect(store.getState().data.tables.expense).toEqual([]);
  });
});
