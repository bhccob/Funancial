import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { helpPage } from '@/content/help';
import { HelpTip } from './HelpTip';

const PAGE = helpPage('net-worth')!;

function renderTip() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <p>
            <HelpTip pageId="net-worth" label="net worth" />
          </p>
        ),
      },
      { path: '/help/:id', element: <h1>A help page</h1> },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const tip = () => screen.getByRole('button', { name: 'What is net worth?' });
const sheet = () => screen.getByRole('dialog', { name: PAGE.title });

describe('HelpTip', () => {
  it('is a quiet "?" button with a 44px tap area, named for what it explains', () => {
    renderTip();
    expect(tip()).toHaveAttribute('type', 'button');
    // 16px glyph + 14px of padding each side; the negative margin keeps it from growing the row.
    expect(tip()).toHaveClass('text-muted', 'p-3.5', '-m-3.5');
    // A circle for the focus ring, and above the amount under it, which would cover its lower half.
    expect(tip()).toHaveClass('rounded-full', 'relative');
    expect(tip().querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(tip().querySelector('svg')).toHaveClass('size-4');
  });

  it('stays shut until tapped, then shows the page title, its summary and the link', async () => {
    renderTip();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(tip());
    expect(within(sheet()).getByText(PAGE.summary)).toBeInTheDocument();
    expect(within(sheet()).getByText(PAGE.title, { selector: 'p' })).toBeInTheDocument();
    expect(within(sheet()).getByRole('link', { name: "How it's worked out ›" })).toHaveAttribute(
      'href',
      '/help/net-worth',
    );
  });

  it('closes on Escape and gives focus back to the "?"', async () => {
    renderTip();
    await userEvent.click(tip());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tip()).toHaveFocus();
  });

  it('closes on a tap outside the sheet and gives focus back to the "?"', async () => {
    renderTip();
    await userEvent.click(tip());
    // The dimmed page behind the sheet is the dialog element itself.
    await userEvent.click(sheet());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tip()).toHaveFocus();
  });

  it('does not close when the sheet itself is tapped', async () => {
    renderTip();
    await userEvent.click(tip());
    await userEvent.click(within(sheet()).getByText(PAGE.summary));
    expect(sheet()).toBeVisible();
  });

  it('follows the link to the full page and closes', async () => {
    const router = renderTip();
    await userEvent.click(tip());
    await userEvent.click(within(sheet()).getByRole('link', { name: "How it's worked out ›" }));
    expect(router.state.location.pathname).toBe('/help/net-worth');
    expect(screen.getByRole('heading', { name: 'A help page' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
