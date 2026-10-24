import { Check, CircleAlert, Delete } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PinPadProps {
  minLength?: number;
  maxLength?: number;
  onSubmit(pin: string): void;
  disabled?: boolean;
  error?: ReactNode;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * A key of the pad: 56px tall and about 100px wide, 18px round. The pad stands on the theme's block,
 * where the text tokens are the block's ink, so a digit's key is the block's glass (`glass-head`) and
 * the unlock key the block's main button (`btn-head`). Neither is `Button` or the page's glass,
 * which are the page's colours and fall under the ink on a dark block (tests/unit/tokens.test.ts).
 * Disabled, a key fades to 45% and takes no tap.
 */
const KEY =
  'press grid h-14 place-items-center rounded-key text-[22px] font-extrabold select-none ' +
  'motion-safe:transition-[transform,opacity] motion-safe:duration-(--duration-press) motion-safe:ease-glass ' +
  'disabled:pointer-events-none disabled:opacity-45';

/**
 * PIN entry: a real (masked) input, so keyboards and screen readers work, plus a keypad. It stands on
 * the theme's block (the lock screen), so it is drawn in the block's glass and ink.
 */
export function PinPad({ minLength = 4, maxLength = 8, onSubmit, disabled, error }: PinPadProps) {
  const [pin, setPin] = useState('');
  const inputId = useId();
  const errorId = useId();
  const canSubmit = !disabled && pin.length >= minLength;

  const press = (digit: string) => setPin((p) => (p.length < maxLength ? p + digit : p));

  return (
    <form
      className="flex w-full max-w-xs flex-col items-center gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit(pin);
        setPin('');
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        PIN
      </label>
      {/* The field's edge is the ink at 84% (head-dim), which holds 3:1 against its glass and the block in every theme; the 59% of head-faint does not. */}
      <input
        id={inputId}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        value={pin}
        disabled={disabled}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, maxLength))}
        className="border-head-dim text-text h-14 w-full rounded-full border bg-(--hg-bg) text-center text-2xl tracking-[0.5em]"
      />
      {/* In the block's ink: the danger red is for the page and falls under 4.5:1 on a dark block. A mark says it is a problem. */}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-center justify-center gap-1.5 text-center text-sm font-bold"
        >
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      <div className="grid w-full grid-cols-3 gap-2">
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled}
            onClick={() => press(d)}
            className={cn(KEY, 'glass-head')}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          aria-label="Delete"
          disabled={disabled || pin.length === 0}
          onClick={() => setPin((p) => p.slice(0, -1))}
          className={cn(KEY, 'glass-head')}
        >
          <Delete aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => press('0')}
          className={cn(KEY, 'glass-head')}
        >
          0
        </button>
        <button
          type="submit"
          aria-label="Unlock"
          disabled={!canSubmit}
          className={cn(KEY, 'btn-head')}
        >
          <Check aria-hidden className="size-6" strokeWidth={3} />
        </button>
      </div>
    </form>
  );
}
