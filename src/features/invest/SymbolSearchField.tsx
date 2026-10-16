import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { TextField, type TextFieldProps } from '@/components/ui/TextField';
import { cn } from '@/lib/cn';
import { market, type SearchResult } from '@/services/market';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

/**
 * The symbol field with a list of matches under it, as Yahoo knows them. Typing a symbol by hand
 * works as in a plain field: a search that fails or finds nothing only leaves the list out.
 */
export function SymbolSearchField({
  onChange,
  ...field
}: Omit<TextFieldProps, 'onChange'> & { onChange(symbol: string): void }) {
  const listId = useId();
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<number>(undefined);
  // Each search takes a number; only the latest one's answer is kept.
  const latest = useRef(0);

  const stop = () => {
    clearTimeout(timer.current);
    latest.current++;
  };
  useEffect(() => stop, []);

  function typed(text: string) {
    onChange(text);
    stop();
    setOpen(true);
    setActive(-1);
    const q = text.trim();
    if (q.length < MIN_CHARS) {
      setResults(null);
      return;
    }
    const id = latest.current;
    timer.current = window.setTimeout(() => {
      market.fetchSearch(q).then(
        (r) => id === latest.current && setResults(r.results),
        () => id === latest.current && setResults(null),
      );
    }, DEBOUNCE_MS);
  }

  function pick(result: SearchResult) {
    stop();
    onChange(result.symbol);
    setResults(null);
    setOpen(false);
    setActive(-1);
  }

  const shown = open && results !== null && results.length > 0;

  function onKeyDown(e: KeyboardEvent) {
    if (!open || results === null) return;
    if (e.key === 'Escape') {
      // Closes the list, not the dialog around it.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (shown && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.min(Math.max(i + step, 0), results.length - 1));
    } else if (shown && e.key === 'Enter' && results[active]) {
      e.preventDefault();
      pick(results[active]);
    }
  }

  return (
    <div>
      <TextField
        {...field}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => typed(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {/* Always in the page, so aria-controls has something to point at. */}
      <ul
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        hidden={!shown}
        // Taps on the list must not blur the field, or the list closes before the tap lands.
        onMouseDown={(e) => e.preventDefault()}
      >
        {results?.map((r, i) => (
          <li
            key={r.symbol}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            tabIndex={-1}
            onClick={() => pick(r)}
            className={cn(
              'border-border flex min-h-11 cursor-pointer flex-col justify-center border-t px-1 py-1.5 first:border-t-0',
              i === active ? 'bg-surface-2' : 'hover:bg-surface-2',
            )}
          >
            <span className="truncate text-[15px] font-extrabold">{r.symbol}</span>
            <span className="text-muted truncate text-[13px] font-semibold">
              {r.exchange ? `${r.name} · ${r.exchange}` : r.name}
            </span>
          </li>
        ))}
      </ul>
      {open && results?.length === 0 && (
        <p className="text-muted mt-1.5 text-sm">No matches. You can still type the symbol.</p>
      )}
    </div>
  );
}
