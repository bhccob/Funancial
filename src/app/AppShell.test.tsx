import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithStore } from '@/test/appStoreStub';
import { AppShell } from './AppShell';
import { appRouteObjects } from './router';

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

  it('leaves focus on a bar link that was used, which stays on screen', async () => {
    renderAt('/');
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    await userEvent.click(within(bar).getByRole('link', { name: 'Budget' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: 'Budget' })).toHaveFocus();
  });

  it('moves focus to the heading of a screen chosen from the Menu sheet, not back to the Menu button', async () => {
    renderAt('/');
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    const menu = within(bar).getByRole('button', { name: 'Menu' });
    await userEvent.click(menu);
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('link', { name: /^Goals/ }),
    );

    const goals = screen.getByRole('heading', { level: 1, name: 'Goals & debts' });
    expect(menu).not.toHaveFocus();
    expect(goals).toHaveFocus();
  });

  it('puts the bottom bar before the page, so Tab goes on into the page after a bar link', () => {
    renderAt('/');
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    const follows = bar.compareDocumentPosition(screen.getByRole('main'));
    expect(follows & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    await userEvent.click(within(bar).getByRole('link', { name: 'Budget' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('puts the screen Back returns to where it was left', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const router = renderAt('/');
    scrolledTo(640);
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    await userEvent.click(within(bar).getByRole('link', { name: 'Budget' }));
    scrolledTo(0);
    scrollTo.mockClear();

    await act(() => router.navigate(-1));
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });
});
