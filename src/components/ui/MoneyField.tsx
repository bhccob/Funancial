import { useId, useState } from 'react';
import { currencySymbol, formatMoneyPlain, parseMoney } from '@/domain/money';
import { cn } from '@/lib/cn';
import { lineInput, lineLabel, type FieldVariant } from './lineField';

export interface MoneyFieldProps {
  label: string;
  value: number | null;
  onChange(value: number | null): void;
  currency: string;
  hint?: string;
  error?: string;
  autoFocus?: boolean;
  id?: string;
  /** `line` is the lighter field of the Invest forms: the label over the value, a hairline under it. */
  variant?: FieldVariant;
  /** Shows the amount at 20px instead of 16px; only the `line` variant has it. */
  large?: boolean;
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
  variant = 'box',
  large = false,
}: MoneyFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [text, setText] = useState(value === null ? '' : formatMoneyPlain(value, currency));
  const [unreadable, setUnreadable] = useState(false);
  const shownError = error ?? (unreadable ? UNREADABLE : undefined);
  const symbol = currencySymbol(currency);
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = shownError ? `${inputId}-error` : undefined;
  const line = variant === 'line';

  return (
    <div className={cn('flex flex-col', line ? 'gap-0.5' : 'gap-1.5')}>
      <label htmlFor={inputId} className={line ? lineLabel : 'text-sm font-bold'}>
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden
          className={cn(
            'text-muted pointer-events-none absolute inset-y-0 flex items-center font-semibold',
            line && large ? 'text-[20px]' : 'text-base',
            line ? 'left-0' : 'left-3',
          )}
        >
          {symbol}
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
          // Room for the symbol whatever its length ("$", "US$", "CHF").
          style={{ paddingLeft: `calc(${symbol.length}ch + ${line ? 0.5 : 1.25}rem)` }}
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
          className={
            line
              ? lineInput(!!shownError, large)
              : cn(
                  'text-text h-11 w-full rounded-md border bg-transparent pr-3 text-base font-semibold tabular-nums',
                  shownError ? 'border-danger' : 'border-border-strong',
                )
          }
        />
      </div>
      {hint && (
        <p id={hintId} className="text-muted text-sm">
          {hint}
        </p>
      )}
      {shownError && (
        <p id={errorId} role="alert" className="text-danger text-sm font-semibold">
          {shownError}
        </p>
      )}
    </div>
  );
}
