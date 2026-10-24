import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentType } from 'react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useLocation,
} from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Banner } from './Banner';
import { Button, ButtonLink } from './Button';
import { Card } from './Card';
import { Dialog } from './Dialog';
import { EmptyState } from './EmptyState';
import { ErrorBoundary } from './ErrorBoundary';
import { PageHeader } from './PageHeader';
import { ProgressBar } from './ProgressBar';
import { EmptyLink, Section, SectionLink } from './Section';
import { Sheet } from './Sheet';
import { TextField } from './TextField';
import { Toaster } from './Toaster';
import { topDialog } from '@/lib/dialogStack';
import { toast, toastStore } from '@/lib/toast';

describe('Button', () => {
  it('has a quiet danger style with exactly one text colour', () => {
    // cn() joins classes without merging, so a second colour utility would win by CSS order.
    render(<Button variant="danger-ghost">Delete</Button>);
    const colours = screen
      .getByRole('button', { name: 'Delete' })
      .className.split(' ')
      .filter((c) => /^text-(text|danger|muted|primary-contrast|white)$/.test(c));
    expect(colours).toEqual(['text-danger']);
  });

  it('keeps white text off the danger fill, which is light in the dark theme', () => {
    render(<Button variant="danger">Delete</Button>);
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveClass('bg-danger', 'text-danger-contrast');
    expect(button).not.toHaveClass('text-white');
  });

  it('draws secondary and ghost buttons as glass pills, and keeps primary solid ink', () => {
    render(
      <>
        <Button variant="secondary">Cancel</Button>
        <Button variant="ghost">Skip</Button>
        <Button>Save</Button>
      </>,
    );
    for (const name of ['Cancel', 'Skip']) {
      const button = screen.getByRole('button', { name });
      expect(button, name).toHaveClass('glass', 'text-text', 'rounded-full');
      // The old outline and the old hover wash are gone: the glass is the surface.
      expect(button.className, name).not.toMatch(/border-border-strong|bg-transparent|hover:bg-/);
    }
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveClass('bg-primary', 'text-primary-contrast');
    expect(save).not.toHaveClass('glass');
  });

  it('gives the banner button a see-through page-colour surface, so its edge shows on a gradient', () => {
    render(<Button variant="banner">Not now</Button>);
    expect(screen.getByRole('button', { name: 'Not now' })).toHaveClass(
      'border-border-strong',
      'bg-bg/60',
      'text-text',
    );
  });

  it('makes medium buttons 48px tall', () => {
    render(
      <MemoryRouter>
        <Button size="sm">Small</Button>
        <Button>Medium</Button>
        <Button size="lg">Large</Button>
        <ButtonLink to="/" size="sm">
          Link
        </ButtonLink>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass('h-11', 'px-4', 'text-sm');
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveClass(
      'h-12',
      'px-5',
      'text-[15px]',
    );
    expect(screen.getByRole('button', { name: 'Large' })).toHaveClass('h-14', 'px-6', 'text-base');
    expect(screen.getByRole('link', { name: 'Link' })).toHaveClass('h-11');
  });

  it('moves only where motion is allowed', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveClass('motion-safe:transition-[transform,background-color,opacity]');
    expect(button).toHaveClass('press');
    expect(button.className).not.toMatch(/(^|\s)(transition|duration-|active:scale|motion-reduce)/);
  });

  it('does not submit a form unless asked to', async () => {
    const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Plain</Button>
        <Button type="submit">Send</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Plain' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('TextField', () => {
  it('links label, hint and error', () => {
    render(<TextField label="PIN" hint="4 to 8 digits" error="Too short" />);
    const input = screen.getByLabelText('PIN');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/4 to 8 digits.*Too short/);
  });

  it('announces its error when it appears, and says its hint as plain text', () => {
    const { rerender } = render(<TextField label="PIN" hint="4 to 8 digits" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<TextField label="PIN" hint="4 to 8 digits" error="Too short" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Too short');
    expect(screen.getByText('4 to 8 digits')).not.toHaveAttribute('role');
  });

  it('is valid and described by its hint when there is no error', () => {
    render(<TextField label="Name" hint="Shown on your profile" />);
    const input = screen.getByLabelText('Name');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Shown on your profile');
  });
});

describe('Dialog', () => {
  it('shows messages inside an open dialog, where they can be read and dismissed', async () => {
    toastStore.setState({ toasts: [] });
    render(
      <>
        <Dialog open title="Edit card" onClose={() => {}}>
          <p>Form</p>
        </Dialog>
        <Toaster />
      </>,
    );
    act(() => toast('danger', 'This card or loan has history.'));
    const dialog = screen.getByRole('dialog', { name: 'Edit card' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('This card or loan has history.');
  });

  it('is labelled by its title and described by its description', () => {
    render(
      <Dialog open title="Leave demo?" description="Demo data will be deleted." onClose={() => {}}>
        body
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Leave demo?' });
    expect(dialog).toHaveAccessibleDescription('Demo data will be deleted.');
  });

  it('calls onClose once on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Leave demo?" onClose={onClose}>
        body
      </Dialog>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks to close on the cancel event (Android back) and leaves closing to its owner', () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Leave demo?" onClose={onClose}>
        body
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Leave demo?' });
    expect(topDialog()).toBe(dialog);
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog).toBeVisible();
  });

  it('is not reachable when closed', () => {
    render(
      <Dialog open={false} title="Hidden" onClose={() => {}}>
        body
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Sheet and Dialog shells', () => {
  it('frosts the box inside the sheet, with rounded top corners; the <dialog> is a clear frame with the shadow', () => {
    render(<Sheet open title="Details" onClose={() => {}} />);
    const sheet = screen.getByRole('dialog', { name: 'Details' });
    expect(sheet).toHaveClass('bg-transparent', 'rounded-t-sheet', 'text-text');
    expect(sheet).toHaveClass('shadow-(--shadow-overlay)', 'overflow-y-auto');
    expect(sheet.firstElementChild).toHaveClass('glass-sheet', 'rounded-t-sheet');
    expect(sheet.className).not.toMatch(/bg-overlay/);
  });

  it('frosts the box inside the dialog, with 24px corners; the <dialog> is a clear frame with the shadow', () => {
    render(
      <Dialog open title="Leave demo?" onClose={() => {}}>
        body
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Leave demo?' });
    expect(dialog).toHaveClass('bg-transparent', 'rounded-[24px]', 'text-text');
    expect(dialog).toHaveClass('shadow-(--shadow-overlay)');
    expect(dialog.firstElementChild).toHaveClass('glass-sheet', 'rounded-[24px]');
    expect(dialog.className).not.toMatch(/bg-overlay|rounded-lg/);
  });

  it.each([
    ['Sheet', <Sheet key="s" open title="Details" onClose={() => {}} />],
    [
      'Dialog',
      <Dialog key="d" open title="Details" onClose={() => {}}>
        body
      </Dialog>,
    ],
  ])(
    'keeps any filter off the <dialog> of a %s, which would make it the containing block of the fixed toasts inside it',
    (_name, overlay) => {
      render(overlay);
      const dialog = screen.getByRole('dialog', { name: 'Details' });
      // Anything that filters what is behind it (or the element) makes it the containing block of
      // `fixed` descendants: the Toaster's region, portaled into the open dialog, would sit on it.
      expect(dialog.className).not.toMatch(
        /glass|backdrop-(blur|filter)|(^|\s)(blur|filter)|will-change|(^|\s)(translate|scale|rotate|transform)/,
      );
    },
  );
});

describe('Sheet and Dialog focus', () => {
  /** A button that opens the overlay; Escape closes it. */
  const overlays: Array<
    [string, ComponentType<{ open: boolean; title: string; onClose(): void }>]
  > = [
    ['Sheet', Sheet],
    ['Dialog', Dialog],
  ];

  it.each(overlays)(
    '%s gives focus back to what opened it when it closes',
    async (_name, Overlay) => {
      function Harness() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>
              Open
            </button>
            <Overlay open={open} title="Details" onClose={() => setOpen(false)} />
          </>
        );
      }
      render(<Harness />);
      const opener = screen.getByRole('button', { name: 'Open' });
      await userEvent.click(opener);
      expect(screen.getByRole('dialog', { name: 'Details' })).toBeVisible();
      expect(opener).not.toHaveFocus();
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    },
  );

  it('starts on the chosen radio of a group, not on the first radio the browser finds', () => {
    // Chrome focuses the first control in a dialog, which here is a radio nobody chose.
    const showModal = vi
      .spyOn(HTMLDialogElement.prototype, 'showModal')
      .mockImplementation(function (this: HTMLDialogElement) {
        this.open = true;
        this.querySelector('input')?.focus();
      });
    render(
      <Dialog open title="Limit" onClose={() => {}}>
        <form>
          <label>
            <input type="radio" name="scope" /> Overall
          </label>
          <label>
            <input type="radio" name="scope" defaultChecked /> One category
          </label>
        </form>
      </Dialog>,
    );
    expect(screen.getByRole('radio', { name: 'One category' })).toHaveFocus();
    showModal.mockRestore();
  });

  it('does not throw, or focus a detached node, when the opener is gone before it closes', () => {
    const page = (hasOpener: boolean, open: boolean) => (
      <>
        {hasOpener && <button type="button">Open</button>}
        <Sheet open={open} title="Details" onClose={() => {}} />
      </>
    );
    const { rerender } = render(page(true, false));
    const opener = screen.getByRole('button', { name: 'Open' });
    const focus = vi.spyOn(opener, 'focus');
    opener.focus();
    focus.mockClear();
    rerender(page(true, true));
    rerender(page(false, true));
    expect(opener).not.toBeInTheDocument();
    expect(() => rerender(page(false, false))).not.toThrow();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(focus).not.toHaveBeenCalled();
  });
});

describe('Sheet title', () => {
  it('names the sheet without drawing the name, unless asked to draw it', () => {
    const { rerender } = render(<Sheet open title="Details" onClose={() => {}} />);
    const title = within(screen.getByRole('dialog', { name: 'Details' })).getByRole('heading', {
      level: 2,
      name: 'Details',
    });
    expect(title).toHaveClass('sr-only');

    rerender(<Sheet open title="Details" showTitle onClose={() => {}} />);
    expect(title).toHaveClass('text-section');
    expect(title).not.toHaveClass('sr-only');
  });
});

describe('nested dialogs', () => {
  it('Escape closes only the inner one, as Android back does', async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const page = (asking: boolean) => (
      <Sheet open title="Add expense" onClose={outer}>
        <Dialog open={asking} title="Over your limit?" onClose={inner} />
      </Sheet>
    );
    const { rerender } = render(page(false));
    rerender(page(true));
    screen.getByRole('dialog', { name: 'Over your limit?' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('Toaster', () => {
  it('floats toasts just above the tab bar on phones, and low on desktop', () => {
    toastStore.setState({ toasts: [] });
    const { container } = render(<Toaster />);
    expect(container.firstElementChild).toHaveClass(
      'bottom-[calc(var(--tab-bar)+12px)]',
      'md:bottom-8',
    );
  });
});

describe('Toast dismiss button', () => {
  it('is a 44px tap target around its 16px cross', () => {
    toastStore.setState({ toasts: [] });
    render(<Toaster />);
    act(() => void toast('info', 'Saved.'));
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveClass('size-11');
  });
});

describe('Banner', () => {
  it('announces danger as an alert and other tones politely', () => {
    const { rerender } = render(<Banner tone="danger">Storage blocked</Banner>);
    expect(screen.getByRole('alert')).toHaveTextContent('Storage blocked');
    for (const tone of ['demo', 'info', 'warning'] as const) {
      rerender(<Banner tone={tone}>Storage is nearly full</Banner>);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Storage is nearly full');
    }
  });

  it('puts its action after the text, on the right', () => {
    render(
      <Banner tone="info" action={<button>Fix it</button>}>
        Heads up
      </Banner>,
    );
    const banner = screen.getByRole('status');
    expect(banner).toHaveClass('flex', 'flex-wrap', 'items-center');
    expect(banner.firstElementChild).toHaveClass('min-w-0', 'flex-1', 'basis-40');
    expect(banner.lastElementChild).toBe(screen.getByRole('button', { name: 'Fix it' }));
  });

  it('sets a lone sentence as 13px bold text', () => {
    render(<Banner tone="info">Heads up</Banner>);
    expect(screen.getByText('Heads up')).toHaveClass('text-[13px]', 'font-bold');
  });

  it('sets a title as the 13px extra-bold line, with the children under it as the muted line', () => {
    render(
      <Banner tone="warning" title="Careful">
        Storage is nearly full
      </Banner>,
    );
    expect(screen.getByText('Careful')).toHaveClass('text-[13px]', 'font-extrabold');
    const line = screen.getByText('Storage is nearly full');
    expect(line).toHaveClass('text-warning-muted', 'text-[11px]', 'font-bold');
    expect(line.previousElementSibling).toBe(screen.getByText('Careful'));
  });

  it.each([null, false])(
    'treats a title of %s as no title, so the children are the bold sentence',
    (title) => {
      render(
        <Banner tone="info" title={title}>
          Heads up
        </Banner>,
      );
      expect(screen.getByText('Heads up')).toHaveClass('text-[13px]', 'font-bold');
      // One line, not an empty title row above the sentence.
      expect(screen.getByRole('status').firstElementChild?.children).toHaveLength(1);
    },
  );

  it.each(['demo', 'info', 'warning', 'danger'] as const)(
    'is a soft gradient card from the %s tokens',
    (tone) => {
      render(
        <Banner tone={tone} title="Title">
          Line
        </Banner>,
      );
      const banner = screen.getByRole(tone === 'danger' ? 'alert' : 'status');
      expect(banner).toHaveClass(
        'rounded-[24px]',
        'px-3.5',
        'py-3',
        'bg-linear-120/srgb',
        `from-${tone}-from`,
        `to-${tone}-to`,
      );
      expect(screen.getByText('Line')).toHaveClass(`text-${tone}-muted`);
      // No grey surface, no left bar, no tone-coloured text: the gradient and the role carry the tone.
      expect(banner.className).not.toMatch(/bg-surface|border-l|text-danger|text-warning/);
    },
  );

  it('takes a class from its caller', () => {
    render(
      <Banner tone="demo" className="mb-4">
        Hi
      </Banner>,
    );
    expect(screen.getByRole('status')).toHaveClass('mb-4');
  });
});

describe('PageHeader', () => {
  it('renders page titles at the page size', () => {
    render(<PageHeader title="Goals" />);
    const title = screen.getByRole('heading', { level: 1, name: 'Goals' });
    expect(title).toHaveClass('text-page');
  });

  it('has no line under it; the first section supplies its own top space', () => {
    render(<PageHeader title="Goals" />);
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('pb-2');
    expect(header.className).not.toMatch(/(^|\s)border-/);
  });

  it('has no back button unless asked for one, and then needs no router', () => {
    render(<PageHeader title="Goals" />);
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });
});

describe('PageHeader back button', () => {
  function Where() {
    return <p data-testid="where">{useLocation().pathname}</p>;
  }
  const page = (
    <Routes>
      <Route
        path="*"
        element={
          <>
            <Where />
            <PageHeader title="Settings" back>
              Preferences
            </PageHeader>
          </>
        }
      />
    </Routes>
  );

  it('is a 44px round glass button with a chevron, before the title', () => {
    render(<MemoryRouter initialEntries={['/settings']}>{page}</MemoryRouter>);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveClass('glass', 'rounded-full', 'size-11');
    expect(back.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const title = screen.getByRole('heading', { level: 1, name: 'Settings' });
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The line under the title stays in line with the title, past the button.
    expect(screen.getByText('Preferences')).toHaveClass('ml-14');
  });

  it('goes back in history when there is somewhere in the app to go back to', async () => {
    render(
      <MemoryRouter initialEntries={['/profile', '/settings']} initialIndex={1}>
        {page}
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where')).toHaveTextContent('/settings');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/profile');
  });

  it('goes to Home when the screen was opened first thing, with no history of the app', async () => {
    render(<MemoryRouter initialEntries={['/settings']}>{page}</MemoryRouter>);
    expect(screen.getByTestId('where')).toHaveTextContent('/settings');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });
});

describe('PageHeader back button with no history', () => {
  function pages(backTo?: string) {
    return createMemoryRouter(
      [
        { path: '/', element: <p>Home page</p> },
        { path: '/help', element: <p>Help index</p> },
        {
          path: '/settings',
          element: (
            <PageHeader title="Settings" back backTo={backTo}>
              Preferences
            </PageHeader>
          ),
        },
      ],
      { initialEntries: ['/settings'] },
    );
  }

  it.each([
    ['Home', undefined, '/'],
    ['the place it names', '/help', '/help'],
  ])(
    'replaces the screen with %s, so the phone Back does not return to it',
    async (_, backTo, path) => {
      const router = pages(backTo);
      render(<RouterProvider router={router} />);
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(router.state.location.pathname).toBe(path);
      // A replace, not a push: there is no entry left behind it for a Back to land on.
      expect(router.state.historyAction).toBe('REPLACE');
      await act(() => router.navigate(-1));
      expect(router.state.location.pathname).toBe(path);
    },
  );

  it('still pushes nothing and replaces nothing when it goes back in history', async () => {
    const router = createMemoryRouter(
      [
        { path: '/profile', element: <p>Profile page</p> },
        { path: '/settings', element: <PageHeader title="Settings" back /> },
      ],
      { initialEntries: ['/profile', '/settings'], initialIndex: 1 },
    );
    render(<RouterProvider router={router} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(router.state.location.pathname).toBe('/profile');
    expect(router.state.historyAction).toBe('POP');
  });
});

describe('PageHeader back button with a place to fall back to', () => {
  function Where() {
    return <p data-testid="where">{useLocation().pathname}</p>;
  }
  const page = (
    <Routes>
      <Route
        path="*"
        element={
          <>
            <Where />
            <PageHeader title="Limits" back backTo="/help" />
          </>
        }
      />
    </Routes>
  );

  it('goes back in history first, whatever it could fall back to', async () => {
    render(
      <MemoryRouter initialEntries={['/budget', '/help/limits']} initialIndex={1}>
        {page}
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/budget');
  });

  it('goes to that place when the screen was opened first thing, with no history of the app', async () => {
    render(<MemoryRouter initialEntries={['/help/limits']}>{page}</MemoryRouter>);
    expect(screen.getByTestId('where')).toHaveTextContent('/help/limits');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/help$/);
  });
});

describe('Card and EmptyState', () => {
  it('draws a card as a tile of page glass with 24px corners', () => {
    render(<Card data-testid="card">Welcome</Card>);
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('glass', 'rounded-[24px]', 'p-5');
    expect(card.className).not.toMatch(/bg-surface-2|rounded-lg/);
  });

  it('keeps an empty state in line with the plain rows it stands in for', () => {
    render(
      <EmptyState title="No goals yet" action={<button>Add a goal</button>}>
        Goals show your progress.
      </EmptyState>,
    );
    expect(screen.getByText('No goals yet').parentElement).toHaveClass('mx-1');
    expect(screen.getByText('Goals show your progress.')).toHaveClass('text-muted');
    expect(screen.getByRole('button', { name: 'Add a goal' })).toBeInTheDocument();
  });
});

describe('ProgressBar', () => {
  it('animates only where motion is allowed', () => {
    render(<ProgressBar label="Food" value={40} level="ok" valueText="40% used" />);
    const fill = screen.getByRole('progressbar', { name: 'Food' }).firstElementChild!;
    expect(fill).toHaveClass('motion-safe:transition-[width]', 'motion-safe:duration-300');
    expect(fill.className).not.toMatch(/(^|\s)(transition|duration-)/);
  });
});

describe('Section', () => {
  it('renders section titles at the section size', () => {
    render(<Section title="Limits">body</Section>);
    const title = screen.getByRole('heading', { level: 2, name: 'Limits' });
    expect(title).toHaveClass('text-section');
  });

  it('is padded 22px above and has no box, no hairline and no padding below', () => {
    render(<Section title="Limits">body</Section>);
    const section = screen.getByRole('region', { name: 'Limits' });
    expect(section).toHaveClass('pt-[22px]');
    expect(section.className).not.toMatch(/(^|\s)(py-|pb-|border|bg-|rounded)/);
    expect(screen.getByRole('heading', { level: 2, name: 'Limits' })).toHaveClass('text-section');
  });

  it('keeps the action slot 13.5px, bold and muted', () => {
    render(
      <Section title="Limits" action={<span>See all</span>}>
        body
      </Section>,
    );
    expect(screen.getByText('See all').parentElement).toHaveClass(
      'text-muted',
      'text-[13.5px]',
      'font-bold',
    );
  });

  it('offers the title links Home and Budget use', () => {
    render(
      <MemoryRouter>
        <Section title="Goals" action={<SectionLink to="/goals">All</SectionLink>}>
          <EmptyLink to="/goals">Add a goal</EmptyLink>
        </Section>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('href', '/goals');
    expect(screen.getByRole('link', { name: 'Add a goal' })).toHaveClass('min-h-11');
    // A short word like "All" is still a 44px-wide tap target.
    expect(screen.getByRole('link', { name: 'All' })).toHaveClass('min-w-11');
  });

  it('sets a help tip 4px after the title, with the action still on the right', () => {
    render(
      <Section title="Limits" help={<button type="button">?</button>} action={<a href="/b">All</a>}>
        body
      </Section>,
    );
    // The row's gap is 12px; the tip pulls in 8px of it.
    expect(screen.getByRole('button', { name: '?' }).parentElement).toHaveClass('-ml-2', 'mr-auto');
    expect(screen.getByRole('heading', { name: 'Limits' }).parentElement).toContainElement(
      screen.getByRole('link', { name: 'All' }),
    );
  });

  it('is labelled by its title and shows its action', () => {
    render(
      <Section title="Limits" action={<a href="/budget">See all</a>}>
        body
      </Section>,
    );
    const section = screen.getByRole('region', { name: 'Limits' });
    expect(section).toContainElement(screen.getByRole('link', { name: 'See all' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Limits' })).toBeInTheDocument();
  });
});

describe('ErrorBoundary', () => {
  it('shows a recovery screen when a child crashes', () => {
    const Boom = () => {
      throw new Error('kaboom');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    spy.mockRestore();
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
