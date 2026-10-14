import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface SelectProps {
  label: string;
  value: string;
  onChange(value: string): void;
  options: Array<{ value: string; label: string }>;
  hint?: string;
  error?: string;
  className?: string;
}

export function Select({ label, value, onChange, options, hint, error, className }: SelectProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={cn(
            'text-text h-11 w-full appearance-none rounded-md border bg-transparent pr-9 pl-3 text-base',
            error ? 'border-danger' : 'border-border-strong',
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="text-muted pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        />
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
    </div>
  );
}
