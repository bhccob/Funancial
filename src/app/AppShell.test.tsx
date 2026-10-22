import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { topDialog } from '@/lib/dialogStack';
import { toast, toastStore } from '@/lib/toast';
import { handleBack } from '@/platform/back';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeAccount, makeExpense, makeLimit, makeProfile, makeSettings } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { AppShell } from './AppShell';
import { appRouteObjects } from './router';
import { useAddSheet } from './useAddSheet';

function renderAt(path: string) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: [path] });
  renderWithStore(<RouterProvider router={router} />);
  return router;
}

afterEach(() => vi.restoreAllMocks());

describe('AppShell', () => {
  it('shows not found for an unknown path with a way home', async () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Go home' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
  });

  it('moves focus to the heading of the new screen when a route change leaves it nowhere', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderAt('/nope');
    // The first screen leaves focus where the browser put it.
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).not.toHaveFocus();
    await userEvent.click(screen.getByRole('link', { name: 'Go home' }));
    const home = screen.getByRole('heading', { level: 1, name: 'Home' });
    expect(home).toHaveFocus();
    // A heading is where focus is placed, not a control: it is focusable by script and draws no ring.
    expect(home).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('main').className).toContain('[&_h1:focus]:outline-none');
    // It must not scroll the screen to its top while the person is mid-page.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('falls back to the page itself when a screen has no heading', async () => {
    const router = createMemoryRouter(
      [
        {
          element: <AppShell />,
          children: [
            { path: '/', element: <Link to="/bare">Open</Link> },
            { path: '/bare', element: <p>No heading here</p> },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    renderWithStore(<RouterProvider router={router} />);
    await userEvent.click(screen.getByRole('link', { name: 'Open' }));
    expect(screen.getByText('No heading here')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('main')).toHaveClass('focus:outline-none');
  });

  it('leaves focus on a tab that was used, which stays on screen', async () => {
    renderAt('/');
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    await userEvent.click(within(bar).getByRole('link', { name: 'Spending' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: 'Spending' })).toHaveFocus();
  });

  it('moves focus to the heading of a screen chosen on Profile', async () => {
    renderAt('/profile');
    await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: /^History/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toHaveFocus();
  });

  it('puts the tab bar before the page, so Tab goes on into the page after a tab', () => {
    renderAt('/');
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    const follows = bar.compareDocumentPosition(screen.getByRole('main'));
    expect(follows & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has no Menu button and no Menu sheet: Profile holds the menu', () => {
    renderAt('/');
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('leaves room under the page for the tab bar on phones', () => {
    renderAt('/');
    expect(screen.getByRole('main')).toHaveClass('pb-[calc(var(--tab-bar)+24px)]', 'md:pb-12');
  });

  it('puts the soft shapes behind the page while it is up, and takes them away after', () => {
    const { unmount } = renderWithStore(
      <RouterProvider router={createMemoryRouter(appRouteObjects, { initialEntries: ['/'] })} />,
    );
    expect(document.body).toHaveClass('page-blobs');
    unmount();
    expect(document.body).not.toHaveClass('page-blobs');
  });

  it('has no ＋ fan, and leaves the page usable', () => {
    renderAt('/');
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Add' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-fan-scrim]')).toBeNull();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  });

  it('keeps the banners in a box that is empty and out of the layout when none shows', () => {
    renderAt('/');
    // The top block reaches the top edge only while this is :empty (index.css).
    const banners = screen.getByRole('main').querySelector('[data-shell-banners]');
    expect(banners).toBeEmptyDOMElement();
    expect(banners).toHaveClass('empty:hidden');
  });

  it('puts a banner that shows in that box', () => {
    const router = createMemoryRouter(appRouteObjects, { initialEntries: ['/'] });
    renderWithStore(<RouterProvider router={router} />, createStubStore({ namespace: 'demo' }));
    const banners = screen.getByRole('main').querySelector('[data-shell-banners]');
    expect(banners).not.toBeEmptyDOMElement();
    expect(banners).toHaveTextContent("You're exploring with demo money");
  });

  it('leaves focus in a field the new page focused itself', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('link', { name: 'Expense' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Add' })).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveFocus();
  });
});

describe('AppShell scroll', () => {
  const scrolledTo = (y: number) =>
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  afterEach(() => {
    // jsdom's own scrollY is a plain 0.
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('opens a new screen at the top, though the last one was scrolled', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    renderAt('/');
    scrolledTo(900);
    scrollTo.mockClear();

    const bar = screen.getByRole('navigation', { name: 'Primary' });
    await userEvent.click(within(bar).getByRole('link', { name: 'Spending' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('puts the screen Back returns to where it was left', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const router = renderAt('/');
    scrolledTo(640);
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    await userEvent.click(within(bar).getByRole('link', { name: 'Spending' }));
    scrolledTo(0);
    scrollTo.mockClear();

    await act(() => router.navigate(-1));
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });
});

/** A screen inside the shell that opens the add sheets, as Home will. */
function Opener() {
  const openAdd = useAddSheet();
  return (
    <>
      <h1>Somewhere</h1>
      <button type="button" onClick={() => openAdd('expense')}>
        New expense
      </button>
      <button type="button" onClick={() => openAdd('income')}>
        New income
      </button>
    </>
  );
}

describe('the add sheets', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    toastStore.setState({ toasts: [] });
  });

  function renderOpener(store = createStubStore()) {
    const router = createMemoryRouter(
      [{ element: <AppShell />, children: [{ path: '/', element: <Opener /> }] }],
      { initialEntries: ['/'] },
    );
    renderWithStore(
      <>
        <RouterProvider router={router} />
        <Toaster />
      </>,
      store,
    );
    return router;
  }

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

  it('opens Add expense over the screen, on the Amount; back closes the sheet only', async () => {
    renderOpener();
    await userEvent.click(screen.getByRole('button', { name: 'New expense' }));

    const adding = sheet('Add expense')!;
    expect(adding).toBeInTheDocument();
    expect(within(adding).getByRole('heading', { level: 2, name: 'Add expense' })).toHaveClass(
      'text-section',
    );
    expect(within(adding).getByLabelText('Amount')).toHaveFocus();
    expect(topDialog()).toBe(adding);

    const env = backEnv();
    expect(pressBack(env)).toBe('dialog');
    expect(sheet('Add expense')).not.toBeInTheDocument();
    expect(env.back).not.toHaveBeenCalled();
    expect(pressBack(env)).toBe('back');
  });

  it('does nothing for a screen drawn on its own, outside the shell', async () => {
    renderWithStore(
      <RouterProvider
        router={createMemoryRouter([{ path: '/', element: <Opener /> }], {
          initialEntries: ['/'],
        })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'New expense' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens Add income', async () => {
    renderOpener();
    await userEvent.click(screen.getByRole('button', { name: 'New income' }));
    const adding = sheet('Add income')!;
    expect(adding).toBeInTheDocument();
    expect(within(adding).getByLabelText('Amount')).toHaveFocus();
    expect(sheet('Add expense')).not.toBeInTheDocument();
  });

  it('closes with its Cancel', async () => {
    renderOpener();
    await userEvent.click(screen.getByRole('button', { name: 'New expense' }));
    await userEvent.click(within(sheet('Add expense')!).getByRole('button', { name: 'Cancel' }));
    expect(sheet('Add expense')).not.toBeInTheDocument();
    expect(topDialog()).toBeNull();
  });

  it('takes a toast inside the sheet, where the page behind it is inert', async () => {
    renderOpener();
    await userEvent.click(screen.getByRole('button', { name: 'New income' }));
    act(() => toast('success', 'Expense saved.'));
    expect(sheet('Add income')).toContainElement(screen.getByText('Expense saved.'));
  });

  it('asks over the sheet when an expense crosses a limit, and stays on the screen', async () => {
    // No price service: nothing asks the network for anything.
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
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
    const router = renderOpener(store);

    await userEvent.click(screen.getByRole('button', { name: 'New expense' }));
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
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Somewhere' })).toBeInTheDocument();
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
    renderOpener(store);
    await userEvent.click(screen.getByRole('button', { name: 'New expense' }));
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
