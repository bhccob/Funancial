import { useState } from 'react';
import { LeaveDemoButton } from '@/app/LeaveDemoButton';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { EraseDialog } from '@/features/system/EraseDialog';
import type { DataSnapshot, TableName } from '@/domain/snapshot';
import { useApp } from '@/store/AppStoreProvider';

/** Order and wording of the summary line. Profile and settings are not "entries". */
const SUMMARY: Array<[TableName, string, string]> = [
  ['expense', 'expense', 'expenses'],
  ['subscription', 'subscription', 'subscriptions'],
  ['budgetLimit', 'limit', 'limits'],
  ['income', 'income entry', 'income entries'],
  ['salaryFreeze', 'salary freeze', 'salary freezes'],
  ['transaction', 'transaction', 'transactions'],
  ['goal', 'goal', 'goals'],
  ['debt', 'debt or card', 'debts and cards'],
];

function summarize(data: DataSnapshot): string {
  const parts = SUMMARY.flatMap(([table, one, many]) => {
    const n = data.tables[table].length;
    return n === 0 ? [] : [`${n} ${n === 1 ? one : many}`];
  });
  return parts.length ? parts.join(' · ') : 'No entries yet.';
}

function DeleteAllButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete all data
      </Button>
      <EraseDialog
        open={open}
        title="Delete all data?"
        description="This erases everything Funcial stores on this device, and it can't be undone. If you have an account, log in afterwards to get your data back."
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function DataSection() {
  const namespace = useApp((s) => s.namespace);
  const data = useApp((s) => s.data);
  const persisted = useApp((s) => s.persisted);
  const skipped = useApp((s) => s.skipped);

  return (
    <Section title="Data">
      <div className="flex flex-col gap-5">
        {skipped.length > 0 && (
          <Banner tone="warning">
            {skipped.length} saved items couldn't be read and are hidden. They're still kept on this
            device.
          </Banner>
        )}
        <div className="flex flex-col gap-1">
          <p className="font-bold">{summarize(data)}</p>
          <p className="text-muted text-sm">
            {persisted
              ? 'Storage: protected from automatic clearing'
              : 'Storage: the browser may clear it if space runs low'}
          </p>
        </div>

        {namespace === 'demo' ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-muted text-sm">This is demo money. Leaving demo deletes it.</p>
            <LeaveDemoButton size="md" />
          </div>
        ) : (
          <div className="flex flex-col items-start">
            <DeleteAllButton />
          </div>
        )}
      </div>
    </Section>
  );
}
