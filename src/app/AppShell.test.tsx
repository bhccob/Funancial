import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithStore } from '@/test/appStoreStub';
import { appRouteObjects } from './router';

function renderAt(path: string) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: [path] });
  renderWithStore(<RouterProvider router={router} />);
  return router;
}

describe('AppShell', () => {
  it('shows not found for an unknown path with a way home', async () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Go home' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
  });

  it('moves focus into the page when a route change leaves it nowhere, so Tab starts in its content', async () => {
    renderAt('/nope');
    const main = screen.getByRole('main');
    // The first screen leaves focus where the browser put it.
    expect(main).not.toHaveFocus();
    await userEvent.click(screen.getByRole('link', { name: 'Go home' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(main).toHaveFocus();
    // The page is where focus is placed, not a control: it draws no ring of its own.
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(main).toHaveClass('focus:outline-none');
  });

  it('leaves focus on a bar link that was used, which stays on screen', async () => {
    renderAt('/');
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    await userEvent.click(within(bar).getByRole('link', { name: 'Budget' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: 'Budget' })).toHaveFocus();
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
