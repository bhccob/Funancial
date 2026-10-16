import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { FAQ, GLOSSARY, LEGAL, helpPage } from '@/content/help';
import { BUY_FROM, WAIT_FROM } from '@/domain/advisor';
import { EXAMPLES } from '@/domain/examples';
import { VERDICT_LABEL } from '@/features/buy/text';
import { ExampleTable } from './ExampleTable';

/** A term over its meaning, one row each. */
function Definitions({ items }: { items: Array<{ term: string; meaning: string }> }) {
  return (
    <dl>
      {items.map(({ term, meaning }) => (
        <div key={term} className="border-border border-t py-3 first:border-t-0">
          <dt className="text-[15.5px] font-extrabold">{term}</dt>
          <dd className="text-muted mt-0.5 text-sm font-semibold">{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The meter's zones, from the numbers the meter itself uses. */
function MeterZones() {
  const zones = [
    { name: 'Skip', range: `0–${WAIT_FROM - 1}`, says: VERDICT_LABEL.skip },
    {
      name: 'Wait',
      range: `${WAIT_FROM}–${BUY_FROM - 1}`,
      says: `${VERDICT_LABEL.wait}, or ${VERDICT_LABEL.cheaper.toLowerCase()}`,
    },
    { name: 'Buy', range: `${BUY_FROM}–100`, says: VERDICT_LABEL.buy },
  ];
  return (
    <Section title="The zones">
      <ul aria-label="Meter zones">
        {zones.map(({ name, range, says }) => (
          <li
            key={name}
            className="border-border flex min-h-11 items-baseline gap-3 border-t py-2.5 first:border-t-0"
          >
            <span className="w-12 shrink-0 text-[15.5px] font-extrabold">{name}</span>
            <span className="w-16 shrink-0 text-[15px] font-extrabold tabular-nums">{range}</span>
            <span className="text-muted text-sm font-semibold">{says}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** What a page shows after its text, besides its worked examples. */
const EXTRA: Record<string, () => ReactNode> = {
  'buy-it': () => <MeterZones />,
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
  terms: () => (
    <Section title="Disclaimers">
      <Definitions
        items={LEGAL.disclaimers.map(({ title, text }) => ({ term: title, meaning: text }))}
      />
    </Section>
  ),
};

/** One Help page: its text, anything extra, then its worked examples, as the app's own rules compute them. */
export function HelpPage() {
  const { id = '' } = useParams();
  const page = helpPage(id);
  if (!page) return <Navigate to="/help" replace />;

  return (
    <div className="max-w-xl">
      <Link
        to="/help"
        aria-label="Back to Help"
        className="text-muted -mb-1 inline-flex min-h-11 items-center text-[15px] font-extrabold"
      >
        ‹ Help
      </Link>
      <PageHeader title={page.title}>{page.summary}</PageHeader>
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
        <p className="text-muted pt-2 text-[13px] font-semibold">{LEGAL.disclaimers[0]!.text}</p>
      )}
    </div>
  );
}
