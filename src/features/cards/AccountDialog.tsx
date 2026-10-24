import { useCallback, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import { accountRemoval, defaultsFor } from '@/domain/accounts';
import { accountBalance } from '@/domain/balances';
import type { Account, AccountKind } from '@/domain/entities';
import { AccountField, useStartAccountId } from '@/features/shared/AccountField';
import { formatDate } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { PICK_SUBSCRIPTIONS_TARGET } from '@/store/financeActions';
import { useCurrency, useFinanceActions, useMoney, useToday } from '@/store/useFinance';
import { KIND_LABEL } from './cardText';

/**
 * The account being edited, or `null` for a new one. A new one can come with its `kind` fixed, as the
 * Debts page's "Add card" adds a credit card; otherwise it is picked, starting on a bank account.
 */
export type AccountTarget = { account: Account | null; kind?: AccountKind };
type Errors = { name?: string; last4?: string; balance?: string; rate?: string };

const KINDS: { value: AccountKind; label: string }[] = (
  ['debit', 'credit', 'savings', 'cash'] as const
).map((value) => ({ value, label: KIND_LABEL[value] }));

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

/** What an edited account's opening balance is, and how what came after counts on top. */
function sinceHint(account: Account): string {
  const on = `On ${formatDate(account.openingDate)}.`;
  return account.kind === 'credit'
    ? `${on} Purchases and payments since then are added on top.`
    : `${on} What came in and went out since then is added on top.`;
}

function AccountForm({
  account,
  fixedKind,
  onDone,
  onDelete,
}: {
  account: Account | null;
  fixedKind?: AccountKind;
  onDone(): void;
  onDelete(): void;
}) {
  const { saveAccount } = useFinanceActions();
  const currency = useCurrency();
  const run = useAction();
  const credit = account?.credit ?? null;
  // An account with history keeps its kind: that history would read differently under another.
  const hasHistory = useApp((s) => (account ? accountRemoval(s.data, account.id).archive : false));

  const [kind, setKind] = useState<AccountKind>(account?.kind ?? fixedKind ?? 'debit');
  const [name, setName] = useState(account?.name ?? '');
  const [last4, setLast4] = useState(account?.last4 ?? '');
  const [balance, setBalance] = useState<number | null>(account?.openingBalance ?? null);
  // Whether it counts in Available: the person's pick, else the account's own, else its kind's.
  const [counted, setCounted] = useState<boolean | null>(null);
  const [rate, setRate] = useState(credit ? String(credit.interestRate) : '');
  const [minimum, setMinimum] = useState<number | null>(credit?.minimumPayment ?? null);
  const [limit, setLimit] = useState<number | null>(credit?.limit ?? null);
  const [dueDay, setDueDay] = useState(String(credit?.dueDay ?? 1));
  const [payInFull, setPayInFull] = useState(credit?.payInFull ?? true);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const isCredit = kind === 'credit';
  const inAvailable =
    counted ?? (account?.kind === kind ? account.inAvailable : defaultsFor(kind).inAvailable);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const interest = rate.trim() === '' ? 0 : Number(rate.replace(',', '.'));
    const digits = last4.trim();
    const found: Errors = {
      name: name.trim() ? undefined : 'Give it a name.',
      last4: digits === '' || /^\d{4}$/.test(digits) ? undefined : 'Use the last 4 digits.',
      balance: balance === null || balance < 0 ? 'Enter an amount like 12.50' : undefined,
      rate:
        !isCredit || (Number.isFinite(interest) && interest >= 0)
          ? undefined
          : 'Enter a rate like 19.9',
    };
    setErrors(found);
    if (found.name || found.last4 || found.balance || found.rate) return;
    setBusy(true);
    const ok = await run(
      () =>
        saveAccount({
          ...(account ? { id: account.id } : {}),
          name: name.trim(),
          kind,
          last4: digits || null,
          openingBalance: balance ?? 0,
          // A credit card never counts in Available, so it is not asked.
          ...(isCredit ? {} : { inAvailable }),
          credit: isCredit
            ? {
                limit,
                statementDay: credit?.statementDay ?? null,
                dueDay: Number(dueDay),
                payInFull,
                minimumPayment: minimum ?? 0,
                interestRate: interest,
              }
            : null,
        }),
      { success: account ? 'Saved.' : 'Card added.' },
    );
    setBusy(false);
    if (ok) onDone();
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
      {fixedKind && !account ? null : hasHistory ? (
        <p className="text-muted text-sm font-semibold">
          {`${KIND_LABEL[kind]} · It has history, so it keeps its kind.`}
        </p>
      ) : (
        // Four short choices, one tap each: pills, as in the add forms.
        <RadioGroup<AccountKind>
          variant="pills"
          legend="Kind"
          value={kind}
          options={KINDS}
          onChange={setKind}
        />
      )}
      <div>
        <TextField
          variant="row"
          label="Last 4 digits"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={last4}
          error={errors.last4}
          hint={errors.last4 ? undefined : 'Optional. Only to tell your cards apart.'}
          onChange={(e) => {
            setLast4(e.target.value);
            setErrors((x) => ({ ...x, last4: undefined }));
          }}
        />
        <MoneyField
          variant="row"
          label={account ? 'Balance when added' : 'Current balance'}
          currency={currency}
          value={balance}
          onChange={setBalance}
          error={errors.balance}
          hint={account ? sinceHint({ ...account, kind }) : undefined}
        />
        {isCredit ? (
          <>
            <TextField
              variant="row"
              label="Interest rate %"
              inputMode="decimal"
              autoComplete="off"
              value={rate}
              error={errors.rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <MoneyField
              variant="row"
              label="Minimum payment"
              currency={currency}
              value={minimum}
              onChange={setMinimum}
            />
            <MoneyField
              variant="row"
              label="Credit limit"
              currency={currency}
              value={limit}
              onChange={setLimit}
              hint="Optional."
            />
            <Select
              variant="row"
              label="Due day"
              value={dueDay}
              onChange={setDueDay}
              options={DAY_OPTIONS}
            />
            <Switch
              variant="row"
              label="Pay in full each month"
              checked={payInFull}
              onChange={setPayInFull}
            />
          </>
        ) : (
          <Switch
            variant="row"
            label="Count it in Available to spend"
            checked={inAvailable}
            onChange={setCounted}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {account ? (
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
 * Asks before an account goes, saying what `deleteAccount` will do: whether it is archived instead
 * (and what it still holds or owes), and where the subscriptions paid with it move to, which the
 * person picks (starting on the default account) from the other accounts that are not frozen.
 * Always mounted, so closing it hands focus back to the Delete button; what was picked is
 * forgotten on the way out.
 */
function DeleteAccountDialog({
  account,
  onCancel,
  onDone,
}: {
  account: Account | null;
  onCancel(): void;
  onDone(): void;
}) {
  const { deleteAccount } = useFinanceActions();
  const data = useApp((s) => s.data);
  const today = useToday();
  const money = useMoney();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const accountId = account?.id;
  // Any account in use but this one, and not a frozen one, which takes no new charge.
  const elsewhere = useCallback((a: Account) => a.id !== accountId && !a.frozen, [accountId]);
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
  if (account) {
    const removal = accountRemoval(data, account.id);
    archive = removal.archive;
    const left = archive ? accountBalance(account, data, today) : 0;
    const credit = account.kind === 'credit';
    moved = removal.subscriptions.length;
    title = `${archive ? 'Archive' : 'Delete'} ${account.name}?`;
    description = [
      archive
        ? credit
          ? `${account.name} has past expenses or payments, so it is archived: it leaves Debts, bills and "Paid with", and past expenses keep its name.`
          : `${account.name} has past entries, so it is archived: it leaves your cards, bills and "Paid with", and past entries keep its name.`
        : `${account.name} will be deleted.`,
      credit &&
        left > 0 &&
        `The ${money(left)} still owed on it stops counting toward what you owe.`,
      !credit && left !== 0 && `The ${money(left)} on it stops counting toward what you have.`,
      moved > 0 &&
        `${moved} ${plural(moved, 'subscription', 'subscriptions')} paid with it ${plural(moved, 'moves', 'move')} to the account you pick below.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  async function confirm() {
    if (!account) return;
    if (moved > 0 && moveTo === '') return setError(PICK_SUBSCRIPTIONS_TARGET);
    setBusy(true);
    const ok = await run(
      () => deleteAccount(account.id, { moveSubscriptionsTo: moved > 0 ? moveTo : null }),
      { success: `${account.name} ${archive ? 'archived' : 'deleted'}.` },
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
      open={account !== null}
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
          variant="row"
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

/**
 * Adds or edits an account of any kind, from the Cards tab's ＋ and Settings, and from the Debts
 * page, Net worth and a card's sheet: its name, its kind (kept once it has history), the last 4
 * digits of its card, its balance, a credit card's terms, and whether it counts in Available. Delete
 * asks first, and archives one with history.
 */
export function AccountDialog({
  target,
  onClose,
}: {
  target: AccountTarget | null;
  onClose(): void;
}) {
  // Beside the form's dialog, not in it: Escape on the ask must not close both.
  const [deleting, setDeleting] = useState<Account | null>(null);
  return (
    <>
      <Dialog
        open={target !== null}
        title={target ? (target.account ? 'Edit card' : 'Add a card') : ''}
        onClose={onClose}
      >
        {target && (
          <AccountForm
            key={target.account?.id ?? `new-${target.kind ?? ''}`}
            account={target.account}
            fixedKind={target.kind}
            onDone={onClose}
            onDelete={() => setDeleting(target.account)}
          />
        )}
      </Dialog>
      <DeleteAccountDialog
        account={deleting}
        onCancel={() => setDeleting(null)}
        onDone={() => {
          setDeleting(null);
          onClose();
        }}
      />
    </>
  );
}
