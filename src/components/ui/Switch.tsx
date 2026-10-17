import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  hint?: string;
  /** Dimmed and inert, but still on screen: it shows what a master switch would turn on. */
  disabled?: boolean;
}

export function Switch({ label, checked, onChange, hint, disabled }: SwitchProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex items-start justify-between gap-4', disabled && 'opacity-45')}>
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
        disabled={disabled}
        onClick={() => onChange(!checked)}
        // The track is 28px tall; the invisible `before` box takes the touch target to 44px.
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full motion-safe:transition-colors',
          'before:absolute before:inset-x-0 before:-inset-y-2',
          // The off track is 3:1 against the page; the faint border colour was 1.4:1.
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'bg-primary-contrast absolute top-1 left-1 size-5 rounded-full shadow motion-safe:transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}
