import { ChevronRight, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { lineLabel } from '@/components/ui/lineField';
import { PlainSection, ROWS } from '@/features/shared/PlainSection';
import { HELP_GROUPS, HELP_PAGES } from '@/content/help';

/** Help: a search line, then every page under its group. */
export function HelpScreen() {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found = HELP_PAGES.filter((p) => {
    const text = `${p.title} ${p.summary}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });

  return (
    <div className="max-w-xl">
      <PageHeader title="Help" back />
      <div className="mt-3 flex flex-col gap-1">
        <label htmlFor={searchId} className={lineLabel}>
          Search help
        </label>
        {/* A glass pill with a magnifying glass; the native clear button stays, as in any search field. */}
        <div className="relative">
          <input
            id={searchId}
            type="search"
            placeholder="e.g. available, limits, dividends"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="glass text-text placeholder:text-muted h-11 w-full min-w-0 rounded-full pr-4 pl-10 text-[15px] font-semibold"
          />
          {/* After the input in the page, so the glass does not paint over it. */}
          <Search
            aria-hidden="true"
            className="text-muted pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
          />
        </div>
      </div>
      {/* Always in the page, so a screen reader hears it when it fills. */}
      <p role="status" className="text-muted mt-4 text-sm font-semibold">
        {found.length === 0 ? `No help page matches “${query.trim()}”.` : ''}
      </p>
      {HELP_GROUPS.map((group) => {
        const pages = found.filter((p) => p.group === group.id);
        if (pages.length === 0) return null;
        return (
          <PlainSection key={group.id} title={group.title}>
            <ul className={ROWS}>
              {pages.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/help/${p.id}`}
                    className="text-text press flex min-h-14 items-center gap-3.5 py-3"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15.5px] font-extrabold">{p.title}</span>
                      <span className="text-muted text-[13px] font-semibold">{p.summary}</span>
                    </span>
                    <ChevronRight aria-hidden className="text-muted size-[18px] shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </PlainSection>
        );
      })}
    </div>
  );
}
