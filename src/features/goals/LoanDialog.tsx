import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { TextField } from '@/components/ui/TextField';
import { debtBalance } from '@/domain/balances';
import { loanRemoval } from '@/domain/debts';
import type { Debt } from '@/domain/entities';
import { formatDate } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency, useFinanceActions, useMoney, useToday } from '@/store/useFinance';

/** The loan being edited, or `null` for a new one. */
export type LoanTarget = { loan: Debt | null };
type Errors = { name?: string; balance?: string; rate?: string };

function LoanForm({
  loan,
  onDone,
  onDelete,
}: {
  loan: Debt | null;
  onDone(): void;
  onDelete(): void;
}) {
  const { saveDebt } = useFinanceActions();
  const currency = useCurrency();
  const run = useAction();

  const [name, setName] = useState(loan?.name ?? '');
  const [balance, setBalance] = useState<number | null>(loan?.openingBalance ?? null);
  const [rate, setRate] = useState(loan ? String(loan.interestRate) : '');
  const [minimum, setMinimum] = useState<number | null>(loan?.minimumPayment ?? null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const interest = rate.trim() === '' ? 0 : Number(rate.replace(',', '.'));
    const found: Errors = {
      name: name.trim() ? undefined : 'Give it a name.',
      balance: balance === null || balance < 0 ? 'Enter an amount like 12.50' : undefined,
      rate: Number.isFinite(interest) && interest >= 0 ? undefined : 'Enter a rate like 19.9',
    };
    setErrors(found);
    if (found.name || found.balance || found.rate) return;
    setBusy(true);
    const ok = await run(
      () =>
        saveDebt({
          ...(loan ? { id: loan.id } : {}),
          name: name.trim(),
          openingBalance: balance ?? 0,
          interestRate: interest,
          minimumPayment: minimum ?? 0,
          creditLimit: null,
          statementDay: loan?.statementDay ?? null,
          dueDay: loan?.dueDay ?? null,
          payInFull: false,
        }),
      { success: loan ? 'Saved.' : 'Loan added.' },
    );
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <TextField
        variant="line"
        label="Name"
        autoComplete="off"
        value={name}
        error={errors.name}
        onChange={(e) => setName(e.target.value)}
      />
      <MoneyField
        variant="line"
        label={loan ? 'Balance when added' : 'Current balance'}
        currency={currency}
        value={balance}
        onChange={setBalance}
        error={errors.balance}
        hint={
          loan
            ? `On ${formatDate(loan.openingDate)}. Payments since then are taken off.`
            : undefined
        }
      />
      <TextField
        variant="line"
        label="Interest rate %"
        inputMode="decimal"
        autoComplete="off"
        value={rate}
        error={errors.rate}
        onChange={(e) => setRate(e.target.value)}
      />
      <MoneyField
        variant="line"
        label="Minimum payment"
        currency={currency}
        value={minimum}
        onChange={setMinimum}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {loan ? (
          <Button variant="danger-ghost" disabled={busy} onClick={onDelete}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * Asks before a loan goes, saying what `deleteDebt` will do: whether it is archived instead (it has
 * payments made to it) and what it still owes.
 */
function DeleteLoanDialog({
  loan,
  onCancel,
  onDone,
}: {
  loan: Debt | null;
  onCancel(): void;
  onDone(): void;
}) {
  const { deleteDebt } = useFinanceActions();
  const data = useApp((s) => s.data);
  const today = useToday();
  const money = useMoney();
  const run = useAction();
  const [busy, setBusy] = useState(false);

  let title = '';
  let description = '';
  let archive = false;
  if (loan) {
    archive = loanRemoval(data, loan.id).archive;
    const owed = archive ? debtBalance(loan, data, today) : 0;
    title = `${archive ? 'Archive' : 'Delete'} ${loan.name}?`;
    description = [
      archive
        ? `${loan.name} has payments made to it, so it is archived: it leaves Debts, and those payments keep its name.`
        : `${loan.name} will be deleted.`,
      owed > 0 && `The ${money(owed)} still owed on it stops counting toward what you owe.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  async function confirm() {
    if (!loan) return;
    setBusy(true);
    const ok = await run(() => deleteDebt(loan.id), {
      success: `${loan.name} ${archive ? 'archived' : 'deleted'}.`,
    });
    setBusy(false);
    if (ok) onDone();
    else onCancel();
  }

  return (
    <Dialog
      open={loan !== null}
      title={title}
      description={description}
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
            {archive ? 'Archive' : 'Delete'}
          </Button>
        </>
      }
    />
  );
}

/** Add or edit a loan. A credit card is `CardDialog`'s. */
export function LoanDialog({ target, onClose }: { target: LoanTarget | null; onClose(): void }) {
  // Beside the form's dialog, not in it: Escape on the ask must not close both.
  const [deleting, setDeleting] = useState<Debt | null>(null);
  return (
    <>
      <Dialog
        open={target !== null}
        title={target ? (target.loan ? 'Edit loan' : 'Add a loan') : ''}
        onClose={onClose}
      >
        {target && (
          <LoanForm
            key={target.loan?.id ?? 'new'}
            loan={target.loan}
            onDone={onClose}
            onDelete={() => setDeleting(target.loan)}
          />
        )}
      </Dialog>
      <DeleteLoanDialog
        loan={deleting}
        onCancel={() => setDeleting(null)}
        onDone={() => {
          setDeleting(null);
          onClose();
        }}
      />
    </>
  );
}
