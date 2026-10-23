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
  /**
   * `hero` is the amount of the add forms: 40px bold with the currency small and dimmed beside it,
   * no box, and a 2px line under it that turns ink while it has focus. It takes the place of
   * `variant` and `large`.
   */
  size?: 'default' | 'hero';
}

const UNREADABLE = 'Enter an amount like 12.50';

/**
 * The `hero` size: the currency and the figure (40px bold on a 56px row) in one row with no box.
 * The line under the row is always 2px (clear at rest) so it turns ink while the figure has focus,
 * which is what shows focus here, without anything moving. With an error the line is danger and
 * stays danger, so the row takes the page's focus ring instead while the figure has focus.
 */
const heroRow = (error: boolean) =>
  cn(
    'flex items-start gap-1.5 border-b-2',
    error
      ? 'border-danger focus-within:outline-focus focus-within:outline-2 focus-within:outline-offset-2'
      : 'border-transparent focus-within:border-text',
  );

const heroInput =
  'text-text placeholder:text-muted h-14 w-full min-w-0 bg-transparent px-0 text-[40px] font-bold tracking-[-0.04em] tabular-nums focus:outline-none';

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
  size = 'default',
}: MoneyFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [text, setText] = useState(value === null ? '' : formatMoneyPlain(value, currency));
  const [unreadable, setUnreadable] = useState(false);
  const shownError = error ?? (unreadable ? UNREADABLE : undefined);
  const symbol = currencySymbol(currency);
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = shownError ? `${inputId}-error` : undefined;
  const hero = size === 'hero';
  const line = variant === 'line' && !hero;
  const small = line || hero;

  return (
    <div className={cn('flex flex-col', small ? 'gap-0.5' : 'gap-1.5')}>
      <label htmlFor={inputId} className={small ? lineLabel : 'text-sm font-bold'}>
        {label}
      </label>
      <div className={hero ? heroRow(!!shownError) : 'relative'}>
        <span
          aria-hidden
          className={
            hero
              ? // Small and dimmed beside the big figure, level with the top of its digits as Home's hero does.
                'text-muted pointer-events-none pt-[17px] text-[15px] font-semibold select-none'
              : cn(
                  'text-muted pointer-events-none absolute inset-y-0 flex items-center font-semibold',
                  line && large ? 'text-[20px]' : 'text-base',
                  line ? 'left-0' : 'left-3',
                )
          }
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
          // Room for the symbol whatever its length ("$", "US$", "CHF"); the hero's sits beside it.
          style={
            hero ? undefined : { paddingLeft: `calc(${symbol.length}ch + ${line ? 0.5 : 1.25}rem)` }
          }
          placeholder={hero ? formatMoneyPlain(0, currency) : undefined}
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
            hero
              ? heroInput
              : line
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
