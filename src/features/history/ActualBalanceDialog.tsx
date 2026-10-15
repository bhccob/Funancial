import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { useAction } from '@/lib/useAction';
import {
  useCurrency,
  useFinanceActions,
  useFinanceView,
  useMoney,
  useToday,
} from '@/store/useFinance';

type Which = 'cash' | 'savings';
const NAMES: Record<Which, string> = { cash: 'Cash', savings: 'Savings' };

function ActualBalanceForm({ onDone }: { onDone(): void }) {
  const { setActualBalance } = useFinanceActions();
  const { buckets } = useFinanceView();
  const money = useMoney();
  const currency = useCurrency();
  const today = useToday();
  const run = useAction();
  const [which, setWhich] = useState<Which>('cash');
  const [actual, setActual] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const computed = buckets[which];
  const matches = actual !== null && actual === computed;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (actual === null) return setError('Enter what you actually have, like 1,234.56');
    if (matches) return;
    const delta = actual - computed;
    setBusy(true);
    const saved = await run(() => setActualBalance(which, actual, today), {
      success: `${NAMES[which]} corrected by ${money(delta, { signDisplay: 'always' })}.`,
    });
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <RadioGroup<Which>
        legend="Which balance"
        value={which}
        onChange={setWhich}
        options={[
          { value: 'cash', label: 'Cash' },
          { value: 'savings', label: 'Savings' },
        ]}
      />
      <p className="text-sm font-semibold tabular-nums">{`Funancial thinks: ${money(computed)}`}</p>
      <MoneyField
        label="Actual balance"
        currency={currency}
        value={actual}
        onChange={(v) => {
          setActual(v);
          setError(undefined);
        }}
        error={error}
        hint="What your bank or wallet shows right now. The difference is saved as a correction."
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

export function ActualBalanceDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Dialog open={open} title="Set actual balance" onClose={onClose}>
      {open && <ActualBalanceForm onDone={onClose} />}
    </Dialog>
  );
}
