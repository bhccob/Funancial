import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { TextField } from '@/components/ui/TextField';
import { AccountField, NOT_CREDIT, useStartAccountId } from '@/features/shared/AccountField';
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
  const startAccountId = useStartAccountId(NOT_CREDIT);
  const [accountId, setAccountId] = useState(startAccountId);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; date?: string; account?: string }>({});
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
      account: accountId ? undefined : 'Pick an account.',
    };
    setErrors(found);
    if (found.amount || found.date || found.account) return;

    setBusy(true);
    const saved = await run(
      () =>
        addIncome({
          amount: amount ?? 0,
          source,
          label: label.trim() || DEFAULT_LABEL[source],
          date,
          accountId,
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
        size="hero"
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
        variant="pills"
        legend="Source"
        value={source}
        onChange={changeSource}
        options={[
          { value: 'salary', label: 'Salary' },
          { value: 'extra', label: 'Extra' },
        ]}
      />
      {/* Plain rows, one hairline under each: the label on the left, the value on the right. */}
      <div>
        <TextField
          variant="row"
          label="Label"
          autoComplete="off"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <AccountField
          variant="row"
          label="Goes to"
          value={accountId}
          onChange={(id) => {
            setAccountId(id);
            setErrors((x) => ({ ...x, account: undefined }));
          }}
          filter={NOT_CREDIT}
          error={errors.account}
        />
        <DateField
          variant="row"
          value={date}
          today={today}
          error={errors.date}
          onChange={(v) => {
            setDate(v);
            setErrors((x) => ({ ...x, date: undefined }));
          }}
        />
        <TextField
          variant="row"
          label="Note"
          autoComplete="off"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex gap-2 pt-2">
        {/* The one solid button: it takes the room Cancel leaves. */}
        <Button type="submit" size="lg" className="flex-1" disabled={busy}>
          Save
        </Button>
        <Button variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
