import { TextField } from '@/components/ui/TextField';
import type { LocalDate } from '@/domain/dates';

export function DateField({
  value,
  onChange,
  today,
  error,
}: {
  value: string;
  onChange(value: string): void;
  today: LocalDate;
  error?: string;
}) {
  return (
    <TextField
      label="Date"
      type="date"
      max={today}
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
