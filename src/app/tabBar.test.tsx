import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { toast, toastStore } from '@/lib/toast';
import { renderWithStore } from '@/test/appStoreStub';
import { appRouteObjects } from './router';

/** The app at `path`, with the Toaster beside it as Root has it. */
function renderAt(path: string) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: [path] });
  renderWithStore(
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>,
  );
  return router;
}

const bar = () => screen.getByRole('navigation', { name: 'Primary' });
const tab = (name: string) => within(bar()).getByRole('link', { name });

afterEach(() => toastStore.setState({ toasts: [] }));

describe('tab bar', () => {
  it('reads Home, Cards, Spending, Invest and Profile, each an icon over its label', () => {
    renderAt('/budget');
    const slots = [...bar().querySelectorAll('a, button')];
    expect(slots).toHaveLength(5);
    const tabs = [
      ['Home', '/', 'lucide-house'],
      ['Cards', '/cards', 'lucide-credit-card'],
      ['Spending', '/budget', 'lucide-chart-pie'],
      ['Invest', '/invest', 'lucide-trending-up'],
      ['Profile', '/profile', 'lucide-user-round'],
    ] as const;
    tabs.forEach(([name, path, icon], i) => {
      const link = slots[i]!;
      expect(link).toHaveAccessibleName(name);
      expect(link).toHaveAttribute('href', path);
      // The icon first, then the label, which every tab shows (none is for a screen reader only).
      const [glyph, label] = [...link.children];
      expect(glyph).toHaveClass(icon, 'size-[21px]');
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
      expect(label).toHaveTextContent(name);
      expect(label).not.toHaveClass('sr-only');
    });
  });

  it('has no ＋: nothing in the bar is a button', () => {
    renderAt('/');
    expect(within(bar()).queryByRole('button')).not.toBeInTheDocument();
    expect(within(bar()).queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Add' })).not.toBeInTheDocument();
  });

  it('marks the current tab, in the accent at 800, and the rest muted', () => {
    renderAt('/budget');
    expect(tab('Spending')).toHaveAttribute('aria-current', 'page');
    expect(tab('Spending')).toHaveClass('text-accent', 'font-extrabold');
    expect(tab('Spending')).not.toHaveClass('text-muted');
    for (const name of ['Home', 'Cards', 'Invest', 'Profile']) {
      expect(tab(name), name).not.toHaveAttribute('aria-current');
      expect(tab(name), name).toHaveClass('text-muted', 'font-bold');
      expect(tab(name), name).not.toHaveClass('text-accent');
    }
  });

  it('marks Home only on Home itself', () => {
    renderAt('/');
    expect(tab('Home')).toHaveAttribute('aria-current', 'page');
    expect(
      within(bar())
        .getAllByRole('link')
        .filter((a) => a.hasAttribute('aria-current')),
    ).toHaveLength(1);
  });

  it('goes to the tab tapped', async () => {
    const router = renderAt('/');
    await userEvent.click(tab('Cards'));
    expect(router.state.location.pathname).toBe('/cards');
    expect(screen.getByRole('heading', { level: 1, name: 'Cards' })).toBeInTheDocument();
    expect(tab('Cards')).toHaveAttribute('aria-current', 'page');
  });

  it('opens Profile from the Profile tab, at the bottom right', async () => {
    const router = renderAt('/');
    expect(within(bar()).getAllByRole('link').at(-1)).toBe(tab('Profile'));
    await userEvent.click(tab('Profile'));
    expect(router.state.location.pathname).toBe('/profile');
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    expect(tab('Profile')).toHaveAttribute('aria-current', 'page');
  });

  it('runs edge to edge along the bottom, in the bar glass, its height taking in the safe area', () => {
    renderAt('/');
    expect(bar()).toHaveClass(
      'glass-bar',
      'fixed',
      'inset-x-0',
      'bottom-0',
      'h-(--tab-bar)',
      'md:hidden',
    );
    expect(bar()).not.toHaveClass('rounded-full');
    // Each tab is a share of the row and 50px tall: well over a 44px tap.
    for (const link of within(bar()).getAllByRole('link')) {
      expect(link).toHaveClass('flex-1', 'h-[50px]', 'text-[11px]');
    }
  });

  it('puts the toasts just above the bar', () => {
    renderAt('/');
    act(() => toast('success', 'Expense saved.'));
    expect(screen.getByText('Expense saved.').closest('[aria-live]')).toHaveClass(
      'bottom-[calc(var(--tab-bar)+12px)]',
      'md:bottom-8',
    );
  });
});
