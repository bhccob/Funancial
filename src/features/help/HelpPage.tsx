import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { FAQ, GLOSSARY, LEGAL, helpPage } from '@/content/help';
import { EXAMPLES } from '@/domain/examples';
import { ROWS } from '@/features/shared/PlainSection';
import { ExampleTable } from './ExampleTable';

/** A term over its meaning, one plain row each, with hairlines between them. */
function Definitions({ items }: { items: Array<{ term: string; meaning: string }> }) {
  return (
    <dl className={ROWS}>
      {items.map(({ term, meaning }) => (
        <div key={term} className="py-3">
          <dt className="text-[15.5px] font-extrabold">{term}</dt>
          <dd className="text-muted mt-0.5 text-sm font-semibold">{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What a page shows after its text, besides its worked examples. */
const EXTRA: Record<string, () => ReactNode> = {
  glossary: () => (
    <Section>
      <Definitions items={GLOSSARY} />
    </Section>
  ),
  faq: () => (
    <Section>
      <Definitions items={FAQ.map(({ q, a }) => ({ term: q, meaning: a }))} />
    </Section>
  ),
  'net-worth': () => (
    <Section>
      <p className="text-[15.5px] leading-relaxed font-semibold">
        <Link to="/help/cards" className="font-extrabold underline underline-offset-4">
          {helpPage('cards')!.title}
        </Link>{' '}
        has a worked example.
      </p>
    </Section>
  ),
  terms: () => (
    <Section title="Disclaimers">
      <Definitions
        items={LEGAL.disclaimers.map(({ title, text }) => ({ term: title, meaning: text }))}
      />
    </Section>
  ),
};

/**
 * One Help page: its text, anything extra, then its worked examples, as the app's own rules compute
 * them. The text is plain on the page; only the examples sit in glass.
 */
export function HelpPage() {
  const { id = '' } = useParams();
  const page = helpPage(id);
  if (!page) return <Navigate to="/help" replace />;

  return (
    <div className="max-w-xl">
      <PageHeader title={page.title} back backTo="/help">
        {page.summary}
      </PageHeader>
      <Section>
        <div className="flex flex-col gap-3.5 text-[15.5px] leading-relaxed font-semibold">
          {page.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Section>
      {EXTRA[page.id]?.()}
      {page.exampleIds?.map((exampleId) => {
        const example = EXAMPLES.find((e) => e.id === exampleId);
        return example && <ExampleTable key={exampleId} example={example} />;
      })}
      {page.group !== 'more' && (
        <div className="text-muted flex flex-col gap-1.5 pt-2 text-[13px] font-semibold">
          {/* Prices and headlines are what the Investments page shows; every other page needs only the first. */}
          {(page.id === 'investments' ? LEGAL.disclaimers : LEGAL.disclaimers.slice(0, 1)).map(
            (d) => (
              <p key={d.title}>{d.text}</p>
            ),
          )}
        </div>
      )}
    </div>
  );
}
