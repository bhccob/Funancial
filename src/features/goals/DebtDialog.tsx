import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import type { Debt } from '@/domain/entities';
import { formatDate } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useCurrency, useFinanceActions } from '@/store/useFinance';

type Kind = Debt['kind'];
export type DebtTarget = { kind: Kind; debt: Debt | null };
type Errors = { name?: string; balance?: string; rate?: string };

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

function DebtForm({ kind, debt, onDone }: DebtTarget & { onDone(): void }) {
  const { saveDebt, deleteDebt } = useFinanceActions();
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

  async function remove() {
    if (!debt) return;
    setBusy(true);
    // Refused when it has history; useAction shows that message.
    const ok = await run(() => deleteDebt(debt.id), { success: `${debt.name} deleted.` });
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <TextField
        label="Name"
        autoComplete="off"
        value={name}
        error={errors.name}
        onChange={(e) => setName(e.target.value)}
      />
      <MoneyField
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
        label="Interest rate %"
        inputMode="decimal"
        autoComplete="off"
        value={rate}
        error={errors.rate}
        onChange={(e) => setRate(e.target.value)}
      />
      <MoneyField
        label="Minimum payment"
        currency={currency}
        value={minimum}
        onChange={setMinimum}
      />
      {card && (
        <>
          <MoneyField
            label="Credit limit"
            currency={currency}
            value={limit}
            onChange={setLimit}
            hint="Optional."
          />
          <Select label="Due day" value={dueDay} onChange={setDueDay} options={DAY_OPTIONS} />
          <Switch label="Pay in full each month" checked={payInFull} onChange={setPayInFull} />
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {debt ? (
          <Button variant="ghost" className="text-danger" disabled={busy} onClick={remove}>
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

export function DebtDialog({ target, onClose }: { target: DebtTarget | null; onClose(): void }) {
  const title = target ? TITLES[target.kind][target.debt ? 1 : 0] : '';
  return (
    <Dialog open={target !== null} title={title} onClose={onClose}>
      {target && (
        <DebtForm
          key={target.debt?.id ?? `new-${target.kind}`}
          kind={target.kind}
          debt={target.debt}
          onDone={onClose}
        />
      )}
    </Dialog>
  );
}
