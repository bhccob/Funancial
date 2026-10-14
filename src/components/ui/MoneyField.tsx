import { useId, useState } from 'react';
import { currencySymbol, formatMoneyPlain, parseMoney } from '@/domain/money';
import { cn } from '@/lib/cn';

export interface MoneyFieldProps {
  label: string;
  value: number | null;
  onChange(value: number | null): void;
  currency: string;
  hint?: string;
  error?: string;
  autoFocus?: boolean;
  id?: string;
}

const UNREADABLE = 'Enter an amount like 12.50';

/** Amount input: accepts "12,5", "1.234,56" etc., reports minor units, tidies on blur. */
export function MoneyField({
  label,
  value,
  onChange,
  currency,
  hint,
  error,
  autoFocus,
  id,
}: MoneyFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [text, setText] = useState(value === null ? '' : formatMoneyPlain(value, currency));
  const [unreadable, setUnreadable] = useState(false);
  const shownError = error ?? (unreadable ? UNREADABLE : undefined);
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = shownError ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-bold">
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden
          className="text-muted pointer-events-none absolute inset-y-0 left-3 flex items-center text-base font-semibold"
        >
          {currencySymbol(currency)}
        </span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          onChange={(e) => {
            setText(e.target.value);
            setUnreadable(false);
            onChange(parseMoney(e.target.value, currency));
          }}
          onBlur={() => {
            if (text.trim() === '') return onChange(null);
            const parsed = parseMoney(text, currency);
            if (parsed === null) {
              setUnreadable(true);
              onChange(null);
            } else {
              setText(formatMoneyPlain(parsed, currency));
            }
          }}
          className={cn(
            'text-text h-11 w-full rounded-md border bg-transparent pr-3 pl-9 text-base font-semibold tabular-nums',
            shownError ? 'border-danger' : 'border-border-strong',
          )}
        />
      </div>
      {hint && (
        <p id={hintId} className="text-muted text-sm">
          {hint}
        </p>
      )}
      {shownError && (
        <p id={errorId} className="text-danger text-sm font-semibold">
          {shownError}
        </p>
      )}
    </div>
  );
}
