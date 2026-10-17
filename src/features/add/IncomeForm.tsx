import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { TextField } from '@/components/ui/TextField';
import { useAction } from '@/lib/useAction';
import { useCurrency, useFinanceActions, useToday } from '@/store/useFinance';
import { DateField } from './DateField';
import { pastDateProblem } from './pastDate';

type Source = 'salary' | 'extra';
const DEFAULT_LABEL: Record<Source, string> = { salary: 'Salary', extra: 'Extra income' };

export function IncomeForm({ onDone }: { onDone(): void }) {
  const { addIncome } = useFinanceActions();
  const currency = useCurrency();
  const today = useToday();
  const run = useAction();

  const [amount, setAmount] = useState<number | null>(null);
  const [source, setSource] = useState<Source>('salary');
  const [label, setLabel] = useState(DEFAULT_LABEL.salary);
  const [date, setDate] = useState(today);
  const [bucket, setBucket] = useState<'cash' | 'savings'>('cash');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});
  const [busy, setBusy] = useState(false);

  function changeSource(next: Source) {
    // Keep a label the user typed; swap only the default one.
    if (label === DEFAULT_LABEL[source]) setLabel(DEFAULT_LABEL[next]);
    setSource(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = {
      amount: amount === null || amount <= 0 ? 'Enter an amount like 12.50' : undefined,
      date: pastDateProblem(date, today) ?? undefined,
    };
    setErrors(found);
    if (found.amount || found.date) return;

    setBusy(true);
    const saved = await run(
      () =>
        addIncome({
          amount: amount ?? 0,
          source,
          label: label.trim() || DEFAULT_LABEL[source],
          date,
          bucket,
          note: note.trim(),
        }),
      { success: 'Income saved.' },
    );
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <MoneyField
        variant="line"
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
      <RadioGroup<Source>
        variant="underline"
        legend="Source"
        value={source}
        onChange={changeSource}
        options={[
          { value: 'salary', label: 'Salary' },
          { value: 'extra', label: 'Extra' },
        ]}
      />
      <TextField
        variant="line"
        label="Label"
        autoComplete="off"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
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
      <RadioGroup<'cash' | 'savings'>
        variant="underline"
        legend="Goes to"
        value={bucket}
        onChange={setBucket}
        options={[
          { value: 'cash', label: 'Cash' },
          { value: 'savings', label: 'Savings' },
        ]}
      />
      <TextField
        variant="line"
        label="Note"
        autoComplete="off"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2 pt-2">
        <Button type="submit" size="lg" disabled={busy}>
          Save
        </Button>
        <Button variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
