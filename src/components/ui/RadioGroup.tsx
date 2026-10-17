import { useId } from 'react';
import { cn } from '@/lib/cn';
import { lineLabel } from './lineField';
import { underlineTab } from './underlineTab';

export interface RadioOption<T extends string> {
  value: T;
  label: string;
}

export interface RadioGroupProps<T extends string> {
  legend: string;
  value: T;
  options: RadioOption<T>[];
  onChange(value: T): void;
  /** `underline` is the Invest forms' tabs: no well, the choice marked by a line under it. */
  variant?: 'segmented' | 'underline';
  /** Said under the choices, which it describes. */
  hint?: string;
  /** Said under the choices in danger, which it describes. */
  error?: string;
  /** Added to each choice, e.g. a width for one-character labels. */
  optionClassName?: string;
}

/** Native radios presented as a segmented control, or as underline tabs. */
export function RadioGroup<T extends string>({
  legend,
  value,
  options,
  onChange,
  variant = 'segmented',
  hint,
  error,
  optionClassName,
}: RadioGroupProps<T>) {
  const name = useId();
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;
  const underline = variant === 'underline';
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}
    >
      <legend className={underline ? cn(lineLabel, 'mb-0.5') : 'mb-2 text-sm font-bold'}>
        {legend}
      </legend>
      <div
        className={
          underline
            ? 'flex max-w-full flex-wrap gap-x-5'
            : 'bg-surface-2 inline-flex max-w-full flex-wrap gap-1 self-start rounded-[14px] p-1'
        }
      >
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'relative cursor-pointer',
              optionClassName,
              'has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
              underline
                ? underlineTab(value === o.value)
                : cn(
                    'flex min-h-10 items-center rounded-[10px] px-3.5 text-sm font-bold',
                    value === o.value
                      ? 'bg-overlay text-text shadow-[0_1px_3px_rgb(0_0_0/0.12)]'
                      : 'text-muted hover:text-text',
                  ),
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
      {hint && (
        <p id={hintId} className="text-muted text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-danger text-sm font-semibold">
          {error}
        </p>
      )}
    </fieldset>
  );
}
