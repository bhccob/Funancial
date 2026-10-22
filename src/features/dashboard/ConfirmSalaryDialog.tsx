import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import type { Income } from '@/domain/entities';
import {
  AccountField,
  NOT_CREDIT,
  useAccountOptions,
  useStartAccountId,
} from '@/features/shared/AccountField';
import { useAction } from '@/lib/useAction';
import { useCurrency, useFinanceActions } from '@/store/useFinance';

interface Errors {
  amount?: string;
  account?: string;
}

/**
 * How much arrived and where. It starts on the account the salary was expected on while that is
 * still one income can go into; one archived since (or never usable) gives way to the default
 * account, so the salary can still be confirmed.
 */
function ConfirmForm({ income, onDone }: { income: Income; onDone(): void }) {
  const { confirmIncome } = useFinanceActions();
  const currency = useCurrency();
  const run = useAction();
  const options = useAccountOptions(NOT_CREDIT);
  const fallback = useStartAccountId(NOT_CREDIT);
  const [amount, setAmount] = useState<number | null>(income.amount);
  const [accountId, setAccountId] = useState(() =>
    options.some((o) => o.value === income.accountId) ? income.accountId : fallback,
  );
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {
      amount: amount === null || amount <= 0 ? 'Enter the amount that arrived.' : undefined,
      account: accountId ? undefined : 'Pick an account.',
    };
    setErrors(found);
    if (found.amount || found.account) return;
    setBusy(true);
    const saved = await run(() => confirmIncome(income.id, amount!, accountId), {
      success: 'Salary confirmed.',
    });
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <MoneyField
        variant="line"
        label="Amount received"
        currency={currency}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setErrors((f) => ({ ...f, amount: undefined }));
        }}
        error={errors.amount}
        hint="Change it if a different amount landed."
        autoFocus
      />
      <AccountField
        label="Goes to"
        value={accountId}
        onChange={(id) => {
          setAccountId(id);
          setErrors((f) => ({ ...f, account: undefined }));
        }}
        filter={NOT_CREDIT}
        error={errors.account}
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
