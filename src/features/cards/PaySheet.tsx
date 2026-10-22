import { Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { ACCOUNT_FROZEN, archivedBy } from '@/domain/accounts';
import { limitMessage } from '@/domain/alerts';
import { categoryLabel, type LimitStatus } from '@/domain/budget';
import type { Account, Category } from '@/domain/entities';
import { CATEGORY_OPTIONS } from '@/features/shared/categories';
import { toast } from '@/lib/toast';
import { useAction } from '@/lib/useAction';
import type { PaymentInput } from '@/services/payment';
import { useApp } from '@/store/AppStoreProvider';
import {
  useCurrency,
  useFinanceActions,
  useMoney,
  usePaymentService,
  useToday,
} from '@/store/useFinance';

const ENTER = 'Enter an amount like 12.50';

/** What was paid, said once it has gone through. */
type Paid = { amount: number; category: Category };

/**
 * The payment form: how much, for what, and a note, then Pay, which reads "Paying…" while it goes
 * through. It warns about limits as the expense form does: under the strict tone it asks before a
 * payment that would take a limit past 100%, and afterwards each limit the payment crossed is a
 * toast in the person's tone.
 */
function PayForm({ account, onPaid }: { account: Account; onPaid(paid: Paid): void }) {
  const payments = usePaymentService();
  const { wouldCrossOver } = useFinanceActions();
  const currency = useCurrency();
  const today = useToday();
  const tone = useApp((s) => s.data.tables.settings[0]?.warningTone ?? 'motivational');
  const run = useAction();
  const [amount, setAmount] = useState<number | null>(null);
  const [category, setCategory] = useState<Category>('food');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [crossing, setCrossing] = useState<LimitStatus[] | null>(null);
  const [busy, setBusy] = useState(false);

  const input = (paid: number): PaymentInput => ({
    accountId: account.id,
    amount: paid,
    category,
    note: note.trim(),
    date: today,
  });

  async function pay(payment: PaymentInput) {
    setCrossing(null);
    setBusy(true);
    let alerts: LimitStatus[] = [];
    const done = await run(async () => {
      ({ alerts } = await payments.pay(payment));
    });
    setBusy(false);
    if (!done) return;
    for (const alert of alerts) toast('warning', limitMessage(tone, alert));
    onPaid({ amount: payment.amount, category: payment.category });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (amount === null || amount <= 0) return setError(ENTER);
    const payment = input(amount);
    if (tone === 'strict') {
      const over = wouldCrossOver({ ...payment, repeat: null });
      if (over.length > 0) return setCrossing(over);
    }
    void pay(payment);
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
          setError(undefined);
        }}
        error={error}
        hint={account.kind === 'credit' ? 'Adds to what you owe on the card.' : undefined}
        autoFocus
      />
      <RadioGroup<Category>
        legend="Category"
        value={category}
        onChange={setCategory}
        options={CATEGORY_OPTIONS}
      />
      <TextField
        variant="line"
        label="Note"
        autoComplete="off"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? 'Paying…' : 'Pay'}
      </Button>

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
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => amount !== null && void pay(input(amount))}
            >
              Pay anyway
            </Button>
          </>
        }
      />
    </form>
  );
}

/**
 * Pays with an account: the Pay of the Cards tab, and of Home. Open while `accountId` names an
 * account in use. The payment goes through the payment service (an expense on the account: a bank
 * account, cash or savings holds less, a credit card owes more), and the sheet then says it is done.
 * A frozen account can't pay, and says so.
 */
export function PaySheet({ accountId, onClose }: { accountId: string | null; onClose(): void }) {
  const today = useToday();
  const money = useMoney();
  const account = useApp((s) =>
    s.data.tables.account.find((a) => a.id === accountId && !archivedBy(a, today)),
  );
  const [paid, setPaid] = useState<Paid | null>(null);
  // A new payment starts on the form again: what was paid is forgotten when the sheet closes.
  const close = () => {
    setPaid(null);
    onClose();
  };

  return (
    <Sheet
      open={account !== undefined}
      title={account ? `Pay with ${account.name}` : ''}
      showTitle
      onClose={close}
    >
      {account &&
        (paid ? (
          <div className="flex flex-col items-center gap-2 pt-2 pb-1 text-center">
            <span className="btn-accent grid size-14 place-items-center rounded-full">
              <Check aria-hidden="true" className="size-7" />
            </span>
            <p role="status" className="text-section mt-2">
              Paid
            </p>
            <p className="text-muted text-[15px] font-semibold">
              {`${money(paid.amount)} for ${categoryLabel(paid.category)} with ${account.name}.`}
            </p>
            <Button size="lg" className="mt-4 w-full" onClick={close}>
              Done
            </Button>
          </div>
        ) : account.frozen ? (
          <p className="text-muted text-[15px] font-semibold">{ACCOUNT_FROZEN}</p>
        ) : (
          <PayForm key={account.id} account={account} onPaid={setPaid} />
        ))}
    </Sheet>
  );
}
