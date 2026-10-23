import { useId, type InputHTMLAttributes } from 'react';
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

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /**
   * `line` is the lighter field of the Invest forms: the label over the value, a hairline under it.
   * `row` is the plain row of the glass look: the label on the left, the value on the right.
   */
  variant?: RowVariant;
}

export function TextField({
  label,
  hint,
  error,
  variant = 'box',
  id,
  className,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const line = variant === 'line';
  const row = variant === 'row';

  const labelEl = (
    <label htmlFor={inputId} className={row ? rowLabel : line ? lineLabel : 'text-sm font-bold'}>
      {label}
    </label>
  );
  const input = (
    <input
      id={inputId}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={
        row
          ? rowControl
          : line
            ? lineInput(!!error)
            : cn(
                'text-text placeholder:text-muted h-11 rounded-md border bg-transparent px-3 text-base',
                error ? 'border-danger' : 'border-border-strong',
              )
      }
      {...rest}
    />
  );

  return (
    <div
      className={cn(
        row ? rowLine(!!error) : cn('flex flex-col', line ? 'gap-0.5' : 'gap-1.5'),
        className,
      )}
    >
      {row ? (
        <div className={ROW_LAYOUT}>
          {labelEl}
          {input}
        </div>
      ) : (
        <>
          {labelEl}
          {input}
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
