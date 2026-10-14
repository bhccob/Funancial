import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { MoneyField } from './MoneyField';

function Harness({ onValue }: { onValue(v: number | null): void }) {
  const [value, setValue] = useState<number | null>(null);
  return (
    <MoneyField
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

it('reads a comma decimal and tidies it on blur', async () => {
  const onValue = vi.fn();
  render(<Harness onValue={onValue} />);
  const field = screen.getByLabelText('Amount');
  await userEvent.type(field, '12,5');
  await userEvent.tab();
  expect(onValue).toHaveBeenLastCalledWith(1250);
  expect(field).toHaveValue('12.50');
  expect(field).toHaveAttribute('inputmode', 'decimal');
});

it('explains an amount it cannot read', async () => {
  const onValue = vi.fn();
  render(<Harness onValue={onValue} />);
  const field = screen.getByLabelText('Amount');
  await userEvent.type(field, 'abc');
  await userEvent.tab();
  expect(onValue).toHaveBeenLastCalledWith(null);
  expect(field).toHaveAccessibleDescription('Enter an amount like 12.50');
  expect(field).toHaveAttribute('aria-invalid', 'true');
});

it('shows the currency symbol and starts from a given value', () => {
  render(<MoneyField label="Balance" currency="EUR" value={123456} onChange={() => {}} />);
  expect(screen.getByLabelText('Balance')).toHaveValue('1,234.56');
  expect(screen.getByText('€')).toBeInTheDocument();
});
