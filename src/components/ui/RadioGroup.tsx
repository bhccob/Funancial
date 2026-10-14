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

/** Native radios presented as a segmented control. */
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
      <div className="bg-surface-2 inline-flex max-w-full flex-wrap gap-1 self-start rounded-[14px] p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'relative flex min-h-10 cursor-pointer items-center rounded-[10px] px-3.5 text-sm font-bold',
              'has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
              value === o.value
                ? 'bg-overlay text-text shadow-[0_1px_3px_rgb(0_0_0/0.12)]'
                : 'text-muted hover:text-text',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-[10px] opacity-0"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
