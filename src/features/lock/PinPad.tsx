import { Check, Delete } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

export interface PinPadProps {
  minLength?: number;
  maxLength?: number;
  onSubmit(pin: string): void;
  disabled?: boolean;
  error?: ReactNode;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** PIN entry: a real (masked) input, so keyboards and screen readers work, plus a keypad. */
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
        className="border-border-strong bg-surface h-14 w-full rounded-md border-2 text-center text-2xl tracking-[0.5em]"
      />
      {error && (
        <p id={errorId} role="alert" className="text-danger text-center text-sm font-bold">
          {error}
        </p>
      )}
      <div className="grid w-full grid-cols-3 gap-2">
        {DIGITS.map((d) => (
          <Button
            key={d}
            variant="secondary"
            size="lg"
            disabled={disabled}
            onClick={() => press(d)}
          >
            {d}
          </Button>
        ))}
        <Button
          variant="secondary"
          size="lg"
          aria-label="Delete"
          disabled={disabled || pin.length === 0}
          onClick={() => setPin((p) => p.slice(0, -1))}
        >
          <Delete aria-hidden className="size-5" />
        </Button>
        <Button variant="secondary" size="lg" disabled={disabled} onClick={() => press('0')}>
          0
        </Button>
        <Button type="submit" size="lg" aria-label="Unlock" disabled={!canSubmit}>
          <Check aria-hidden className="size-6" strokeWidth={3} />
        </Button>
      </div>
    </form>
  );
}
