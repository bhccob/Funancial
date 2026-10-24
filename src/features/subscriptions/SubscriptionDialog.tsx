import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import type { Category, Cycle, Subscription } from '@/domain/entities';
import { CATEGORY_OPTIONS } from '@/features/shared/categories';
import {
  AccountField,
  NEW_CARD,
  NOT_FROZEN,
  useStartAccountId,
} from '@/features/shared/AccountField';
import { LAST4_HINT, last4Problem } from '@/features/shared/last4';
import { useAction } from '@/lib/useAction';
import { useCurrency, useFinanceActions, useToday } from '@/store/useFinance';

const CYCLE_OPTIONS: Array<{ value: Cycle; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const CARD_KINDS: Array<{ value: CardKind; label: string }> = [
  { value: 'debit', label: 'Debit' },
  { value: 'credit', label: 'Credit' },
];

type CardKind = 'debit' | 'credit';
type Errors = {
  name?: string;
  amount?: string;
  nextRenewal?: string;
  account?: string;
  cardName?: string;
  last4?: string;
};

function SubscriptionForm({ sub, onDone }: { sub: Subscription | null; onDone(): void }) {
  const { saveSubscription, deleteSubscription } = useFinanceActions();
  const currency = useCurrency();
  const today = useToday();
  const run = useAction();

  const [name, setName] = useState(sub?.name ?? '');
  const [amount, setAmount] = useState<number | null>(sub?.amount ?? null);
  const [cycle, setCycle] = useState<Cycle>(sub?.cycle ?? 'monthly');
  const [nextRenewal, setNextRenewal] = useState(sub?.nextRenewal ?? '');
  const [category, setCategory] = useState<Category>(sub?.category ?? 'entertainment');
  const startAccountId = useStartAccountId(NOT_FROZEN);
  const [accountId, setAccountId] = useState(sub?.accountId ?? startAccountId);
  // The card "+ New card" makes; Debit unless asked, as a credit card with no due day shows all it
  // owes as due today.
  const [cardName, setCardName] = useState('');
  const [last4, setLast4] = useState('');
  const [cardKind, setCardKind] = useState<CardKind>('debit');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const makingCard = accountId === NEW_CARD;

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
      account: accountId ? undefined : 'Pick an account.',
      cardName: makingCard && !cardName.trim() ? 'Name the card.' : undefined,
      last4: makingCard ? last4Problem(last4) : undefined,
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

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
          accountId,
          // The card is made with the subscription, in one write, and not before.
          ...(makingCard
            ? { newCard: { name: cardName.trim(), last4: last4.trim() || null, kind: cardKind } }
            : {}),
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
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      {/* Plain rows, one hairline under each: the label on the left, the value on the right. */}
      <div>
        <TextField
          variant="row"
          label="Name"
          autoComplete="off"
          value={name}
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {/* The dialog is about one amount: the big figure, then how often it is charged. */}
      <MoneyField
        size="hero"
        label="Amount"
        currency={currency}
        value={amount}
        onChange={setAmount}
        error={errors.amount}
      />
      {/* Four short choices, one tap each: pills, as in the add forms, compact to fit one line. */}
      <RadioGroup<Cycle>
        variant="pills"
        compact
        legend="Cycle"
        value={cycle}
        onChange={setCycle}
        options={CYCLE_OPTIONS}
      />
      <div>
        <TextField
          variant="row"
          label="Next renewal"
          type="date"
          min={today}
          value={nextRenewal}
          error={errors.nextRenewal}
          onChange={(e) => setNextRenewal(e.target.value)}
        />
        <Select
          variant="row"
          label="Category"
          value={category}
          onChange={(v) => setCategory(v as Category)}
          options={CATEGORY_OPTIONS}
        />
        <AccountField
          variant="row"
          label="Paid with"
          value={accountId}
          onChange={(id) => {
            setAccountId(id);
            setErrors((x) => ({ ...x, account: undefined, cardName: undefined, last4: undefined }));
          }}
          filter={NOT_FROZEN}
          keepId={sub?.accountId}
          error={errors.account}
          newCard
        />
        {/* A card that does not exist yet: made when the subscription is saved, not before. */}
        {makingCard && (
          <>
            <TextField
              variant="row"
              label="Card name"
              autoComplete="off"
              value={cardName}
              error={errors.cardName}
              onChange={(e) => {
                setCardName(e.target.value);
                setErrors((x) => ({ ...x, cardName: undefined }));
              }}
            />
            <TextField
              variant="row"
              label="Last 4 digits"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={last4}
              error={errors.last4}
              hint={errors.last4 ? undefined : LAST4_HINT}
              onChange={(e) => {
                setLast4(e.target.value);
                setErrors((x) => ({ ...x, last4: undefined }));
              }}
            />
          </>
        )}
      </div>
      {makingCard && (
        <RadioGroup<CardKind>
          variant="pills"
          legend="Kind"
          value={cardKind}
          options={CARD_KINDS}
          onChange={setCardKind}
        />
      )}
      {sub && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
