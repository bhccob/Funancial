import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import { debtBalance } from '@/domain/balances';
import { debtRemoval } from '@/domain/debts';
import type { Debt } from '@/domain/entities';
import { formatDate } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency, useFinanceActions, useMoney, useToday } from '@/store/useFinance';

type Kind = Debt['kind'];
export type DebtTarget = { kind: Kind; debt: Debt | null };
type Errors = { name?: string; balance?: string; rate?: string };

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

function DebtForm({
  kind,
  debt,
  onDone,
  onDelete,
}: DebtTarget & { onDone(): void; onDelete(): void }) {
  const { saveDebt } = useFinanceActions();
  const currency = useCurrency();
  const run = useAction();
  const card = kind === 'credit_card';

  const [name, setName] = useState(debt?.name ?? '');
  const [balance, setBalance] = useState<number | null>(debt?.openingBalance ?? null);
  const [rate, setRate] = useState(debt ? String(debt.interestRate) : '');
  const [minimum, setMinimum] = useState<number | null>(debt?.minimumPayment ?? null);
  const [limit, setLimit] = useState<number | null>(debt?.creditLimit ?? null);
  const [dueDay, setDueDay] = useState(String(debt?.dueDay ?? 1));
  const [payInFull, setPayInFull] = useState(debt?.payInFull ?? true);
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
          ...(debt ? { id: debt.id } : {}),
          name: name.trim(),
          kind,
          openingBalance: balance ?? 0,
          interestRate: interest,
          minimumPayment: minimum ?? 0,
          creditLimit: card ? limit : null,
          statementDay: debt?.statementDay ?? null,
          dueDay: card ? Number(dueDay) : (debt?.dueDay ?? null),
          payInFull: card ? payInFull : false,
        }),
      { success: debt ? 'Saved.' : card ? 'Card added.' : 'Loan added.' },
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
        label={debt ? 'Balance when added' : 'Current balance'}
        currency={currency}
        value={balance}
        onChange={setBalance}
        error={errors.balance}
        hint={
          debt
            ? `On ${formatDate(debt.openingDate)}. Purchases and payments since then are added on top.`
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
      {card && (
        <>
          <MoneyField
            variant="line"
            label="Credit limit"
            currency={currency}
            value={limit}
            onChange={setLimit}
            hint="Optional."
          />
          <Select
            variant="line"
            label="Due day"
            value={dueDay}
            onChange={setDueDay}
            options={DAY_OPTIONS}
          />
          <Switch label="Pay in full each month" checked={payInFull} onChange={setPayInFull} />
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {debt ? (
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

const TITLES: Record<Kind, [string, string]> = {
  credit_card: ['Add a card', 'Edit card'],
  loan: ['Add a loan', 'Edit loan'],
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Asks before a card or loan goes, saying what `deleteDebt` will do: whether it is archived instead
 * (and what it still owes), and how many subscriptions move to debit.
 */
function DeleteDebtDialog({
  debt,
  onCancel,
  onDone,
}: {
  debt: Debt | null;
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
  if (debt) {
    const removal = debtRemoval(data, debt.id);
    archive = removal.archive;
    const owed = archive ? debtBalance(debt, data, today) : 0;
    const moved = removal.subscriptions.length;
    title = `${archive ? 'Archive' : 'Delete'} ${debt.name}?`;
    description = [
      archive
        ? `${debt.name} has past expenses or payments, so it is archived: it leaves Debts, bills and "Paid with", and past expenses keep its name.`
        : `${debt.name} will be deleted.`,
      owed > 0 && `The ${money(owed)} still owed on it stops counting toward what you owe.`,
      moved > 0 &&
        `${moved} ${plural(moved, 'subscription', 'subscriptions')} paid with it ${plural(moved, 'switches', 'switch')} to debit.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  async function confirm() {
    if (!debt) return;
    setBusy(true);
    const ok = await run(() => deleteDebt(debt.id), {
      success: `${debt.name} ${archive ? 'archived' : 'deleted'}.`,
    });
    setBusy(false);
    if (ok) onDone();
    else onCancel();
  }

  return (
    <Dialog
      open={debt !== null}
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

export function DebtDialog({ target, onClose }: { target: DebtTarget | null; onClose(): void }) {
  const title = target ? TITLES[target.kind][target.debt ? 1 : 0] : '';
  // Beside the form's dialog, not in it: Escape on the ask must not close both.
  const [deleting, setDeleting] = useState<Debt | null>(null);
  return (
    <>
      <Dialog open={target !== null} title={title} onClose={onClose}>
        {target && (
          <DebtForm
            key={target.debt?.id ?? `new-${target.kind}`}
            kind={target.kind}
            debt={target.debt}
            onDone={onClose}
            onDelete={() => setDeleting(target.debt)}
          />
        )}
      </Dialog>
      <DeleteDebtDialog
        debt={deleting}
        onCancel={() => setDeleting(null)}
        onDone={() => {
          setDeleting(null);
          onClose();
        }}
      />
    </>
  );
}
