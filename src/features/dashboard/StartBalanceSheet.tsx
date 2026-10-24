import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { Sheet } from '@/components/ui/Sheet';
import { MAIN_ACCOUNT_ID } from '@/domain/upgrades/v10Accounts';
import { useAction } from '@/lib/useAction';
import { useCurrency, useFinanceActions } from '@/store/useFinance';

const ENTER = 'Enter an amount like 12.50';

/**
 * The form: one big amount, then Save. A balance of 0 is an answer too, and the account already
 * says it: nothing is written, and `onZero` lets Home answer the card.
 */
function StartBalanceForm({ onDone, onZero }: { onDone(): void; onZero(): void }) {
  const { setOpeningBalance } = useFinanceActions();
  const currency = useCurrency();
  const run = useAction();
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (amount === null || amount < 0) return setError(ENTER);
    if (amount === 0) {
      onZero();
      return onDone();
    }
    setBusy(true);
    const saved = await run(() => setOpeningBalance(MAIN_ACCOUNT_ID, amount), {
      success: 'Starting balance saved.',
    });
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <MoneyField
        size="hero"
        label="Starting balance"
        currency={currency}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setError(undefined);
        }}
        error={error}
        hint="What is in it today. What you spend and receive from now on is counted on top."
        autoFocus
      />
      <Button type="submit" size="lg" disabled={busy}>
        Save
      </Button>
    </form>
  );
}

/**
 * Sets what Main account holds, from Home's first-time card: its opening balance, the hero amount
 * of the add forms and Save. The form is mounted only while the sheet is open, so it starts empty.
 */
export function StartBalanceSheet({
  open,
  onClose,
  onZero,
}: {
  open: boolean;
  onClose(): void;
  /** A balance of 0 was saved: nothing is written, and the question is answered. */
  onZero(): void;
}) {
  return (
    <Sheet open={open} title="What's in your Main account?" showTitle onClose={onClose}>
      {open && <StartBalanceForm onDone={onClose} onZero={onZero} />}
    </Sheet>
  );
}
