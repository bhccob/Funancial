import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  hint?: string;
}

export function Switch({ label, checked, onChange, hint }: SwitchProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-bold">
          {label}
        </label>
        {hint && (
          <p id={hintId} className="text-muted text-sm">
            {hint}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hintId}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none',
          checked ? 'bg-primary' : 'bg-border-strong',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'bg-primary-contrast absolute top-1 left-1 size-5 rounded-full shadow transition-transform motion-reduce:transition-none',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}
