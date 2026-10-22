import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import type { ExpectedPayout } from '@/domain/dividends';
import { NOT_CREDIT, useAccountOptions, useStartAccountId } from '@/features/shared/AccountField';
import { formatDay } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { FUTURE } from '@/store/financeActions';
import { useApp } from '@/store/AppStoreProvider';
import { SOLD_NO_REINVEST } from '@/store/investActions';
import { useCurrency, useToday } from '@/store/useFinance';
import { useInvestActions } from '@/store/useInvest';

/** The choice that buys more shares; every other value is the id of the account paid into. */
const REINVEST = 'reinvest';

interface Errors {
  amount?: string;
  paidOn?: string;
  to?: string;
}

function ConfirmForm({ payout, onDone }: { payout: ExpectedPayout; onDone(): void }) {
  const { confirmDividend } = useInvestActions();
  const currency = useCurrency();
  const today = useToday();
  const run = useAction();
  // A payout of a holding sold since has no holding to reinvest in.
  const sold = useApp((s) => !s.data.tables.holding.some((h) => h.id === payout.holding.id));
  // The accounts money can arrive on (never a credit card), then reinvesting.
  const accounts = useAccountOptions(NOT_CREDIT);
  const startAccount = useStartAccountId(NOT_CREDIT);

  // What the payout was expected to be; the person corrects it to what really arrived.
  const [amount, setAmount] = useState<number | null>(payout.net);
  const [paidOn, setPaidOn] = useState(payout.payDate);
  // The default account, as most payouts land there; reinvesting when there is no account.
  const [to, setTo] = useState(startAccount || REINVEST);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    if (amount === null) found.amount = 'Enter an amount like 12.50';
    else if (amount <= 0) found.amount = "Enter what you received, or choose Didn't get it";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) found.paidOn = 'Choose the day it arrived';
    else if (paidOn > today) found.paidOn = FUTURE;
    if (sold && to === REINVEST) found.to = SOLD_NO_REINVEST;
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    // A failure (reinvesting with no price) shows as a message and leaves the dialog open.
    const ok = await run(
      () =>
        confirmDividend(payout, {
          amount: amount!,
          paidOn,
          to: to === REINVEST ? REINVEST : { accountId: to },
        }),
      { success: 'Dividend confirmed.' },
    );
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <MoneyField
        variant="line"
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
        variant="line"
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
      <Select
        variant="line"
        label="Where did it go?"
        value={to}
        error={errors.to}
        onChange={(v) => {
          setTo(v);
          setErrors((f) => ({ ...f, to: undefined }));
        }}
        options={[...accounts, { value: REINVEST, label: 'Reinvest' }]}
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
