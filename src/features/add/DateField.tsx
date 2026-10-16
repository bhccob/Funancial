import { TextField } from '@/components/ui/TextField';
import type { FieldVariant } from '@/components/ui/lineField';
import type { LocalDate } from '@/domain/dates';

export function DateField({
  value,
  onChange,
  today,
  error,
  label = 'Date',
  variant,
}: {
  value: string;
  onChange(value: string): void;
  today: LocalDate;
  error?: string;
  label?: string;
  variant?: FieldVariant;
}) {
  return (
    <TextField
      label={label}
      variant={variant}
      type="date"
      max={today}
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
