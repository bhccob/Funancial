import { useState } from 'react';
import { LeaveDemoButton } from '@/app/LeaveDemoButton';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { EraseDialog } from '@/features/system/EraseDialog';
import type { DataSnapshot, TableName } from '@/domain/snapshot';
import { useApp } from '@/store/AppStoreProvider';
import { useAccount } from '@/store/useAccount';

/** Order and wording of the summary line. Profile and settings are not "entries". */
const SUMMARY: Array<[TableName, string, string]> = [
  ['expense', 'expense', 'expenses'],
  ['subscription', 'subscription', 'subscriptions'],
  ['budgetLimit', 'limit', 'limits'],
  ['income', 'income entry', 'income entries'],
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

/**
 * With an account, Delete all data starts over: logging in again would only bring the copy back,
 * so the copy starts over too, and the account, the lock and the person stay. Once another phone
 * has taken the account this one no longer saves to it, and erasing the phone is all there is.
 */
function DeleteAllButton() {
  const [open, setOpen] = useState(false);
  const account = useAccount();
  const startOver = useApp((s) => s.startOver);
  const linked = account.status === 'linked';
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete all data
      </Button>
      <EraseDialog
        open={open}
        title="Delete all data?"
        description={
          linked
            ? `This erases everything you added, on this phone and in your account's copy, and it can't be undone. You stay logged in as ${account.username}, and your name, currency, lock and settings stay. Setup then asks for your cash, savings, salary and cards again.`
            : "This erases everything Funcial stores on this device, and it can't be undone. If you have an account, log in afterwards to get your data back."
        }
        onClose={() => setOpen(false)}
        erase={linked ? startOver : undefined}
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
