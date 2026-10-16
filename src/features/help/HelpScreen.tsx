import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { TextField } from '@/components/ui/TextField';
import { HELP_GROUPS, HELP_PAGES } from '@/content/help';

/** Help: a search line, then every page under its group. */
export function HelpScreen() {
  const [query, setQuery] = useState('');
  const text = query.trim().toLowerCase();
  const found = HELP_PAGES.filter((p) => `${p.title} ${p.summary}`.toLowerCase().includes(text));

  return (
    <div className="max-w-xl">
      <PageHeader title="Help" />
      <TextField
        variant="line"
        type="search"
        label="Search help"
        placeholder="e.g. available, freeze, dividends"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {/* Always in the page, so a screen reader hears it when it fills. */}
      <p role="status" className="text-muted mt-4 text-sm font-semibold">
        {found.length === 0 ? `No help page matches “${query.trim()}”.` : ''}
      </p>
      {HELP_GROUPS.map((group) => {
        const pages = found.filter((p) => p.group === group.id);
        if (pages.length === 0) return null;
        return (
          <Section key={group.id} title={group.title}>
            <ul>
              {pages.map((p) => (
                <li key={p.id} className="border-border border-t first:border-t-0">
                  <Link
                    to={`/help/${p.id}`}
                    className="text-text flex min-h-14 items-center gap-3.5 py-3"
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
          </Section>
        );
      })}
    </div>
  );
}
