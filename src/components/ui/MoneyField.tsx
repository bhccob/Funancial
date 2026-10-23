import { useId, useState } from 'react';
import { currencySymbol, formatMoneyPlain, parseMoney } from '@/domain/money';
import { cn } from '@/lib/cn';
import { lineInput, lineLabel } from './lineField';
import { ROW_LAYOUT, ROW_MESSAGE, rowLabel, rowLine, rowValue, type RowVariant } from './rowField';

export interface MoneyFieldProps {
  label: string;
  value: number | null;
  onChange(value: number | null): void;
  currency: string;
  hint?: string;
  error?: string;
  autoFocus?: boolean;
  id?: string;
  /**
   * `line` is the lighter field of the Invest forms: the label over the value, a hairline under it.
   * `row` is the plain row of the glass look: the label on the left, the currency and the amount on
   * the right.
   */
  variant?: RowVariant;
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

/**
 * The amount of a `row`: the muted figures of a row's value, right-aligned and as wide as what they say
 * (`field-sizing`), so the currency in front of them stays beside them; where that is not known
 * (an older WebView) the field is its usual width and the currency sits at the start of it.
 */
const rowAmount = `${rowValue} field-sizing-content min-w-[4ch] tabular-nums`;

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
  const row = variant === 'row' && !hero;
  const small = line || hero;

  const symbolEl = (
    <span
      aria-hidden
      className={
        row
          ? // In front of the amount, which is as wide as its figures, so the two read as one.
            'text-muted pointer-events-none text-[15px] font-semibold select-none'
          : hero
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
  );
  const inputEl = (
    <input
      id={inputId}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      autoFocus={autoFocus}
      value={text}
      aria-invalid={shownError ? true : undefined}
      aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
      // Room for the symbol whatever its length ("$", "US$", "CHF"); the hero's and the row's sit beside it.
      style={
        hero || row
          ? undefined
          : { paddingLeft: `calc(${symbol.length}ch + ${line ? 0.5 : 1.25}rem)` }
      }
      placeholder={hero || row ? formatMoneyPlain(0, currency) : undefined}
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
          : row
            ? rowAmount
            : line
              ? lineInput(!!shownError, large)
              : cn(
                  'text-text h-11 w-full rounded-md border bg-transparent pr-3 text-base font-semibold tabular-nums',
                  shownError ? 'border-danger' : 'border-border-strong',
                )
      }
    />
  );
  const messages = (
    <>
      {hint && (
        <p id={hintId} className={cn('text-muted text-sm', row && ROW_MESSAGE)}>
          {hint}
        </p>
      )}
      {shownError && (
        <p
          id={errorId}
          role="alert"
          className={cn('text-danger text-sm font-semibold', row && ROW_MESSAGE)}
        >
          {shownError}
        </p>
      )}
    </>
  );

  if (row) {
    return (
      <div className={rowLine(!!shownError)}>
        <div className={ROW_LAYOUT}>
          <label htmlFor={inputId} className={rowLabel}>
            {label}
          </label>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
            {symbolEl}
            {inputEl}
          </div>
        </div>
        {messages}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', small ? 'gap-0.5' : 'gap-1.5')}>
      <label htmlFor={inputId} className={small ? lineLabel : 'text-sm font-bold'}>
        {label}
      </label>
      <div className={hero ? heroRow(!!shownError) : 'relative'}>
        {symbolEl}
        {inputEl}
      </div>
      {messages}
    </div>
  );
}
