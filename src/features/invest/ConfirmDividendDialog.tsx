import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { TextField } from '@/components/ui/TextField';
import type { ExpectedPayout } from '@/domain/dividends';
import { formatDay } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { FUTURE } from '@/store/financeActions';
import { useApp } from '@/store/AppStoreProvider';
import { SOLD_NO_REINVEST, type DividendInput } from '@/store/investActions';
import { useCurrency, useToday } from '@/store/useFinance';
import { useInvestActions } from '@/store/useInvest';

type Bucket = DividendInput['bucket'];

const BUCKETS: Array<{ value: Bucket; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'savings', label: 'Savings' },
  { value: 'passive', label: 'Passive' },
  { value: 'reinvest', label: 'Reinvest' },
];

interface Errors {
  amount?: string;
  paidOn?: string;
  bucket?: string;
}

function ConfirmForm({ payout, onDone }: { payout: ExpectedPayout; onDone(): void }) {
  const { confirmDividend } = useInvestActions();
  const currency = useCurrency();
  const today = useToday();
  const run = useAction();
  // A payout of a holding sold since has no holding to reinvest in.
  const sold = useApp((s) => !s.data.tables.holding.some((h) => h.id === payout.holding.id));

  // What the payout was expected to be; the person corrects it to what really arrived.
  const [amount, setAmount] = useState<number | null>(payout.net);
  const [paidOn, setPaidOn] = useState(payout.payDate);
  const [bucket, setBucket] = useState<Bucket>('cash');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    if (amount === null) found.amount = 'Enter an amount like 12.50';
    else if (amount <= 0) found.amount = "Enter what you received, or choose Didn't get it";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) found.paidOn = 'Choose the day it arrived';
    else if (paidOn > today) found.paidOn = FUTURE;
    if (sold && bucket === 'reinvest') found.bucket = SOLD_NO_REINVEST;
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    // A failure (reinvesting with no price) shows as a message and leaves the dialog open.
    const ok = await run(() => confirmDividend(payout, { amount: amount!, paidOn, bucket }), {
      success: 'Dividend confirmed.',
    });
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <MoneyField
        label="Amount received"
        currency={currency}
        value={amount}
        error={errors.amount}
        onChange={(v) => {
          setAmount(v);
          setErrors((f) => ({ ...f, amount: undefined }));
        }}
      />
      <TextField
        label="Date"
        type="date"
        max={today}
        value={paidOn}
        error={errors.paidOn}
        onChange={(e) => {
          setPaidOn(e.target.value);
          setErrors((f) => ({ ...f, paidOn: undefined }));
        }}
      />
      <RadioGroup<Bucket>
        legend="Where did it go?"
        value={bucket}
        error={errors.bucket}
        onChange={(b) => {
          setBucket(b);
          setErrors((f) => ({ ...f, bucket: undefined }));
        }}
        options={BUCKETS}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Confirm
        </Button>
      </div>
    </form>
  );
}

/** Confirms that a due payout arrived: how much, when, and where it went. `payout` null = closed. */
export function ConfirmDividendDialog({
  payout,
  onClose,
}: {
  payout: ExpectedPayout | null;
  onClose(): void;
}) {
  return (
    <Dialog
      open={payout !== null}
      title={payout ? `Confirm ${payout.holding.symbol} dividend` : 'Confirm dividend'}
      description={
        payout ? `${payout.holding.name} · paid ${formatDay(payout.payDate)}` : undefined
      }
      onClose={onClose}
    >
      {payout && (
        <ConfirmForm
          key={`${payout.holding.id}:${payout.payDate}`}
          payout={payout}
          onDone={onClose}
        />
      )}
    </Dialog>
  );
}
