import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { IconChip } from './IconChip';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  hint?: string;
  /** Dimmed and inert, but still on screen: it shows what a master switch would turn on. */
  disabled?: boolean;
  /**
   * `row` is a plain row of a list: a 54px row with the title and its line on the left and the
   * switch on the right, as the wireframe's Settings draws one. The default is the line a form has.
   */
  variant?: 'default' | 'row';
  /** Drawn in a round glass chip before the title of a `row`, for the eye only. */
  icon?: LucideIcon;
  /** Added to the row (the switch, its title and its line), e.g. room to line up under a chip. */
  className?: string;
}

export function Switch({
  label,
  checked,
  onChange,
  hint,
  disabled,
  variant = 'default',
  icon,
  className,
}: SwitchProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const row = variant === 'row';
  return (
    <div
      className={cn(
        'flex justify-between',
        row ? 'min-h-[54px] items-center gap-3 py-2' : 'items-start gap-4',
        disabled && 'opacity-45',
        className,
      )}
    >
      {row && icon && <IconChip icon={icon} />}
      <div className={cn('flex flex-col gap-0.5', row && 'min-w-0 flex-1')}>
        <label htmlFor={id} className={row ? 'text-[15px] font-extrabold' : 'text-sm font-bold'}>
          {label}
        </label>
        {hint && (
          <p
            id={hintId}
            className={cn('text-muted', row ? 'text-[13px] font-semibold' : 'text-sm')}
          >
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
