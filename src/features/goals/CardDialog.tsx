import { useCallback, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import { accountRemoval } from '@/domain/accounts';
import { accountBalance } from '@/domain/balances';
import type { Account } from '@/domain/entities';
import { AccountField, useStartAccountId } from '@/features/shared/AccountField';
import { formatDate } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { PICK_SUBSCRIPTIONS_TARGET } from '@/store/financeActions';
import { useCurrency, useFinanceActions, useMoney, useToday } from '@/store/useFinance';

/** The card being edited, or `null` for a new one. */
export type CardTarget = { card: Account | null };
type Errors = { name?: string; balance?: string; rate?: string };

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

function CardForm({
  card,
  onDone,
  onDelete,
}: {
  card: Account | null;
  onDone(): void;
  onDelete(): void;
}) {
  const { saveAccount } = useFinanceActions();
  const currency = useCurrency();
  const run = useAction();
  const credit = card?.credit ?? null;

  const [name, setName] = useState(card?.name ?? '');
  const [balance, setBalance] = useState<number | null>(card?.openingBalance ?? null);
  const [rate, setRate] = useState(credit ? String(credit.interestRate) : '');
  const [minimum, setMinimum] = useState<number | null>(credit?.minimumPayment ?? null);
  const [limit, setLimit] = useState<number | null>(credit?.limit ?? null);
  const [dueDay, setDueDay] = useState(String(credit?.dueDay ?? 1));
  const [payInFull, setPayInFull] = useState(credit?.payInFull ?? true);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const interest = rate.trim() === '' ? 0 : Number(rate.replace(',', '.'));
    const found: Errors = {
      name: name.trim() ? undefined : 'Give it a name.',
      balance: balance === null || balance < 0 ? 'Enter an amount like 12.50' : undefined,
      rate: Number.isFinite(interest) && interest >= 0 ? undefined : 'Enter a rate like 19.9',
    };
    setErrors(found);
    if (found.name || found.balance || found.rate) return;
    setBusy(true);
    const ok = await run(
      () =>
        saveAccount({
          ...(card ? { id: card.id } : {}),
          name: name.trim(),
          kind: 'credit',
          last4: card?.last4 ?? null,
          openingBalance: balance ?? 0,
          credit: {
            limit,
            statementDay: credit?.statementDay ?? null,
            dueDay: Number(dueDay),
            payInFull,
            minimumPayment: minimum ?? 0,
            interestRate: interest,
          },
        }),
      { success: card ? 'Saved.' : 'Card added.' },
    );
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <TextField
        variant="line"
        label="Name"
        autoComplete="off"
        value={name}
        error={errors.name}
        onChange={(e) => setName(e.target.value)}
      />
      <MoneyField
        variant="line"
        label={card ? 'Balance when added' : 'Current balance'}
        currency={currency}
        value={balance}
        onChange={setBalance}
        error={errors.balance}
        hint={
          card
            ? `On ${formatDate(card.openingDate)}. Purchases and payments since then are added on top.`
            : undefined
        }
      />
      <TextField
        variant="line"
        label="Interest rate %"
        inputMode="decimal"
        autoComplete="off"
        value={rate}
        error={errors.rate}
        onChange={(e) => setRate(e.target.value)}
      />
      <MoneyField
        variant="line"
        label="Minimum payment"
        currency={currency}
        value={minimum}
        onChange={setMinimum}
      />
      <MoneyField
        variant="line"
        label="Credit limit"
        currency={currency}
        value={limit}
        onChange={setLimit}
        hint="Optional."
      />
      <Select
        variant="line"
        label="Due day"
        value={dueDay}
        onChange={setDueDay}
        options={DAY_OPTIONS}
      />
      <Switch label="Pay in full each month" checked={payInFull} onChange={setPayInFull} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {card ? (
          <Button variant="danger-ghost" disabled={busy} onClick={onDelete}>
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

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Asks before a card goes, saying what `deleteAccount` will do: whether it is archived instead (and
 * what it still owes), and where the subscriptions paid with it move to, which the person picks
 * (starting on the default account). Always mounted, so closing it hands focus back to the Delete
 * button; what was picked is forgotten on the way out.
 */
function DeleteCardDialog({
  card,
  onCancel,
  onDone,
}: {
  card: Account | null;
  onCancel(): void;
  onDone(): void;
}) {
  const { deleteAccount } = useFinanceActions();
  const data = useApp((s) => s.data);
  const today = useToday();
  const money = useMoney();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const cardId = card?.id;
  // Any account in use but the card itself.
  const elsewhere = useCallback((a: Account) => a.id !== cardId, [cardId]);
  const start = useStartAccountId(elsewhere);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const moveTo = picked ?? start;
  const forget = () => {
    setPicked(null);
    setError(undefined);
  };

  let title = '';
  let description = '';
  let archive = false;
  let moved = 0;
  if (card) {
    const removal = accountRemoval(data, card.id);
    archive = removal.archive;
    const owed = archive ? accountBalance(card, data, today) : 0;
    moved = removal.subscriptions.length;
    title = `${archive ? 'Archive' : 'Delete'} ${card.name}?`;
    description = [
      archive
        ? `${card.name} has past expenses or payments, so it is archived: it leaves Debts, bills and "Paid with", and past expenses keep its name.`
        : `${card.name} will be deleted.`,
      owed > 0 && `The ${money(owed)} still owed on it stops counting toward what you owe.`,
      moved > 0 &&
        `${moved} ${plural(moved, 'subscription', 'subscriptions')} paid with it ${plural(moved, 'moves', 'move')} to the account you pick below.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  async function confirm() {
    if (!card) return;
    if (moved > 0 && moveTo === '') return setError(PICK_SUBSCRIPTIONS_TARGET);
    setBusy(true);
    const ok = await run(
      () => deleteAccount(card.id, { moveSubscriptionsTo: moved > 0 ? moveTo : null }),
      { success: `${card.name} ${archive ? 'archived' : 'deleted'}.` },
    );
    setBusy(false);
    forget();
    if (ok) onDone();
    else onCancel();
  }
  const cancel = () => {
    forget();
    onCancel();
  };

  return (
    <Dialog
      open={card !== null}
      title={title}
      description={description}
      onClose={cancel}
      actions={
        <>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
            {archive ? 'Archive' : 'Delete'}
          </Button>
        </>
      }
    >
      {moved > 0 && (
        <AccountField
          label="Move its subscriptions to"
          value={moveTo}
          onChange={(id) => {
            setPicked(id);
            setError(undefined);
          }}
          filter={elsewhere}
          error={error}
        />
      )}
    </Dialog>
  );
}

/** Add or edit a credit card: an account of kind `credit`. */
export function CardDialog({ target, onClose }: { target: CardTarget | null; onClose(): void }) {
  // Beside the form's dialog, not in it: Escape on the ask must not close both.
  const [deleting, setDeleting] = useState<Account | null>(null);
  return (
    <>
      <Dialog
        open={target !== null}
        title={target ? (target.card ? 'Edit card' : 'Add a card') : ''}
        onClose={onClose}
      >
        {target && (
          <CardForm
            key={target.card?.id ?? 'new'}
            card={target.card}
            onDone={onClose}
            onDelete={() => setDeleting(target.card)}
          />
        )}
      </Dialog>
      <DeleteCardDialog
        card={deleting}
        onCancel={() => setDeleting(null)}
        onDone={() => {
          setDeleting(null);
          onClose();
        }}
      />
    </>
  );
}
