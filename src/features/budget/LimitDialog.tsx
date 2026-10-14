import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { categoryLabel } from '@/domain/budget';
import { CategorySchema, type BudgetLimit, type Category } from '@/domain/entities';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency, useFinanceActions } from '@/store/useFinance';

type Scope = BudgetLimit['scope'];
type Period = BudgetLimit['period'];

const CATEGORY_OPTIONS = CategorySchema.options.map((c) => ({ value: c, label: categoryLabel(c) }));

function LimitForm({ limit, onDone }: { limit: BudgetLimit | null; onDone(): void }) {
  const { saveLimit, deleteLimit } = useFinanceActions();
  const currency = useCurrency();
  const limits = useApp((s) => s.data.tables.budgetLimit);
  const run = useAction();

  const [scope, setScope] = useState<Scope>(limit?.scope ?? 'category');
  const [category, setCategory] = useState<Category>(limit?.category ?? 'food');
  const [period, setPeriod] = useState<Period>(limit?.period ?? 'monthly');
  const [amount, setAmount] = useState<number | null>(limit?.amount ?? null);
  const [reserve, setReserve] = useState(limit?.reserve ?? false);
  const [amountError, setAmountError] = useState<string>();
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const chosen = scope === 'overall' ? null : category;
    const clash = limits.some(
      (l) =>
        l.id !== limit?.id && l.scope === scope && l.category === chosen && l.period === period,
    );
    setAmountError(amount === null || amount <= 0 ? 'Enter an amount like 12.50' : undefined);
    setDuplicate(clash);
    if (amount === null || amount <= 0 || clash) return;

    setBusy(true);
    const saved = await run(
      () =>
        saveLimit({
          ...(limit ? { id: limit.id } : {}),
          scope,
          category: chosen,
          period,
          amount,
          reserve,
        }),
      { success: limit ? 'Limit updated.' : 'Limit added.' },
    );
    setBusy(false);
    if (saved) onDone();
  }

  async function remove() {
    if (!limit) return;
    setBusy(true);
    const removed = await run(() => deleteLimit(limit.id), { success: 'Limit deleted.' });
    setBusy(false);
    if (removed) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <RadioGroup<Scope>
        legend="Applies to"
        value={scope}
        onChange={(v) => {
          setScope(v);
          setDuplicate(false);
        }}
        options={[
          { value: 'overall', label: 'Overall' },
          { value: 'category', label: 'One category' },
        ]}
      />
      {scope === 'category' && (
        <Select
          label="Category"
          value={category}
          onChange={(v) => {
            setCategory(v as Category);
            setDuplicate(false);
          }}
          options={CATEGORY_OPTIONS}
        />
      )}
      <RadioGroup<Period>
        legend="Period"
        value={period}
        onChange={(v) => {
          setPeriod(v);
          setDuplicate(false);
        }}
        options={[
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
        ]}
      />
      <MoneyField
        label="Limit"
        currency={currency}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setAmountError(undefined);
        }}
        error={amountError}
      />
      <Switch
        label="Reserve what's left"
        hint="Hold back the unspent part of this limit in your available balance."
        checked={reserve}
        onChange={setReserve}
      />
      {duplicate && (
        <p role="alert" className="text-danger text-sm font-semibold">
          You already have this limit.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {limit ? (
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

/** Add or edit a limit. `limit` undefined = closed, null = new. */
export function LimitDialog({
  limit,
  onClose,
}: {
  limit: BudgetLimit | null | undefined;
  onClose(): void;
}) {
  return (
    <Dialog
      open={limit !== undefined}
      title={limit ? 'Edit limit' : 'Add a limit'}
      onClose={onClose}
    >
      {limit !== undefined && <LimitForm key={limit?.id ?? 'new'} limit={limit} onDone={onClose} />}
    </Dialog>
  );
}
