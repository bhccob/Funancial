import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { usePaidWithOptions } from './paidWith';

/** The most ways to pay that fit as tabs: cash, debit and other, with one card. */
const MAX_TABS = 4;

/** "Paid with" in the line style: tabs for a few ways to pay, a select once cards crowd them. */
export function PaidWithField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange(value: string): void;
  hint?: string;
}) {
  const options = usePaidWithOptions();
  return options.length <= MAX_TABS ? (
    <RadioGroup
      variant="underline"
      legend="Paid with"
      value={value}
      options={options}
      onChange={onChange}
      hint={hint}
    />
  ) : (
    <Select
      variant="line"
      label="Paid with"
      value={value}
      options={options}
      onChange={onChange}
      hint={hint}
    />
  );
}
