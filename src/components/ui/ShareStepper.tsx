import { useId } from 'react';
import { formatDecimal, parseDecimal } from '@/domain/money';
import { cn } from '@/lib/cn';
import { lineLabel } from './lineField';

export interface ShareStepperProps {
  label: string;
  /** What is typed: a number of shares as text, which `parseDecimal` reads. */
  value: string;
  onChange(text: string): void;
  error?: string;
}

/** A round − or +, 30px to look at inside a 44px hit area. */
function StepButton({
  name,
  disabled,
  onClick,
  children,
}: {
  name: string;
  disabled?: boolean;
  onClick(): void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 flex-none place-items-center disabled:opacity-45"
    >
      <span
        aria-hidden="true"
        className="border-border-strong grid size-[30px] place-items-center rounded-full border text-[17px] leading-none font-extrabold"
      >
        {children}
      </span>
    </button>
  );
}

/**
 * The number of shares, typable (a fraction works) with a − and a + that step it by 1. − is off
 * when a step down would reach 0 or less.
 */
export function ShareStepper({ label, value, onChange, error }: ShareStepperProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  // What is not a number steps from 0, as an empty field does.
  const shares = parseDecimal(value) ?? 0;
  const step = (by: number) => onChange(formatDecimal(shares + by));

  return (
    <div>
      <div
        className={cn(
          // The line is 2px tall either way: a hairline and a pixel of padding, or the thick line.
          'flex items-center gap-1 border-b pb-px focus-within:border-b-2 focus-within:pb-0',
          error ? 'border-danger' : 'border-border focus-within:border-text',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col py-1">
          <label htmlFor={id} className={lineLabel}>
            {label}
          </label>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            onChange={(e) => onChange(e.target.value)}
            className="text-text h-8 w-full min-w-0 bg-transparent text-[20px] font-extrabold tabular-nums focus:outline-none"
          />
        </div>
        <StepButton name="Fewer shares" disabled={shares - 1 <= 0} onClick={() => step(-1)}>
          −
        </StepButton>
        <StepButton name="More shares" onClick={() => step(1)}>
          +
        </StepButton>
      </div>
      {error && (
        <p id={errorId} className="text-danger mt-1 text-sm font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
