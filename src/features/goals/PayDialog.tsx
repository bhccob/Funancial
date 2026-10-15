import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import type { Debt, Goal } from '@/domain/entities';
import { useAction } from '@/lib/useAction';
import { useCurrency, useFinanceActions, useMoney, useToday } from '@/store/useFinance';

/** Money moving toward something: a goal (from cash to savings) or a card or loan (paid off). */
export type PayTarget =
  { kind: 'goal'; goal: Goal } | { kind: 'debt'; debt: Debt; balance: number };

const ENTER = 'Enter an amount like 12.50';

function GoalForm({ goal, onDone }: { goal: Goal; onDone(): void }) {
  const { contributeToGoal } = useFinanceActions();
  const currency = useCurrency();
  const today = useToday();
  const run = useAction();
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (amount === null || amount <= 0) return setError(ENTER);
    setBusy(true);
    const saved = await run(() => contributeToGoal(goal.id, amount, today), {
      success: `Added to ${goal.name}.`,
    });
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <MoneyField
        label="Amount"
        currency={currency}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setError(undefined);
        }}
        error={error}
        hint="Moves it from cash to savings and counts it toward this goal."
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Add
        </Button>
      </div>
    </form>
  );
}

function DebtForm({ debt, balance, onDone }: { debt: Debt; balance: number; onDone(): void }) {
  const { payDebt } = useFinanceActions();
  const currency = useCurrency();
  const money = useMoney();
  const today = useToday();
  const run = useAction();
  const suggested =
    debt.kind === 'loan' && debt.minimumPayment > 0
      ? Math.min(debt.minimumPayment, balance)
      : balance;
  const [amount, setAmount] = useState<number | null>(suggested > 0 ? suggested : null);
  const [from, setFrom] = useState<'cash' | 'savings'>('cash');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (amount === null || amount <= 0) return setError(ENTER);
    if (amount > balance) return setError(`That's more than the ${money(balance)} you owe.`);
    setBusy(true);
    const saved = await run(() => payDebt(debt.id, amount, from, today), {
      success: `Paid ${money(amount)} toward ${debt.name}.`,
    });
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <MoneyField
        label="Amount"
        currency={currency}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setError(undefined);
        }}
        error={error}
        hint={`You owe ${money(balance)}.`}
      />
      <RadioGroup<'cash' | 'savings'>
        legend="From"
        value={from}
        onChange={setFrom}
        options={[
          { value: 'cash', label: 'Cash' },
          { value: 'savings', label: 'Savings' },
        ]}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Pay
        </Button>
      </div>
    </form>
  );
}

export function PayDialog({ target, onClose }: { target: PayTarget | null; onClose(): void }) {
  const title = !target ? '' : target.kind === 'goal' ? 'Add to goal' : `Pay ${target.debt.name}`;
  return (
    <Dialog open={target !== null} title={title} onClose={onClose}>
      {target?.kind === 'goal' && (
        <GoalForm key={target.goal.id} goal={target.goal} onDone={onClose} />
      )}
      {target?.kind === 'debt' && (
        <DebtForm
          key={target.debt.id}
          debt={target.debt}
          balance={target.balance}
          onDone={onClose}
        />
      )}
    </Dialog>
  );
}
