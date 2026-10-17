import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { lineInput, lineLabel, type FieldVariant } from './lineField';

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
  /** `line` is the lighter field of the Invest forms: the label over the value, a hairline under it. */
  variant?: FieldVariant;
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
  return (
    <div
      className={cn(
        'flex flex-col',
        line ? 'gap-0.5' : 'gap-1.5',
        disabled && 'opacity-45',
        className,
      )}
    >
      <label htmlFor={id} className={line ? lineLabel : 'text-sm font-bold'}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={
            line
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
        <ChevronDown
          aria-hidden
          className={cn(
            'text-muted pointer-events-none absolute top-1/2 size-4 -translate-y-1/2',
            line ? 'right-0' : 'right-3',
          )}
        />
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
    </div>
  );
}
