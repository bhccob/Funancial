import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { lineLabel } from './lineField';
import { underlineTab } from './underlineTab';

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  /** Drawn before the label of a pill (`variant="pills"`), for the eye only. */
  icon?: LucideIcon;
}

export interface RadioGroupProps<T extends string> {
  legend: string;
  value: T;
  options: RadioOption<T>[];
  onChange(value: T): void;
  /**
   * `underline` is the Invest forms' tabs: no well, the choice marked by a line under it.
   * `pills` is the add forms' choices: a 32px glass pill each, the chosen one solid.
   */
  variant?: 'segmented' | 'underline' | 'pills';
  /** Said under the choices, which it describes. */
  hint?: string;
  /** Said under the choices in danger, which it describes. */
  error?: string;
  /** Added to each choice, e.g. a width for one-character labels. */
  optionClassName?: string;
}

/** Native radios presented as a segmented control, as underline tabs, or as pills. */
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
  const pills = variant === 'pills';
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}
    >
      <legend className={underline || pills ? cn(lineLabel, 'mb-0.5') : 'mb-2 text-sm font-bold'}>
        {legend}
      </legend>
      <div
        className={
          underline
            ? // Up to three tabs sit 20px apart; more are 12px apart, so four fit a dialog row.
              cn('flex max-w-full flex-wrap', options.length > 3 ? 'gap-x-3' : 'gap-x-5')
            : pills
              ? // 12px between rows of 32px pills puts their 44px tap areas edge to edge.
                'flex max-w-full flex-wrap gap-x-2 gap-y-3'
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
                : pills
                  ? cn(
                      'press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-extrabold whitespace-nowrap',
                      // Solid, not glass: the glass shorthand would paint over a fill.
                      value === o.value
                        ? 'bg-primary text-primary-contrast border-primary border'
                        : 'glass text-text',
                    )
                  : cn(
                      'flex min-h-11 items-center rounded-[10px] px-3.5 text-sm font-bold',
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
              className={cn(
                'absolute m-0 cursor-pointer appearance-none opacity-0',
                pills
                  ? // The radio is the 44px tap area of a 32px pill (`hit-44`'s pseudo-element would sit over
                    // it, and a script that clicks the radio would find the label in the way).
                    'top-1/2 left-1/2 h-11 w-full min-w-11 -translate-x-1/2 -translate-y-1/2 rounded-full'
                  : 'inset-0 rounded-[10px]',
              )}
            />
            {pills && o.icon && <o.icon aria-hidden="true" className="size-3.5" />}
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
        <p id={errorId} role="alert" className="text-danger text-sm font-semibold">
          {error}
        </p>
      )}
    </fieldset>
  );
}
