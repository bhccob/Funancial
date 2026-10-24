import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { AccountField, accountName, useStartAccountId } from '@/features/shared/AccountField';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import {
  useCurrency,
  useFinanceActions,
  useFinanceView,
  useMoney,
  useToday,
} from '@/store/useFinance';

interface Errors {
  account?: string;
  actual?: string;
}

/**
 * `accountId` is the account it corrects; with none, the person picks it, starting on the default
 * account. A credit card's balance is what is owed on it.
 */
function ActualBalanceForm({
  accountId: fixed,
  onDone,
}: {
  accountId: string | null;
  onDone(): void;
}) {
  const { setActualBalance } = useFinanceActions();
  const { accounts } = useFinanceView();
  const money = useMoney();
  const currency = useCurrency();
  const today = useToday();
  const run = useAction();
  const start = useStartAccountId();
  const [accountId, setAccountId] = useState(fixed ?? start);
  const [actual, setActual] = useState<number | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const picking = fixed === null;
  const row = accounts.find((r) => r.account.id === accountId);
  const computed = row?.balance ?? 0;
  const matches = row !== undefined && actual !== null && actual === computed;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {
      account: picking && !row ? 'Pick an account.' : undefined,
      actual: actual === null ? 'Enter what you actually have, like 1,234.56' : undefined,
    };
    setErrors(found);
    if (found.account || actual === null || matches) return;
    const delta = actual - computed;
    setBusy(true);
    // An account gone since the dialog opened is refused by the store, with its own message.
    const saved = await run(() => setActualBalance(accountId, actual, today), {
      success: `${row?.account.name ?? 'Balance'} corrected by ${money(delta, { signDisplay: 'always' })}.`,
    });
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      {picking && (
        <AccountField
          variant="row"
          label="Account"
          value={accountId}
          onChange={(id) => {
            setAccountId(id);
            setErrors((f) => ({ ...f, account: undefined }));
          }}
          error={errors.account}
        />
      )}
      {row && (
        <p className="text-muted text-[15px] font-semibold tabular-nums">
          {`Funcial thinks: ${money(computed)}`}
        </p>
      )}
      {/* The dialog is about one amount: the big figure, no box. */}
      <MoneyField
        size="hero"
        label="Actual balance"
        currency={currency}
        value={actual}
        onChange={(v) => {
          setActual(v);
          setErrors((f) => ({ ...f, actual: undefined }));
        }}
        error={errors.actual}
        hint={
          row?.account.kind === 'credit'
            ? 'What you owe on it right now. The difference is saved as a correction.'
            : 'What your bank or wallet shows right now. The difference is saved as a correction.'
        }
      />
      {matches && <p className="text-success text-sm font-semibold">Already matches.</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || matches}>
          Save
        </Button>
      </div>
    </form>
  );
}

/**
 * Corrects what an account holds (for a credit card, what is owed on it) to what the bank shows.
 * Opened for one account (`accountId`), it says which in its description; opened without one, the
 * person picks it.
 */
export function ActualBalanceDialog({
  open,
  accountId = null,
  onClose,
}: {
  open: boolean;
  accountId?: string | null;
  onClose(): void;
}) {
  const all = useApp((s) => s.data.tables.account);
  return (
    <Dialog
      open={open}
      title="Set actual balance"
      description={accountId === null ? undefined : accountName(all, accountId)}
      onClose={onClose}
    >
      {open && <ActualBalanceForm key={accountId ?? ''} accountId={accountId} onDone={onClose} />}
    </Dialog>
  );
}
