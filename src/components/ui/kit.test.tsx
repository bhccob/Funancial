import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';
import { Menu } from './Menu';
import { PageHeader } from './PageHeader';
import { ProgressBar } from './ProgressBar';
import { Select } from './Select';
import { Switch } from './Switch';

describe('ProgressBar', () => {
  it('caps the reported value at 100 but says the real percentage', () => {
    render(<ProgressBar label="Food" value={135} level="way-over" valueText="135% used" />);
    const bar = screen.getByRole('progressbar', { name: 'Food' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '135% used');
  });
});

describe('Switch', () => {
  it('toggles and reports its state', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Switch label="Reserve what's left" checked={false} onChange={onChange} />,
    );
    const sw = screen.getByRole('switch', { name: "Reserve what's left" });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Switch label="Reserve what's left" checked onChange={onChange} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('stays in place but does nothing when disabled', async () => {
    const onChange = vi.fn();
    render(<Switch label="Bills" checked={false} onChange={onChange} disabled />);
    const sw = screen.getByRole('switch', { name: 'Bills' });
    expect(sw).toBeDisabled();
    await userEvent.click(sw);
    await userEvent.click(screen.getByText('Bills'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Switch contrast', () => {
  it('draws the off track in the muted text colour, 3:1 against the page, not the faint border colour', () => {
    const { rerender } = render(<Switch label="Daily" checked={false} onChange={() => {}} />);
    const sw = screen.getByRole('switch', { name: 'Daily' });
    expect(sw).toHaveClass('bg-muted');
    expect(sw).not.toHaveClass('bg-border-strong');
    rerender(<Switch label="Daily" checked onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Daily' })).toHaveClass('bg-primary');
  });
});

describe('Select', () => {
  it('announces its error when it appears', () => {
    const props = {
      label: 'Kind',
      value: 'a',
      onChange: () => {},
      options: [{ value: 'a', label: 'A' }],
    };
    const { rerender } = render(<Select {...props} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<Select {...props} error="Choose one." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose one.');
  });

  it('is labelled and reports the chosen value', async () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Paid with"
        value="cash"
        onChange={onChange}
        options={[
          { value: 'cash', label: 'Cash' },
          { value: 'card:c1', label: 'Visa' },
        ]}
        hint="Card spending is paid off later"
      />,
    );
    const select = screen.getByLabelText('Paid with');
    expect(select).toHaveAccessibleDescription('Card spending is paid off later');
    await userEvent.selectOptions(select, 'Visa');
    expect(onChange).toHaveBeenCalledWith('card:c1');
  });

  it('can be disabled', () => {
    render(
      <Select
        label="At"
        value="20:00"
        onChange={vi.fn()}
        options={[{ value: '20:00', label: '20:00' }]}
        disabled
      />,
    );
    expect(screen.getByLabelText('At')).toBeDisabled();
  });
});

describe('PageHeader and EmptyState', () => {
  it('render a page heading and an empty state with its action', () => {
    render(
      <>
        <PageHeader title="Budget" action={<button>Add limit</button>} />
        <EmptyState title="No limits yet" action={<button>Set a limit</button>}>
          Limits warn you before you overspend.
        </EmptyState>
      </>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add limit' })).toBeInTheDocument();
    expect(screen.getByText('No limits yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set a limit' })).toBeInTheDocument();
  });
});

describe('Menu', () => {
  it('opens a menu of actions, runs the chosen one and closes', async () => {
    const onEdit = vi.fn();
    render(<Menu label="Actions for Gym" items={[{ label: 'Edit', onSelect: onEdit }]} />);
    const trigger = screen.getByRole('button', { name: 'Actions for Gym' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps the focus ring on its items, which the page-wide ring draws', async () => {
    render(<Menu label="Actions" items={[{ label: 'Edit', onSelect: vi.fn() }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    // The item's own highlight (a 1.1:1 grey) is not a focus indicator; the outline is.
    expect(screen.getByRole('menuitem', { name: 'Edit' })).not.toHaveClass('focus:outline-none');
  });

  it('takes the look of its button from where it sits, and draws the menu in the page ink', async () => {
    render(
      <Menu
        label="More"
        triggerClassName="glass-head size-[34px]"
        items={[{ label: 'Move money', onSelect: vi.fn() }]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).toHaveClass('glass-head', 'size-[34px]');
    expect(trigger).not.toHaveClass('text-muted');
    await userEvent.click(trigger);
    // On the top block the text tokens are the block's ink; the menu is the page's white.
    expect(screen.getByRole('menu', { name: 'More' })).toHaveClass('page-ink', 'text-text');
  });

  it('moves with the arrow keys and closes on Escape, back on its button', async () => {
    render(
      <Menu
        label="Actions"
        items={[
          { label: 'Edit', onSelect: vi.fn() },
          { label: 'Cancel subscription', onSelect: vi.fn() },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Cancel subscription' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus();
  });
});
