import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import { limitMessage } from '@/domain/alerts';
import type { LimitStatus } from '@/domain/budget';
import type { Category, Cycle, Expense } from '@/domain/entities';
import { toast } from '@/lib/toast';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import type { ExpenseInput } from '@/store/financeActions';
import { useCurrency, useFinanceActions, useToday } from '@/store/useFinance';
import { CATEGORY_OPTIONS } from '@/features/shared/categories';
import { AccountField, NOT_FROZEN, useStartAccountId } from '@/features/shared/AccountField';
import { DateField } from './DateField';
import { pastDateProblem } from './pastDate';

const REPEAT_OPTIONS = [
  { value: 'none', label: "Doesn't repeat" },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

/** Adds an expense, or edits `expense` when given (no repeat, no limit check, plus Delete). */
export function ExpenseForm({ onDone, expense }: { onDone(): void; expense?: Expense }) {
  const actions = useFinanceActions();
  const currency = useCurrency();
  const today = useToday();
  const tone = useApp((s) => s.data.tables.settings[0]?.warningTone ?? 'motivational');
  const run = useAction();

  const [amount, setAmount] = useState<number | null>(expense?.amount ?? null);
  const [category, setCategory] = useState<Category>(expense?.category ?? 'food');
  const [date, setDate] = useState(expense?.date ?? today);
  const startAccountId = useStartAccountId(NOT_FROZEN);
  const [accountId, setAccountId] = useState(expense?.accountId ?? startAccountId);
  const paidOnCard = useApp(
    (s) => s.data.tables.account.find((a) => a.id === accountId)?.kind === 'credit',
  );
  const [note, setNote] = useState(expense?.note ?? '');
  const [repeat, setRepeat] = useState('none');
  const [errors, setErrors] = useState<{ amount?: string; date?: string; account?: string }>({});
  const [crossing, setCrossing] = useState<LimitStatus[] | null>(null);
  const [busy, setBusy] = useState(false);

  function fields(): Omit<ExpenseInput, 'repeat'> {
    return { amount: amount ?? 0, category, date, note: note.trim(), accountId };
  }

  function input(): ExpenseInput {
    return { ...fields(), repeat: repeat === 'none' ? null : (repeat as Cycle) };
  }

  async function persist(expense: ExpenseInput) {
    setCrossing(null);
    setBusy(true);
    let alerts: LimitStatus[] = [];
    const saved = await run(
      async () => {
        ({ alerts } = await actions.addExpense(expense));
      },
      { success: 'Expense saved.' },
    );
    setBusy(false);
    if (!saved) return;
    for (const alert of alerts) toast('warning', limitMessage(tone, alert));
    onDone();
  }

  async function update(id: string) {
    setBusy(true);
    const saved = await run(() => actions.updateExpense(id, fields()), {
      success: 'Expense updated.',
    });
    setBusy(false);
    if (saved) onDone();
  }

  async function remove(id: string) {
    setBusy(true);
    const removed = await run(() => actions.deleteExpense(id), { success: 'Expense deleted.' });
    setBusy(false);
    if (removed) onDone();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = {
      amount: amount === null || amount <= 0 ? 'Enter an amount like 12.50' : undefined,
      date: pastDateProblem(date, today) ?? undefined,
      account: accountId ? undefined : 'Pick an account.',
    };
    setErrors(found);
    if (found.amount || found.date || found.account) return;
    if (expense) return void update(expense.id);

    const next = input();
    if (tone === 'strict') {
      const over = actions.wouldCrossOver(next);
      if (over.length > 0) {
        setCrossing(over);
        return;
      }
    }
    void persist(next);
  }

  const first = crossing?.[0];

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <MoneyField
        variant="line"
        large
        label="Amount"
        currency={currency}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setErrors((x) => ({ ...x, amount: undefined }));
        }}
        error={errors.amount}
        autoFocus={!expense}
      />
      {/* Chips, one tap each, as before: eight underline tabs would wrap badly. */}
      <RadioGroup<Category>
        legend="Category"
        value={category}
        onChange={setCategory}
        options={CATEGORY_OPTIONS}
      />
      <DateField
        variant="line"
        value={date}
        today={today}
        error={errors.date}
        onChange={(v) => {
          setDate(v);
          setErrors((x) => ({ ...x, date: undefined }));
        }}
      />
      <AccountField
        label="Paid with"
        value={accountId}
        onChange={(id) => {
          setAccountId(id);
          setErrors((x) => ({ ...x, account: undefined }));
        }}
        filter={NOT_FROZEN}
        keepId={expense?.accountId}
        error={errors.account}
        hint={
          paidOnCard ? 'Adds to the card balance. Paying the card later moves the cash.' : undefined
        }
      />
      <TextField
        variant="line"
        label="Note"
        autoComplete="off"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {!expense && (
        <Select
          variant="line"
          label="Repeats"
          value={repeat}
          onChange={setRepeat}
          options={REPEAT_OPTIONS}
          hint={repeat === 'none' ? undefined : 'Also adds it to your subscriptions.'}
        />
      )}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button type="submit" size={expense ? 'md' : 'lg'} disabled={busy}>
          Save
        </Button>
        <Button variant="ghost" size={expense ? 'md' : 'lg'} onClick={onDone}>
          Cancel
        </Button>
        {expense && (
          <Button
            variant="danger-ghost"
            className="ml-auto"
            disabled={busy}
            onClick={() => void remove(expense.id)}
          >
            Delete
          </Button>
        )}
      </div>

      <Dialog
        open={crossing !== null}
        title="Over your limit?"
        description={first ? limitMessage('strict', first) : undefined}
        onClose={() => setCrossing(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setCrossing(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void persist(input())}>
              Save anyway
            </Button>
          </>
        }
      />
    </form>
  );
}
