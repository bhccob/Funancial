import { Sheet } from '@/components/ui/Sheet';
import { ExpenseForm } from '@/features/add/ExpenseForm';
import { IncomeForm } from '@/features/add/IncomeForm';
import type { AddKind } from './AddFan';

/**
 * The form a bubble of the ＋ fan opens, in a sheet over whatever screen the person is on, so they
 * stay on it once the form is saved or cancelled.
 */
export function AddSheet({ kind, onClose }: { kind: AddKind | null; onClose(): void }) {
  return (
    <Sheet
      open={kind !== null}
      title={kind === 'income' ? 'Add income' : 'Add expense'}
      showTitle
      onClose={onClose}
    >
      {/* Mounted only while open, so each one starts empty, on its Amount. */}
      {kind === 'expense' && <ExpenseForm onDone={onClose} />}
      {kind === 'income' && <IncomeForm onDone={onClose} />}
    </Sheet>
  );
}
