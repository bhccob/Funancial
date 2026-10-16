import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Section } from '@/components/ui/Section';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format';
import { marketConfigured, type NewsItem } from '@/services/market';
import { useApp } from '@/store/AppStoreProvider';
import { loadNews } from './newsCache';

// shortcut: the news request takes 25 symbols at most, so holdings past the 25th get no headlines;
// upgrade by splitting and merging requests as `fetchQuotes` does if anyone holds that many.
const MAX_SYMBOLS = 25;

const isWebLink = (url: string) => /^https?:\/\//i.test(url);

/** Headlines for what the person holds, newest as the service sends them, filterable by holding. */
export function NewsTab() {
  const holdings = useApp((s) => s.data.tables.holding);
  const configured = marketConfigured();
  const symbols = useMemo(
    () => [...new Set(holdings.map((h) => h.symbol))].slice(0, MAX_SYMBOLS),
    [holdings],
  );
  const key = symbols.join(',');
  // `items` null: the request failed. `at` is when they arrived, for "2 h ago" without a clock in render.
  const [result, setResult] = useState<{
    key: string;
    items: NewsItem[] | null;
    at: number;
  } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (!configured || symbols.length === 0) return;
    let current = true;
    loadNews(symbols).then(
      (items) => current && setResult({ key, items, at: Date.now() }),
      () => current && setResult({ key, items: null, at: Date.now() }),
    );
    return () => {
      current = false;
    };
  }, [configured, symbols, key]);

  const loaded = result?.key === key ? result : null;
  const symbol = chosen !== null && symbols.includes(chosen) ? chosen : null;
  const all = loaded?.items?.filter((i) => isWebLink(i.url)) ?? [];
  const shown = symbol ? all.filter((i) => i.symbol.toUpperCase() === symbol.toUpperCase()) : all;

  let body;
  if (!configured) body = <EmptyState title="News needs the price service." />;
  else if (symbols.length > 0 && !loaded)
    body = <p className="text-muted font-semibold">Loading headlines…</p>;
  else if (loaded && loaded.items === null)
    body = <EmptyState title="Couldn't load news right now." />;
  else {
    body = (
      <>
        {all.length > 0 && (
          <div role="group" aria-label="Filter by holding" className="mb-2 flex flex-wrap gap-2">
            {[null, ...symbols].map((s) => {
              const on = s === symbol;
              return (
                <button
                  key={s ?? 'all'}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChosen(s)}
                  className={cn(
                    'h-11 rounded-full px-4 text-sm font-bold motion-safe:transition-colors',
                    on ? 'bg-primary text-primary-contrast' : 'bg-surface-2 text-text',
                  )}
                >
                  {s ?? 'All'}
                </button>
              );
            })}
          </div>
        )}
        {shown.length > 0 ? (
          <ul>
            {shown.map((item) => (
              <li
                key={`${item.symbol} ${item.url}`}
                className="border-border border-t first:border-t-0"
              >
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block min-h-14 py-3"
                >
                  <span className="block text-[15px] font-extrabold">{item.title}</span>
                  <span className="text-muted mt-0.5 block text-[13px] font-semibold">
                    {[item.symbol, item.publisher, relativeTime(item.publishedAt, loaded!.at)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No headlines for your holdings right now." />
        )}
      </>
    );
  }

  return (
    <>
      <Section>{body}</Section>
      <p className="text-muted pt-1 text-[12.5px] font-bold">
        News data is for informational purposes only. Not financial advice.
      </p>
    </>
  );
}
