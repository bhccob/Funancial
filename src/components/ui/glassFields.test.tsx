import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Utensils } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DateField } from '@/features/add/DateField';
import { ROWS } from '@/features/shared/PlainSection';
import { currencySymbol } from '@/domain/money';
import { MoneyField } from './MoneyField';
import { RadioGroup } from './RadioGroup';
import { ROW_LINE } from './rowField';
import { Select } from './Select';
import { TextField } from './TextField';

/** The hairline under the row that holds `control`: the one element with the border. */
const hairlineOf = (control: HTMLElement) => control.closest<HTMLElement>('.border-b')!;

describe('the row variant of the fields', () => {
  it('keeps its hairline the same as the plain lists', () => {
    // ROWS draws it as a divide between siblings, ROW_LINE as the bottom border of one row.
    expect(ROWS).toContain('divide-black/7');
    expect(ROWS).toContain('dark:divide-white/8');
    expect(ROW_LINE).toContain('border-black/7');
    expect(ROW_LINE).toContain('dark:border-white/8');
  });

  it('is a label on the left and the value on the right, a hairline under them and no box', () => {
    render(<TextField variant="row" label="Note" autoComplete="off" defaultValue="Lunch" />);
    const input = screen.getByLabelText('Note');
    expect(input).toHaveValue('Lunch');
    const label = screen.getByText('Note');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveClass('text-text', 'font-bold', 'shrink-0', 'self-stretch');
    // The label and the value share one row; the value takes the rest of it, right-aligned.
    expect(label.parentElement).toBe(input.parentElement);
    expect(label.parentElement).toHaveClass('flex', 'items-center', 'min-h-[46px]');
    expect(input).toHaveClass('flex-1', 'text-right', 'text-muted', 'bg-transparent', 'h-11');
    // A date input's fields are right-aligned too, which `text-right` alone does not do.
    expect(input.className).toContain('[&::-webkit-datetime-edit]:justify-end');
    expect(input).not.toHaveClass('border', 'border-b', 'rounded-md', 'border-border-strong');
    expect(hairlineOf(input)).toHaveClass('border-black/7', 'dark:border-white/8');
  });

  it('keeps the placeholder as muted as the value, and shows focus with the page-wide ring', () => {
    render(<TextField variant="row" label="Note" />);
    const input = screen.getByLabelText('Note');
    expect(input).toHaveClass('placeholder:text-muted', 'focus:text-text');
    // No `focus:outline-none`: the ring from the base layer is what shows focus here.
    expect(input.className).not.toContain('outline-none');
  });

  it('says a hint and an error under the row, inside its hairline, and turns the hairline danger', () => {
    const { rerender } = render(
      <TextField variant="row" label="Label" hint="Shown in Recent." className="mt-2" />,
    );
    const input = screen.getByLabelText('Label');
    expect(input).toHaveAccessibleDescription('Shown in Recent.');
    expect(screen.getByText('Shown in Recent.')).toHaveClass('text-muted', 'text-sm');
    expect(hairlineOf(input)).toContainElement(screen.getByText('Shown in Recent.'));
    expect(hairlineOf(input)).toHaveClass('mt-2');

    rerender(<TextField variant="row" label="Label" error="Add a label." />);
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('Add a label.');
    expect(screen.getByRole('alert')).toHaveTextContent('Add a label.');
    expect(screen.getByText('Add a label.')).toHaveClass('text-danger', 'font-semibold');
    expect(hairlineOf(input)).toHaveClass('border-danger', 'dark:border-danger');
    expect(hairlineOf(input)).not.toHaveClass('border-black/7');
  });

  it('is a date field too, and keeps the max and the label of the shared date field', () => {
    const onChange = vi.fn();
    render(
      <DateField
        variant="row"
        value="2026-10-14"
        today="2026-10-14"
        error="Use today or an earlier date."
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Date');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveAttribute('max', '2026-10-14');
    expect(input).toHaveClass('text-right', 'h-11');
    expect(input).not.toHaveClass('rounded-md', 'border-b');
    expect(input).toHaveAccessibleDescription('Use today or an earlier date.');
  });

  it('is a native select with the label on the left and a chevron after the value', async () => {
    const onChange = vi.fn();
    render(
      <Select
        variant="row"
        label="Paid with"
        value="main"
        onChange={onChange}
        options={[
          { value: 'main', label: 'Main account' },
          { value: 'savings', label: 'Savings' },
        ]}
        hint="Adds to the card balance."
      />,
    );
    const select = screen.getByLabelText('Paid with');
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveValue('main');
    expect(select).toHaveClass('appearance-none', 'text-right', 'text-muted', 'h-11');
    expect(select).not.toHaveClass('border', 'border-b', 'rounded-md');
    expect(screen.getByText('Paid with')).toHaveClass('text-text', 'font-bold');
    expect(screen.getByText('Paid with').parentElement).toHaveClass('flex', 'min-h-[46px]');
    // The mark is drawn, never read, and never takes a tap from the select under it.
    const chevron = select.parentElement!.querySelector('svg')!;
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
    expect(chevron).toHaveClass('pointer-events-none', 'text-muted');
    expect(select).toHaveAccessibleDescription('Adds to the card balance.');
    expect(hairlineOf(select)).toHaveClass('border-black/7', 'dark:border-white/8');

    await userEvent.selectOptions(select, 'Savings');
    expect(onChange).toHaveBeenCalledWith('savings');
  });

  it('dims a disabled select row and turns its hairline danger with an error', () => {
    render(
      <Select
        variant="row"
        label="Goes to"
        value=""
        onChange={() => {}}
        options={[]}
        disabled
        error="Pick an account."
      />,
    );
    const select = screen.getByLabelText('Goes to');
    expect(select).toBeDisabled();
    expect(select).toBeInvalid();
    expect(hairlineOf(select)).toHaveClass('opacity-45', 'border-danger');
    expect(screen.getByRole('alert')).toHaveTextContent('Pick an account.');
  });

  it('leaves the line and the box looks as they were', () => {
    render(
      <>
        <TextField variant="line" label="Line" />
        <TextField label="Box" />
      </>,
    );
    expect(screen.getByLabelText('Line')).toHaveClass('border-b', 'font-extrabold');
    expect(screen.getByLabelText('Box')).toHaveClass('border', 'rounded-md');
    expect(screen.getByLabelText('Line')).not.toHaveClass('text-right');
    expect(screen.getByLabelText('Box')).not.toHaveClass('text-right');
  });
});

describe('MoneyField as the hero amount', () => {
  function Harness({ onValue = () => {} }: { onValue?(v: number | null): void }) {
    const [value, setValue] = useState<number | null>(null);
    return (
      <MoneyField
        size="hero"
        label="Amount"
        currency="USD"
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue(v);
        }}
      />
    );
  }

  it('is the same input with the same label, at 40px and weight 700', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Amount');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveClass('text-[40px]', 'font-bold', 'bg-transparent', 'text-text');
    expect(input).not.toHaveClass('text-base', 'text-[20px]', 'font-extrabold', 'rounded-md');
    expect(screen.getByText('Amount')).toHaveClass('text-muted', 'text-[13px]', 'font-bold');
  });

  it('dims the currency, small beside the amount, and reads it to no one', () => {
    render(<Harness />);
    const symbol = screen.getByText(currencySymbol('USD'));
    expect(symbol).toHaveClass('text-muted', 'text-[15px]');
    expect(symbol).toHaveAttribute('aria-hidden', 'true');
    // Beside the amount in one row, not laid over it: a long symbol never needs its width worked out.
    expect(symbol.parentElement).toBe(screen.getByLabelText('Amount').parentElement);
    expect(symbol.parentElement).toHaveClass('flex');
  });

  it('shows what an empty amount looks like in the currency, as a muted placeholder', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Amount')).toHaveAttribute('placeholder', '0.00');
    expect(screen.getByLabelText('Amount')).toHaveClass('placeholder:text-muted');
    render(<MoneyField size="hero" label="Yen" currency="JPY" value={null} onChange={() => {}} />);
    expect(screen.getByLabelText('Yen')).toHaveAttribute('placeholder', '0');
  });

  it('keeps its parsing, its tidying on blur and its error', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText('Amount');
    await userEvent.type(input, '12,5');
    await userEvent.tab();
    expect(onValue).toHaveBeenLastCalledWith(1250);
    expect(input).toHaveValue('12.50');

    await userEvent.clear(input);
    await userEvent.type(input, 'abc');
    await userEvent.tab();
    expect(input).toHaveAccessibleDescription('Enter an amount like 12.50');
    expect(input).toBeInvalid();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount like 12.50');
    // The line under the currency and the figure turns danger.
    expect(input.parentElement).toHaveClass('border-b-2', 'border-danger');
    expect(input.parentElement).not.toHaveClass('focus-within:border-text');
    // The danger line cannot also show focus (it would stay danger), so the row takes the page's ring
    // while the figure has focus: the figure has no outline of its own.
    expect(input.parentElement).toHaveClass(
      'focus-within:outline-2',
      'focus-within:outline-offset-2',
      'focus-within:outline-focus',
    );
    expect(input).toHaveClass('focus:outline-none');
  });

  it('keeps focus on open when asked, and shows it as a 2px ink line under the amount', () => {
    render(
      <MoneyField
        size="hero"
        autoFocus
        label="Amount"
        currency="USD"
        value={null}
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Amount');
    expect(input).toHaveFocus();
    // The line under the currency and the figure is always 2px (clear at rest), so nothing moves
    // when it turns ink while the figure has focus; the figure has no ring of its own.
    const row = input.parentElement!;
    expect(row).toHaveClass('border-b-2', 'border-transparent', 'focus-within:border-text');
    // Without an error the ink line is the cue; no ring round the row.
    expect(row).not.toHaveClass('focus-within:outline-2');
    expect(input).toHaveClass('focus:outline-none');
    expect(input).not.toHaveClass('border-b-2');
  });

  it('starts from a given value', () => {
    render(
      <MoneyField size="hero" label="Amount" currency="EUR" value={123456} onChange={() => {}} />,
    );
    expect(screen.getByLabelText('Amount')).toHaveValue('1,234.56');
    expect(screen.getByText('€')).toBeInTheDocument();
  });

  it('leaves the other sizes as they were', () => {
    render(<MoneyField label="Price" currency="USD" value={null} onChange={() => {}} />);
    expect(screen.getByLabelText('Price')).toHaveClass('h-11', 'text-base', 'rounded-md');
    expect(screen.getByLabelText('Price')).not.toHaveClass('text-[40px]');
  });
});

