import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import type { Income } from '@/domain/entities';
import { useAction } from '@/lib/useAction';
import { useCurrency, useFinanceActions } from '@/store/useFinance';

function ConfirmForm({ income, onDone }: { income: Income; onDone(): void }) {
  const { confirmIncome } = useFinanceActions();
  const currency = useCurrency();
  const run = useAction();
  const [amount, setAmount] = useState<number | null>(income.amount);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (amount === null || amount <= 0) {
      setError('Enter the amount that arrived.');
      return;
    }
    setBusy(true);
    const saved = await run(() => confirmIncome(income.id, amount), {
      success: 'Salary confirmed.',
    });
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <MoneyField
        label="Amount received"
        currency={currency}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setError(undefined);
        }}
        error={error}
        hint="Change it if a different amount landed."
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Confirm
        </Button>
      </div>
    </form>
  );
}

export function ConfirmSalaryDialog({
  income,
  onClose,
}: {
  income: Income | null;
  onClose(): void;
}) {
  return (
    <Dialog open={income !== null} title="Confirm salary" onClose={onClose}>
      {income && <ConfirmForm key={income.id} income={income} onDone={onClose} />}
    </Dialog>
  );
}
