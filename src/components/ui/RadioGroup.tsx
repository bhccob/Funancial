import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface RadioOption<T extends string> {
  value: T;
  label: string;
}

export interface RadioGroupProps<T extends string> {
  legend: string;
  value: T;
  options: RadioOption<T>[];
  onChange(value: T): void;
}

/** Native radios styled as chunky segment buttons. */
export function RadioGroup<T extends string>({
  legend,
  value,
  options,
  onChange,
}: RadioGroupProps<T>) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 px-3 font-bold',
              'has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
              value === o.value
                ? 'border-primary bg-surface text-primary shadow-[0_2px_0_var(--color-primary-shade)]'
                : 'border-border-strong text-text shadow-[0_2px_0_var(--color-border-strong)]',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="accent-primary size-4"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
