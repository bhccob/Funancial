import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { lineInput, lineLabel } from './lineField';
import {
  ROW_LAYOUT,
  ROW_MESSAGE,
  rowControl,
  rowLabel,
  rowLine,
  type RowVariant,
} from './rowField';

export interface SelectProps {
  label: string;
  value: string;
  onChange(value: string): void;
  options: Array<{ value: string; label: string }>;
  hint?: string;
  error?: string;
  /** Dimmed and inert, but still on screen. */
  disabled?: boolean;
  className?: string;
  /**
   * `line` is the lighter field of the Invest forms: the label over the value, a hairline under it.
   * `row` is the plain row of the glass look: the label on the left, the value and a chevron on the right.
   */
  variant?: RowVariant;
}

export function Select({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  disabled,
  className,
  variant = 'box',
}: SelectProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const line = variant === 'line';
  const row = variant === 'row';

  const labelEl = (
    <label htmlFor={id} className={row ? rowLabel : line ? lineLabel : 'text-sm font-bold'}>
      {label}
    </label>
  );
  const Chevron = row ? ChevronRight : ChevronDown;
  const control = (
    <div className={row ? 'relative min-w-0 flex-1' : 'relative'}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={
          row
            ? // The chosen option's name is the value; `text-align-last` right-aligns it as the select draws it.
              cn(rowControl, 'w-full appearance-none pr-5 [text-align-last:right]')
            : line
              ? cn(lineInput(!!error), 'appearance-none pr-6')
              : cn(
                  'text-text h-11 w-full appearance-none rounded-md border bg-transparent pr-9 pl-3 text-base',
                  error ? 'border-danger' : 'border-border-strong',
                )
        }
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Chevron
        aria-hidden
        className={cn(
          'text-muted pointer-events-none absolute top-1/2 size-4 -translate-y-1/2',
          line || row ? 'right-0' : 'right-3',
        )}
      />
    </div>
  );

  return (
    <div
      className={cn(
        row ? rowLine(!!error) : cn('flex flex-col', line ? 'gap-0.5' : 'gap-1.5'),
        disabled && 'opacity-45',
        className,
      )}
    >
      {row ? (
        <div className={ROW_LAYOUT}>
          {labelEl}
          {control}
        </div>
      ) : (
        <>
          {labelEl}
          {control}
        </>
      )}
      {hint && (
        <p id={hintId} className={cn('text-muted text-sm', row && ROW_MESSAGE)}>
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className={cn('text-danger text-sm font-semibold', row && ROW_MESSAGE)}
        >
          {error}
        </p>
      )}
    </div>
  );
}
