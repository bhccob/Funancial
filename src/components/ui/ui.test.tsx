import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Banner } from './Banner';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { ErrorBoundary } from './ErrorBoundary';
import { Section } from './Section';
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

describe('Banner', () => {
  it('announces danger as an alert and other tones politely', () => {
    const { rerender } = render(<Banner tone="danger">Storage blocked</Banner>);
    expect(screen.getByRole('alert')).toHaveTextContent('Storage blocked');
    rerender(<Banner tone="demo">You are using demo money.</Banner>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('You are using demo money.');
  });

  it('renders its action', () => {
    render(
      <Banner tone="info" action={<button>Fix it</button>}>
        Heads up
      </Banner>,
    );
    expect(screen.getByRole('button', { name: 'Fix it' })).toBeInTheDocument();
  });
});

describe('Section', () => {
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