describe('MoneyField as a row', () => {
  function Harness({
    onValue = () => {},
    error,
  }: {
    onValue?(v: number | null): void;
    error?: string;
  }) {
    const [value, setValue] = useState<number | null>(null);
    return (
      <MoneyField
        variant="row"
        label="Monthly take-home pay"
        currency="USD"
        value={value}
        error={error}
        hint="Leave empty if you don't have a regular salary."
        onChange={(v) => {
          setValue(v);
          onValue(v);
        }}
      />
    );
  }

  it('is the label on the left and the amount on the right, a hairline under them and no box', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Monthly take-home pay');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    const label = screen.getByText('Monthly take-home pay');
    expect(label).toHaveClass('text-text', 'font-bold', 'shrink-0', 'self-stretch');
    expect(input).toHaveClass('text-right', 'h-11', 'text-muted', 'bg-transparent');
    expect(input).not.toHaveClass('border', 'border-b', 'rounded-md', 'font-extrabold');
    expect(hairlineOf(input)).toHaveClass('border-black/7', 'dark:border-white/8');
    expect(hairlineOf(input)).toContainElement(label);
  });

  it('puts the currency in front of the amount, small and dimmed, and reads it to no one', () => {
    render(<Harness />);
    const symbol = screen.getByText(currencySymbol('USD'));
    expect(symbol).toHaveClass('text-muted', 'text-[15px]');
    expect(symbol).toHaveAttribute('aria-hidden', 'true');
    // Beside the amount in one row, so a long symbol never needs its width worked out.
    expect(symbol.parentElement).toBe(screen.getByLabelText('Monthly take-home pay').parentElement);
    expect(symbol.parentElement).toHaveClass('flex', 'justify-end');
  });

  it('shows what an empty amount looks like, as a muted placeholder', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Monthly take-home pay')).toHaveAttribute('placeholder', '0.00');
  });

  it('is as wide as its figures, with one minimum width', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Monthly take-home pay');
    expect(input).toHaveClass('field-sizing-content', 'min-w-[4ch]');
    // Not also `min-w-0`: two minimum widths would leave the one that wins to the order of the CSS.
    expect(input).not.toHaveClass('min-w-0');
  });

  it('keeps its parsing and its tidying on blur', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText('Monthly take-home pay');
    await userEvent.type(input, '4.200,5');
    await userEvent.tab();
    expect(onValue).toHaveBeenLastCalledWith(420050);
    expect(input).toHaveValue('4,200.50');
  });

  it('says a hint and an error under the row, inside its hairline, and turns the hairline danger', async () => {
    const { rerender } = render(<Harness />);
    const input = screen.getByLabelText('Monthly take-home pay');
    expect(input).toHaveAccessibleDescription("Leave empty if you don't have a regular salary.");
    expect(hairlineOf(input)).toContainElement(
      screen.getByText("Leave empty if you don't have a regular salary."),
    );

    await userEvent.type(input, 'abc');
    await userEvent.tab();
    const unreadable = screen.getByRole('alert');
    expect(unreadable).toHaveTextContent('Enter an amount like 12.50');
    expect(input).toBeInvalid();
    expect(hairlineOf(input)).toContainElement(unreadable);
    expect(hairlineOf(input)).toHaveClass('border-danger');

    rerender(<Harness error="Enter your pay." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your pay.');
  });

  it('leaves the line look as it was', () => {
    render(
      <MoneyField variant="line" label="Line" currency="USD" value={null} onChange={() => {}} />,
    );
    expect(screen.getByLabelText('Line')).toHaveClass('border-b', 'font-extrabold');
    expect(screen.getByLabelText('Line')).not.toHaveClass('text-right');
  });
});

