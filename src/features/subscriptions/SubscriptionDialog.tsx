import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import { categoryLabel } from '@/domain/budget';
import { CategorySchema, type Category, type Cycle, type Subscription } from '@/domain/entities';
import { parsePaidWith, paidWithValue, usePaidWithOptions } from '@/features/shared/paidWith';
import { useAction } from '@/lib/useAction';
import { useCurrency, useFinanceActions, useToday } from '@/store/useFinance';

const CATEGORY_OPTIONS = CategorySchema.options.map((c) => ({ value: c, label: categoryLabel(c) }));
const CYCLE_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

type Errors = { name?: string; amount?: string; nextRenewal?: string };

function SubscriptionForm({ sub, onDone }: { sub: Subscription | null; onDone(): void }) {
  const { saveSubscription, deleteSubscription } = useFinanceActions();
  const currency = useCurrency();
  const today = useToday();
  const paidWithOptions = usePaidWithOptions();
  const run = useAction();

  const [name, setName] = useState(sub?.name ?? '');
  const [amount, setAmount] = useState<number | null>(sub?.amount ?? null);
  const [cycle, setCycle] = useState<Cycle>(sub?.cycle ?? 'monthly');
  const [nextRenewal, setNextRenewal] = useState(sub?.nextRenewal ?? '');
  const [category, setCategory] = useState<Category>(sub?.category ?? 'entertainment');
  const [paidWith, setPaidWith] = useState(
    sub ? paidWithValue(sub.paymentMethod, sub.cardId) : 'debit',
  );
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {
      name: name.trim() ? undefined : 'Give it a name.',
      amount: amount === null || amount <= 0 ? 'Enter an amount like 12.50' : undefined,
      // A renewal in the past would be charged for every missed date at once.
      nextRenewal: !nextRenewal
        ? 'Pick the next renewal date.'
        : nextRenewal < today && nextRenewal !== sub?.nextRenewal
          ? 'Use today or a later date.'
          : undefined,
    };
    setErrors(found);
    if (found.name || found.amount || found.nextRenewal) return;

    setBusy(true);
    const saved = await run(
      () =>
        saveSubscription({
          ...(sub ? { id: sub.id } : {}),
          name: name.trim(),
          amount: amount ?? 0,
          cycle,
          nextRenewal,
          category,
          ...parsePaidWith(paidWith),
        }),
      { success: sub ? 'Subscription updated.' : 'Subscription added.' },
    );
    setBusy(false);
    if (saved) onDone();
  }

  async function remove() {
    if (!sub) return;
    setBusy(true);
    const removed = await run(() => deleteSubscription(sub.id), {
      success: 'Subscription deleted.',
    });
    setBusy(false);
    if (removed) onDone();
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
        label="Amount"
        currency={currency}
        value={amount}
        onChange={setAmount}
        error={errors.amount}
      />
      <Select
        label="Cycle"
        value={cycle}
        onChange={(v) => setCycle(v as Cycle)}
        options={CYCLE_OPTIONS}
      />
      <TextField
        label="Next renewal"
        type="date"
        min={today}
        value={nextRenewal}
        error={errors.nextRenewal}
        onChange={(e) => setNextRenewal(e.target.value)}
      />
      <Select
        label="Category"
        value={category}
        onChange={(v) => setCategory(v as Category)}
        options={CATEGORY_OPTIONS}
      />
      <Select label="Paid with" value={paidWith} onChange={setPaidWith} options={paidWithOptions} />
      {sub && (
        <div className="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-4">
          <Button variant="danger-ghost" size="sm" disabled={busy} onClick={remove}>
            Delete
          </Button>
          <p className="text-muted text-sm">Past charges stay in your history.</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** Add or edit a subscription. `sub` undefined = closed, null = new. */
export function SubscriptionDialog({
  sub,
  onClose,
}: {
  sub: Subscription | null | undefined;
  onClose(): void;
}) {
  return (
    <Dialog
      open={sub !== undefined}
      title={sub ? 'Edit subscription' : 'Add a subscription'}
      onClose={onClose}
    >
      {sub !== undefined && <SubscriptionForm key={sub?.id ?? 'new'} sub={sub} onDone={onClose} />}
    </Dialog>
  );
}
