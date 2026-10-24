import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { TextField } from '@/components/ui/TextField';
import { activeAccounts } from '@/domain/accounts';
import { DateField } from '@/features/add/DateField';
import { pastDateProblem } from '@/features/add/pastDate';
import { AccountField, NOT_CREDIT, useStartAccountId } from '@/features/shared/AccountField';
import { MoveToField, useNowhereToMove } from '@/features/shared/MoveToField';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { SAME_ACCOUNT } from '@/store/financeActions';
import { useCurrency, useFinanceActions, useMoney, useToday } from '@/store/useFinance';

const ENTER = 'Enter an amount like 12.50';
const PICK = 'Pick an account.';

type Errors = { amount?: string; from?: string; to?: string; date?: string };

/**
 * The form: how much, from where, to where, when and a note. Money moves between a bank account, cash
 * and savings, never a credit card (`transfer`'s rules, whose words the store gives for an account
 * gone since). It starts from `fromId` when that can pay, else the default account, and goes to the
 * first savings account in use that is not where it comes from, else the first other one. With only
 * one account that can hold money there is nowhere to move it: where "To" would be it says to add
 * another on the Cards tab, and Move stays off (`MoveToField`).
 */
function MoveMoneyForm({ fromId, onDone }: { fromId: string | null; onDone(): void }) {
  const { transfer } = useFinanceActions();
  const currency = useCurrency();
  const money = useMoney();
  const today = useToday();
  const run = useAction();
  const accounts = useApp((s) => s.data.tables.account);
  const holding = activeAccounts(accounts, today).filter(NOT_CREDIT);
  const nowhere = useNowhereToMove();
  const startFrom = useStartAccountId(NOT_CREDIT);
  const [from, setFrom] = useState(
    holding.some((a) => a.id === fromId) ? (fromId as string) : startFrom,
  );
  const [to, setTo] = useState(() => {
    const others = holding.filter((a) => a.id !== from);
    return (others.find((a) => a.kind === 'savings') ?? others[0])?.id ?? '';
  });
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (nowhere) return;
    const found: Errors = {
      amount: amount === null || amount <= 0 ? ENTER : undefined,
      from: from ? undefined : PICK,
      to: !to ? PICK : to === from ? SAME_ACCOUNT : undefined,
      date: pastDateProblem(date, today) ?? undefined,
    };
    setErrors(found);
    if (found.amount || found.from || found.to || found.date || amount === null) return;
    setBusy(true);
    const name = accounts.find((a) => a.id === to)?.name ?? 'the account';
    const saved = await run(() => transfer(from, to, amount, date, note.trim()), {
      success: `Moved ${money(amount)} to ${name}.`,
    });
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
      <AccountField
        label="From"
        value={from}
        onChange={(id) => {
          setFrom(id);
          setErrors((x) => ({ ...x, from: undefined, to: undefined }));
        }}
        filter={NOT_CREDIT}
        error={errors.from}
      />
      <MoveToField
        value={to}
        onChange={(id) => {
          setTo(id);
          setErrors((x) => ({ ...x, to: undefined }));
        }}
        error={errors.to}
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
      <TextField
        variant="line"
        label="Note"
        autoComplete="off"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || nowhere}>
          Move
        </Button>
      </div>
    </form>
  );
}

/**
 * Moves money between two of the person's accounts, from Home's ⋯. It starts from the account Home
 * shows (`fromId`) when that can pay.
 */
export function MoveMoneyDialog({
  open,
  fromId,
  onClose,
}: {
  open: boolean;
  fromId: string | null;
  onClose(): void;
}) {
  return (
    <Dialog open={open} title="Move money" onClose={onClose}>
      {/* Mounted only while open, so each one starts empty. */}
      {open && <MoveMoneyForm fromId={fromId} onDone={onClose} />}
    </Dialog>
  );
}
