import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { currencySymbol } from '@/domain/money';
import { DateField } from '@/features/add/DateField';
import { MoneyField } from './MoneyField';
import { RadioGroup } from './RadioGroup';
import { Select } from './Select';
import { ShareStepper } from './ShareStepper';
import { TextField } from './TextField';

describe('the line variant of the fields', () => {
  it('is a small muted label over the value, with a hairline under it and no box', () => {
    render(<TextField variant="line" label="Symbol" defaultValue="KO" />);
    const input = screen.getByLabelText('Symbol');
    expect(input).toHaveValue('KO');
    expect(screen.getByText('Symbol')).toHaveClass('text-muted', 'text-[13px]', 'font-bold');
    // 16px extra-bold, 44px tall, only a bottom border.
    expect(input).toHaveClass('text-base', 'font-extrabold', 'h-11', 'border-b', 'border-border');
    expect(input).not.toHaveClass('border', 'rounded-md', 'border-border-strong');
  });

  it('turns the line ink and 2px thick on focus, without a box around the field', () => {
    render(<TextField variant="line" label="Symbol" />);
    const input = screen.getByLabelText('Symbol');
    expect(input).toHaveClass('focus:border-text', 'focus:border-b-2', 'focus:outline-none');
  });

  it('puts an error under the line, and turns the line danger', () => {
    render(<TextField variant="line" label="Symbol" error="Use letters and numbers only" />);
    const input = screen.getByLabelText('Symbol');
    expect(input).toBeInvalid();
    expect(input).toHaveClass('border-b', 'border-danger', 'focus:border-b-2');
    expect(input).not.toHaveClass('border-border', 'focus:border-text');
    expect(input).toHaveAccessibleDescription('Use letters and numbers only');
    expect(screen.getByText('Use letters and numbers only')).toHaveClass('text-danger');
  });

  it('keeps the box when no variant is asked for', () => {
    render(<TextField label="Name" />);
    expect(screen.getByLabelText('Name')).toHaveClass('border', 'rounded-md', 'h-11');
  });

  it('is a date field too', () => {
    render(
      <TextField variant="line" type="date" label="Purchase date" defaultValue="2026-10-14" />,
    );
    const input = screen.getByLabelText('Purchase date');
    expect(input).toHaveValue('2026-10-14');
    expect(input).toHaveClass('border-b', 'font-extrabold');
  });

  it('lets the shared date field take a label and the line look', async () => {
    const onChange = vi.fn();
    render(
      <DateField
        label="Sale date"
        variant="line"
        value="2026-10-14"
        today="2026-10-14"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Sale date');
    expect(input).toHaveAttribute('max', '2026-10-14');
    expect(input).toHaveClass('border-b');
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();
  });

  it('keeps the label "Date" for the shared date field by default', () => {
    render(<DateField value="2026-10-14" today="2026-10-14" onChange={() => {}} />);
    expect(screen.getByLabelText('Date')).toHaveClass('border', 'rounded-md');
  });

  it('is a money field that keeps its parsing, its symbol and its error', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<number | null>(null);
      return (
        <MoneyField
          variant="line"
          label="Price"
          currency="USD"
          value={value}
          onChange={(v) => {
            setValue(v);
            onChange(v);
          }}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText('Price');
    expect(input).toHaveClass('border-b', 'font-extrabold', 'h-11');
    expect(input).not.toHaveClass('rounded-md');
    expect(screen.getByText(currencySymbol('USD'))).toBeInTheDocument();
    await userEvent.type(input, '12,5');
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(1250);
    expect(input).toHaveValue('12.50');

    await userEvent.clear(input);
    await userEvent.type(input, 'abc');
    await userEvent.tab();
    expect(input).toHaveAccessibleDescription('Enter an amount like 12.50');
    expect(input).toHaveClass('border-danger');
  });

  it('is a select too', () => {
    render(
      <Select
        variant="line"
        label="Type"
        value="stock"
        options={[{ value: 'stock', label: 'Stock' }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Type')).toHaveClass('border-b', 'font-extrabold');
    expect(screen.getByLabelText('Type')).not.toHaveClass('rounded-md');
  });
});

describe('RadioGroup as underline tabs', () => {
  it('keeps the radios and marks the choice with an ink underline', async () => {
    const onChange = vi.fn();
    render(
      <RadioGroup
        variant="underline"
        legend="Paid from"
        value="owned"
        onChange={onChange}
        options={[
          { value: 'owned', label: 'Already owned' },
          { value: 'cash', label: 'Cash' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Already owned' })).toBeChecked();
    const on = screen.getByText('Already owned');
    expect(on).toHaveClass('border-text', 'border-b-2', 'min-h-11');
    expect(screen.getByText('Cash')).toHaveClass('border-transparent', 'text-muted');
    await userEvent.click(screen.getByRole('radio', { name: 'Cash' }));
    expect(onChange).toHaveBeenCalledWith('cash');
  });
});

function Stepper({ start = '', onText }: { start?: string; onText?(t: string): void }) {
  const [value, setValue] = useState(start);
  return (
    <ShareStepper
      label="Shares"
      value={value}
      onChange={(t) => {
        setValue(t);
        onText?.(t);
      }}
    />
  );
}

describe('ShareStepper', () => {
  it('ties the label to a typable 20px extra-bold decimal input', () => {
    render(<Stepper start="40" />);
    const input = screen.getByLabelText('Shares');
    expect(input).toHaveValue('40');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveClass('text-[20px]', 'font-extrabold');
    expect(screen.getByText('Shares')).toHaveClass('text-muted', 'text-[13px]');
  });

  it('has a Fewer shares and a More shares button, each with a 44px hit area', () => {
    render(<Stepper start="40" />);
    for (const name of ['Fewer shares', 'More shares']) {
      expect(screen.getByRole('button', { name })).toHaveClass('size-11');
    }
  });

  it('names its buttons after what it counts, when told', () => {
    render(<ShareStepper label="Quantity" unit="items" value="1" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Fewer items' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More items' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shares/ })).not.toBeInTheDocument();
  });

  it('steps by 1 with + and −', async () => {
    render(<Stepper start="40" />);
    await userEvent.click(screen.getByRole('button', { name: 'More shares' }));
    expect(screen.getByLabelText('Shares')).toHaveValue('41');
    await userEvent.click(screen.getByRole('button', { name: 'Fewer shares' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fewer shares' }));
    expect(screen.getByLabelText('Shares')).toHaveValue('39');
  });

  it('steps from a typed fraction, and writes the result as the form would read it', async () => {
    render(<Stepper start="2.5" />);
    await userEvent.click(screen.getByRole('button', { name: 'More shares' }));
    expect(screen.getByLabelText('Shares')).toHaveValue('3.5');
    await userEvent.click(screen.getByRole('button', { name: 'Fewer shares' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fewer shares' }));
    expect(screen.getByLabelText('Shares')).toHaveValue('1.5');
    // No floating-point dust: 1.1 + 1 is 2.1, not 2.1000000000000001.
    await userEvent.clear(screen.getByLabelText('Shares'));
    await userEvent.type(screen.getByLabelText('Shares'), '1,1');
    await userEvent.click(screen.getByRole('button', { name: 'More shares' }));
    expect(screen.getByLabelText('Shares')).toHaveValue('2.1');
  });

  it('refuses to step down to 0 or below', async () => {
    render(<Stepper start="1" />);
    const fewer = screen.getByRole('button', { name: 'Fewer shares' });
    expect(fewer).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Shares'), '.5');
    // 1.5 steps down to 0.5, and 0.5 would step down to -0.5.
    expect(fewer).toBeEnabled();
    await userEvent.click(fewer);
    expect(screen.getByLabelText('Shares')).toHaveValue('0.5');
    expect(fewer).toBeDisabled();
  });

  it('starts from nothing at 1, and has no step down while empty or unreadable', async () => {
    render(<Stepper />);
    expect(screen.getByRole('button', { name: 'Fewer shares' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'More shares' }));
    expect(screen.getByLabelText('Shares')).toHaveValue('1');
    await userEvent.clear(screen.getByLabelText('Shares'));
    await userEvent.type(screen.getByLabelText('Shares'), 'abc');
    expect(screen.getByRole('button', { name: 'Fewer shares' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'More shares' }));
    expect(screen.getByLabelText('Shares')).toHaveValue('1');
  });

  it('still takes a typed fraction, as the text it was typed', async () => {
    const onText = vi.fn();
    render(<Stepper start="1" onText={onText} />);
    await userEvent.clear(screen.getByLabelText('Shares'));
    await userEvent.type(screen.getByLabelText('Shares'), '0,25');
    expect(onText).toHaveBeenLastCalledWith('0,25');
    expect(screen.getByLabelText('Shares')).toHaveValue('0,25');
  });

  it('puts an error under the line', () => {
    render(
      <ShareStepper label="Shares" value="0" onChange={() => {}} error="Enter how many shares" />,
    );
    const input = screen.getByLabelText('Shares');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('Enter how many shares');
  });

  it('does not submit a form when a button is pressed', async () => {
    const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Stepper start="3" />
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'More shares' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