describe('RadioGroup as pills', () => {
  const options = [
    { value: 'food', label: 'Food', icon: Utensils },
    { value: 'rent', label: 'Rent' },
    { value: 'fun', label: 'Fun' },
  ];
  const group = (value = 'food', onChange: (v: string) => void = () => {}) =>
    render(
      <RadioGroup
        variant="pills"
        legend="Category"
        value={value}
        onChange={onChange}
        options={options}
      />,
    );

  it('keeps the radios, their names and the group name', () => {
    group();
    expect(screen.getByRole('group', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'Food',
      'Rent',
      'Fun',
    ]);
    expect(screen.getByRole('radio', { name: 'Food' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Rent' })).not.toBeChecked();
    // One group: the radios share a name, which is what the arrow keys walk.
    const names = new Set(screen.getAllByRole('radio').map((r) => r.getAttribute('name')));
    expect(names.size).toBe(1);
  });

  it('draws each option as a 32px glass pill with a 44px tap area', () => {
    group();
    const rent = screen.getByText('Rent');
    expect(rent).toHaveClass('glass', 'h-8', 'rounded-full', 'press', 'text-text');
    expect(rent).not.toHaveClass('bg-primary');
    expect(rent).toHaveClass('font-extrabold');
    // The radio, which a tap and a script's click both land on, is 44px tall and centred on the
    // pill; `hit-44`'s pseudo-element would sit over the radio and take a script's click.
    const radio = screen.getByRole('radio', { name: 'Rent' });
    expect(radio).toHaveClass('h-11', 'w-full', 'min-w-11', 'top-1/2', '-translate-y-1/2');
    expect(radio.parentElement).toBe(rent);
    expect(rent).not.toHaveClass('hit-44');
  });

  it('makes the chosen pill solid, in the colours of a primary button', () => {
    group();
    const food = screen.getByText('Food');
    expect(food).toHaveClass('bg-primary', 'text-primary-contrast', 'h-8', 'rounded-full');
    // Solid, not glass: the glass shorthand would paint over the fill.
    expect(food).not.toHaveClass('glass');
  });

  it('draws an option’s icon before its label, for the eye only', () => {
    group();
    const icon = screen.getByText('Food').querySelector('svg')!;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('size-3.5');
    expect(screen.getByText('Rent').querySelector('svg')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Food' })).toBeInTheDocument();
  });

  it('lays the pills out in rows that wrap, 44px apart so the tap areas do not overlap', () => {
    group();
    const row = screen.getByText('Food').parentElement!;
    expect(row).toHaveClass('flex', 'flex-wrap', 'gap-x-2', 'gap-y-3');
    expect(row).not.toHaveClass('bg-surface-2', 'rounded-[14px]');
  });

  it('draws compact pills 8px in from each end, 6px apart, for four choices in a dialog row', () => {
    render(
      <RadioGroup
        variant="pills"
        compact
        legend="Cycle"
        value="a"
        onChange={() => {}}
        options={[
          { value: 'a', label: 'Weekly' },
          { value: 'b', label: 'Monthly' },
          { value: 'c', label: 'Quarterly' },
          { value: 'd', label: 'Yearly' },
        ]}
      />,
    );
    const pill = screen.getByText('Monthly');
    expect(pill).toHaveClass('glass', 'h-8', 'rounded-full', 'px-2', 'text-[12px]');
    expect(pill).not.toHaveClass('px-3', 'text-[12.5px]');
    expect(screen.getByText('Weekly')).toHaveClass('bg-primary', 'px-2');
    expect(pill.parentElement).toHaveClass('gap-x-1.5', 'gap-y-3');
    expect(pill.parentElement).not.toHaveClass('gap-x-2');
  });

  it('says its legend as a small muted label above the pills', () => {
    group();
    expect(screen.getByText('Category').tagName).toBe('LEGEND');
    expect(screen.getByText('Category')).toHaveClass('text-muted', 'text-[13px]', 'font-bold');
  });

  it('changes the choice on a tap and moves the choice with the arrow keys', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState('food');
      return (
        <RadioGroup
          variant="pills"
          legend="Category"
          value={value}
          onChange={(v) => {
            setValue(v);
            onChange(v);
          }}
          options={options}
        />
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole('radio', { name: 'Rent' }));
    expect(onChange).toHaveBeenLastCalledWith('rent');
    expect(screen.getByText('Rent')).toHaveClass('bg-primary');
    expect(screen.getByText('Food')).toHaveClass('glass');

    screen.getByRole('radio', { name: 'Rent' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('fun');
    expect(screen.getByRole('radio', { name: 'Fun' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Fun' })).toHaveFocus();
  });

  it('rings the pill itself when its radio has the keyboard focus', () => {
    group();
    expect(screen.getByText('Food')).toHaveClass(
      'has-[:focus-visible]:outline-focus',
      'has-[:focus-visible]:outline-2',
    );
  });

  it('says a hint and an error under the pills, as the other groups do', () => {
    render(
      <RadioGroup
        variant="pills"
        legend="Source"
        value="food"
        onChange={() => {}}
        options={options}
        hint="Pick one."
        error="Pick again."
      />,
    );
    expect(screen.getByRole('group', { name: 'Source' })).toHaveAccessibleDescription(
      'Pick one. Pick again.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Pick again.');
  });

  it('leaves the segmented and underline looks as they were', () => {
    render(
      <>
        <RadioGroup
          legend="Show"
          value="a"
          onChange={() => {}}
          options={[{ value: 'a', label: 'A' }]}
        />
        <RadioGroup
          variant="underline"
          legend="Pick"
          value="b"
          onChange={() => {}}
          options={[{ value: 'b', label: 'B' }]}
        />
      </>,
    );
    expect(screen.getByText('A')).toHaveClass('bg-overlay', 'min-h-11');
    expect(screen.getByText('A')).not.toHaveClass('glass');
    expect(screen.getByText('B')).toHaveClass('border-b-2', 'border-text');
  });
});
