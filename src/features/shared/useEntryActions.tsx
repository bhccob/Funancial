import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { Expense } from '@/domain/entities';
import type { Entry } from '@/domain/history';
import { ExpenseForm } from '@/features/add/ExpenseForm';
import { useAction } from '@/lib/useAction';
import { useFinanceActions } from '@/store/useFinance';
import { useInvestActions } from '@/store/useInvest';
import { removalOf, type Removal } from './removal';

/**
 * What can be done with a row of History or of Home's Recent. Editing is only for an expense, which
 * opens the edit form in a dialog (income, transfers and stock entries have no edit); every other
 * entry offers a delete, asked about first. A list takes `actionsOf(entry, title)` for each of its
 * rows (the props `EntryRow` wants) and renders `dialogs` once, so the two lists open the same edit
 * form and ask the same question.
 */
export function useEntryActions(): {
  actionsOf(entry: Entry, title: string): { onOpen?(): void; onDelete?(): void };
  dialogs: ReactNode;
} {
  const { deleteIncome, deleteTransaction } = useFinanceActions();
  const { deleteDividend, undoSale } = useInvestActions();
  const run = useAction();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Removal | null>(null);

  const actionsOf = (entry: Entry, title: string) => {
    if (entry.kind === 'expense') {
      const expense = entry.item;
      return { onOpen: () => setEditing(expense) };
    }
    return {
      onDelete: () =>
        setDeleting(
          removalOf(entry, title, { deleteIncome, deleteTransaction, deleteDividend, undoSale }),
        ),
    };
  };

  const dialogs = (
    <>
      <Dialog open={editing !== null} title="Edit expense" onClose={() => setEditing(null)}>
        {editing && (
          <ExpenseForm key={editing.id} expense={editing} onDone={() => setEditing(null)} />
        )}
      </Dialog>

      <Dialog
        open={deleting !== null}
        title="Delete this entry?"
        description={
          deleting
            ? (deleting.description ?? `${deleting.title} will be removed from your history.`)
            : undefined
        }
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
                if (target) await run(target.remove, { success: 'Deleted.' });
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </>
  );

  return { actionsOf, dialogs };
}
