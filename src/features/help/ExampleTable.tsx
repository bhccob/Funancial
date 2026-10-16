import { Section } from '@/components/ui/Section';
import { RESULT_ROWS, type ResultKind } from '@/content/help';
import type { WorkedExample } from '@/domain/examples';
import { formatMoney } from '@/domain/money';

/** A limit's level as `levelRank` counts it: no warning, then each warning point passed. */
const LEVELS = ['No warning', 'Warning', 'Over the limit', 'Well over the limit'];

function format(value: number, kind: ResultKind, currency: string): string {
  switch (kind) {
    case 'money':
      return formatMoney(value, currency);
    case 'percent':
      return `${value}%`;
    case 'level':
      return LEVELS[value] ?? String(value);
    case 'count':
      return value.toLocaleString();
  }
}

/**
 * One worked example, as the app's own tests check it: its title, its steps, and every figure of its
 * `result` under a readable label. Money is shown in the example's currency, as its steps say it.
 */
export function ExampleTable({ example }: { example: WorkedExample }) {
  const currency = example.data.tables.profile[0]?.currency ?? 'USD';
  return (
    <Section>
      <p className="text-muted text-[13px] font-bold">Worked example</p>
      <h2 className="mt-0.5 text-[17px] leading-snug font-extrabold tracking-[-0.01em]">
        {example.title}
      </h2>
      <ol
        aria-label="Steps"
        className="marker:text-muted mt-4 list-decimal space-y-2.5 pl-5 text-[15px] leading-relaxed font-semibold marker:font-extrabold"
      >
        {example.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <dl aria-label="Result" className="mt-5">
        {Object.entries(example.result).map(([key, value]) => {
          const { label, kind } = RESULT_ROWS[key] ?? { label: key, kind: 'count' as const };
          return (
            <div
              key={key}
              className="border-border flex min-h-11 items-center justify-between gap-3 border-t py-2.5 first:border-t-0"
            >
              <dt className="text-muted text-sm font-semibold">{label}</dt>
              <dd className="text-[15px] font-extrabold tabular-nums">
                {format(value, kind, currency)}
              </dd>
            </div>
          );
        })}
      </dl>
    </Section>
  );
}
