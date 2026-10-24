import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  type ClipboardEvent,
  type SyntheticEvent,
} from 'react';
import { cn } from '@/lib/cn';

/** How many digits an emailed code has. */
const LENGTH = 6;

const digitsOf = (text: string) => text.replace(/\D/g, '');

/**
 * `current` with the digits of `text` put in place of its characters `start` to `end`, at most six: a
 * whole code (six digits or more) takes the place of what was there, a few go in where the caret is.
 */
function withInserted(current: string, text: string, start: number, end: number): string {
  const digits = digitsOf(text);
  return digits.length >= LENGTH
    ? digits.slice(0, LENGTH)
    : (current.slice(0, start) + digits + current.slice(end)).slice(0, LENGTH);
}

/**
 * The six digits of an emailed code. It is one field, so a paste, the keyboard's suggested code
 * (`one-time-code`) and a screen reader each meet one input with one name; the six boxes are only a
 * picture of its value. The field lies over them, its own text and caret clear, and keeps its caret at
 * the end, so a tap on any box goes on from the last digit. Whatever reaches it keeps its digits only,
 * at most six: "481 529" and "481-529", as the email or a phone may give them, fill it.
 */
export function CodeField({
  value,
  onChange,
  error,
  label = 'Code',
}: {
  value: string;
  onChange(value: string): void;
  error?: string;
  label?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const input = useRef<HTMLInputElement>(null);
  // The box the next digit goes in, or the last one once all six are there.
  const current = Math.min(value.length, LENGTH - 1);

  /** Puts `text` in for the field's selection (or at its caret), digits only, at most six. */
  function insert(field: HTMLInputElement, text: string) {
    const digits = digitsOf(text);
    if (!digits) return;
    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? value.length;
    onChange(withInserted(value, digits, start, end));
  }

  function paste(e: ClipboardEvent<HTMLInputElement>) {
    // Not left to the browser: it would cut "481 529" to the field's six characters first.
    e.preventDefault();
    insert(e.currentTarget, e.clipboardData.getData('text'));
  }

  // Text a keyboard puts in whole, not a key at a time (Gboard's suggested "481 529" from the clipboard)
  // comes with no paste, and the browser cuts it to six characters before `onChange` sees it. The
  // native `beforeinput` carries all of it: React's `onBeforeInput` is another event (`textInput`),
  // which a phone's keyboard need not send. A key press and a deletion are left to the browser.
  const keyboardInsert = useEffectEvent((e: InputEvent) => {
    if (!e.cancelable || e.inputType !== 'insertText' || !e.data || e.data.length < 2) return;
    e.preventDefault();
    insert(e.target as HTMLInputElement, e.data);
  });
  useEffect(() => {
    const field = input.current;
    if (!field) return;
    const listener = (e: Event) => keyboardInsert(e as InputEvent);
    field.addEventListener('beforeinput', listener);
    return () => field.removeEventListener('beforeinput', listener);
  }, []);

  function caretToEnd(e: SyntheticEvent<HTMLInputElement>) {
    const field = e.currentTarget;
    // A selection (to paste over) stays; a bare caret goes after the last digit.
    if (field.selectionStart === field.selectionEnd && field.selectionStart !== value.length) {
      field.setSelectionRange(value.length, value.length);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="group relative flex justify-center gap-2">
        <div aria-hidden="true" className="contents">
          {Array.from({ length: LENGTH }, (_, i) => (
            <span
              key={i}
              data-code-box={i === current ? 'current' : ''}
              className={cn(
                'glass text-text grid h-14 max-w-12 min-w-0 flex-1 place-items-center rounded-[14px] text-2xl font-extrabold tabular-nums',
                // In danger over the glass's own edge: `glass` sets the border (and the shadow),
                // which a border colour here would lose to. The focus ring below still wins.
                error && 'outline-danger outline-1 -outline-offset-1',
                i === current &&
                  'group-focus-within:outline-focus group-focus-within:outline-2 group-focus-within:outline-offset-2',
              )}
            >
              {value[i] ?? ''}
            </span>
          ))}
        </div>
        <input
          ref={input}
          id={id}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={LENGTH}
          spellCheck={false}
          autoCorrect="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={value}
          onChange={(e) => onChange(digitsOf(e.target.value).slice(0, LENGTH))}
          onPaste={paste}
          onSelect={caretToEnd}
          // 16px, so a phone does not zoom in on it; the text is clear, the boxes show it.
          className="absolute inset-0 size-full bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent"
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-danger text-center text-sm font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
