import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import { limitMessage } from '@/domain/alerts';
import { categoryLabel, type LimitStatus } from '@/domain/budget';
import { CategorySchema, type Category, type Cycle, type PaymentMethod } from '@/domain/entities';
import { toast } from '@/lib/toast';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import type { ExpenseInput } from '@/store/financeActions';
import { useCurrency, useFinanceActions, useToday } from '@/store/useFinance';
import { DateField } from './DateField';
import { pastDateProblem } from './pastDate';

const CATEGORY_OPTIONS = CategorySchema.options.map((c) => ({ value: c, label: categoryLabel(c) }));

const REPEAT_OPTIONS = [
  { value: 'none', label: "Doesn't repeat" },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const CARD_PREFIX = 'card:';

export function ExpenseForm({ onDone }: { onDone(): void }) {
  const actions = useFinanceActions();
  const currency = useCurrency();
  const today = useToday();
  const tone = useApp((s) => s.data.tables.settings[0]?.warningTone ?? 'motivational');
  const debts = useApp((s) => s.data.tables.debt);
  const run = useAction();

  const [amount, setAmount] = useState<number | null>(null);
  const [category, setCategory] = useState<Category>('food');
  const [date, setDate] = useState(today);
  const [paidWith, setPaidWith] = useState('cash');
  const [note, setNote] = useState('');
  const [repeat, setRepeat] = useState('none');
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});
  const [crossing, setCrossing] = useState<LimitStatus[] | null>(null);
  const [busy, setBusy] = useState(false);

  const paidWithOptions = useMemo(
    () => [
      { value: 'cash', label: 'Cash' },
      { value: 'debit', label: 'Debit card' },
      ...debts
        .filter((d) => d.kind === 'credit_card')
        .map((d) => ({ value: `${CARD_PREFIX}${d.id}`, label: d.name })),
      { value: 'other', label: 'Other' },
    ],
    [debts],
  );

  function input(): ExpenseInput {
    const onCard = paidWith.startsWith(CARD_PREFIX);
    return {
      amount: amount ?? 0,
      category,
      date,
      note: note.trim(),
      paymentMethod: onCard ? 'credit_card' : (paidWith as PaymentMethod),
      cardId: onCard ? paidWith.slice(CARD_PREFIX.length) : null,
      repeat: repeat === 'none' ? null : (repeat as Cycle),
    };
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

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = {
      amount: amount === null || amount <= 0 ? 'Enter an amount like 12.50' : undefined,
      date: pastDateProblem(date, today) ?? undefined,
    };
    setErrors(found);
    if (found.amount || found.date) return;

    const expense = input();
    if (tone === 'strict') {
      const over = actions.wouldCrossOver(expense);
      if (over.length > 0) {
        setCrossing(over);
        return;
      }
    }
    void persist(expense);
  }

  const first = crossing?.[0];

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <MoneyField
        label="Amount"
        currency={currency}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setErrors((x) => ({ ...x, amount: undefined }));
        }}
        error={errors.amount}
        autoFocus
      />
      <RadioGroup<Category>
        legend="Category"
        value={category}
        onChange={setCategory}
        options={CATEGORY_OPTIONS}
      />
      <DateField
        value={date}
        today={today}
        error={errors.date}
        onChange={(v) => {
          setDate(v);
          setErrors((x) => ({ ...x, date: undefined }));
        }}
      />
      <Select
        label="Paid with"
        value={paidWith}
        onChange={setPaidWith}
        options={paidWithOptions}
        hint={
          paidWith.startsWith(CARD_PREFIX)
            ? 'Adds to the card balance. Paying the card later moves the cash.'
            : undefined
        }
      />
      <TextField
        label="Note"
        autoComplete="off"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Select
        label="Repeats"
        value={repeat}
        onChange={setRepeat}
        options={REPEAT_OPTIONS}
        hint={repeat === 'none' ? undefined : 'Also adds it to your subscriptions.'}
      />
      <div className="flex gap-2 pt-2">
        <Button type="submit" size="lg" disabled={busy}>
          Save
        </Button>
        <Button variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
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
