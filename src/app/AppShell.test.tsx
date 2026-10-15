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
  it('opens the More sheet, lists every extra section and navigates from it', async () => {
    renderAt('/');
    const tabs = screen.getByRole('navigation', { name: 'Primary' });
    await userEvent.click(within(tabs).getByRole('button', { name: 'More' }));

    const sheet = screen.getByRole('dialog', { name: 'More' });
    const labels = within(sheet)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(labels).toEqual([
      'Subscriptions',
      'Salary Freeze',
      'Dividends',
      'News',
      'Goals',
      'History',
      'Shop',
      'Inbox',
      'Help',
      'Settings',
    ]);

    await userEvent.click(within(sheet).getByRole('link', { name: 'Settings' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
  });

  it('quick add opens Add Expense from any screen', async () => {
    renderAt('/invest');
    await userEvent.click(screen.getByRole('link', { name: 'Quick add' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Expense' })).toBeChecked();
    // Already adding: the floating button would only cover the form.
    expect(screen.queryByRole('link', { name: 'Quick add' })).not.toBeInTheDocument();
  });

  it('shows not found for an unknown path with a way home', async () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Go home' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
  });
});
