import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import type { BuyDecision } from '@/domain/entities';
import { useAction } from '@/lib/useAction';
import { useBuyActions, useDecisions } from '@/store/useBuy';
import { useMoney } from '@/store/useFinance';
import { AskForm } from './AskForm';
import { statusLine, VERDICT_LABEL } from './text';

/** Should I buy it? The Ask form, and the earlier answers below it. */
export function BuyScreen() {
  const decisions = useDecisions();
  const actions = useBuyActions();
  const money = useMoney();
  const run = useAction();
  const [deleting, setDeleting] = useState<BuyDecision | null>(null);

  return (
    <div className="max-w-xl">
      <PageHeader title="Should I buy it?" />
      <Section>
        <AskForm />
      </Section>

      {decisions.length > 0 && (
        <Section title="Past asks">
          <ul aria-label="Past asks" className="divide-border divide-y">
            {decisions.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <Link
                  to={`/buy/${d.id}`}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{d.ask.item}</span>
                    <span className="text-muted block text-[12.5px]">
                      {`${money(d.facts.total)} · ${VERDICT_LABEL[d.verdict]} · ${statusLine(d) ?? 'Not decided'}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">{d.meter}%</span>
                </Link>
                <button
                  type="button"
                  aria-label={`Delete ${d.ask.item}`}
                  onClick={() => setDeleting(d)}
                  className="text-muted hover:text-danger hover:bg-surface-2 -mr-2 grid size-10 shrink-0 place-items-center rounded-full"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Dialog
        open={deleting !== null}
        title="Delete this check?"
        description={deleting ? `${deleting.ask.item} will be removed from your list.` : undefined}
        onClose={() => setDeleting(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const target = deleting;
                setDeleting(null);
                if (target) {
                  await run(() => actions.deleteDecision(target.id), { success: 'Deleted.' });
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
