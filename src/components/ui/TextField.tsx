import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { lineInput, lineLabel, type FieldVariant } from './lineField';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** `line` is the lighter field of the Invest forms: the label over the value, a hairline under it. */
  variant?: FieldVariant;
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

  return (
    <div className={cn('flex flex-col', line ? 'gap-0.5' : 'gap-1.5', className)}>
      <label htmlFor={inputId} className={line ? lineLabel : 'text-sm font-bold'}>
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={
          line
            ? lineInput(!!error)
            : cn(
                'text-text placeholder:text-muted h-11 rounded-md border bg-transparent px-3 text-base',
                error ? 'border-danger' : 'border-border-strong',
              )
        }
        {...rest}
      />
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
    </div>
  );
}
