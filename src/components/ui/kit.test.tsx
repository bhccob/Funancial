import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';
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
});

describe('Select', () => {
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
