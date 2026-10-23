import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { activeAccounts } from '@/domain/accounts';
import { cardPayment } from '@/domain/budget';
import type { Account, Debt, Goal } from '@/domain/entities';
import { AccountField, NOT_CREDIT, useStartAccountId } from '@/features/shared/AccountField';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { SAME_ACCOUNT } from '@/store/financeActions';
import { useCurrency, useFinanceActions, useMoney, useToday } from '@/store/useFinance';

/**
 * Money moving toward something: a goal (from one account to another), or a credit card or a loan
 * (paid off from an account).
 */
export type PayTarget =
  | { kind: 'goal'; goal: Goal }
  | { kind: 'card'; card: Account; balance: number }
  | { kind: 'loan'; loan: Debt; balance: number };

const ENTER = 'Enter an amount like 12.50';
const PICK = 'Pick an account.';

/**
 * The account a goal's money goes to when nothing else is picked: the first savings account in use
 * that is not the one it comes from, else the first account that can hold it other than that one.
 */
function useStartSavingsId(fromId: string): string {
  const accounts = useApp((s) => s.data.tables.account);
  const today = useToday();
  const holding = activeAccounts(accounts, today).filter(NOT_CREDIT);
  const others = holding.filter((a) => a.id !== fromId);
  return (others.find((a) => a.kind === 'savings') ?? others[0])?.id ?? '';
}

function GoalForm({ goal, onDone }: { goal: Goal; onDone(): void }) {
  const { contributeToGoal } = useFinanceActions();
  const currency = useCurrency();
  const today = useToday();
  const run = useAction();
  const startFrom = useStartAccountId(NOT_CREDIT);
  const startTo = useStartSavingsId(startFrom);
  const [amount, setAmount] = useState<number | null>(null);
  const [from, setFrom] = useState(startFrom);
  const [to, setTo] = useState(startTo);
  const [errors, setErrors] = useState<{ amount?: string; from?: string; to?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = {
      amount: amount === null || amount <= 0 ? ENTER : undefined,
      from: from ? undefined : PICK,
      to: !to ? PICK : to === from ? SAME_ACCOUNT : undefined,
    };
    setErrors(found);
    if (found.amount || found.from || found.to || amount === null) return;
    setBusy(true);
    const saved = await run(() => contributeToGoal(goal.id, amount, today, from, to), {
      success: `Added to ${goal.name}.`,
    });
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      {/* The dialog is about one amount: the big figure, then the two accounts as plain rows. */}
      <MoneyField
        size="hero"
        label="Amount"
        currency={currency}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setErrors((e) => ({ ...e, amount: undefined }));
        }}
        error={errors.amount}
        hint="Moves it between your accounts and counts it toward this goal."
        autoFocus
      />
      <div>
        <AccountField
          variant="row"
          label="From"
          value={from}
          onChange={(id) => {
            setFrom(id);
            setErrors((e) => ({ ...e, from: undefined, to: undefined }));
          }}
          filter={NOT_CREDIT}
          error={errors.from}
        />
        <AccountField
          variant="row"
          label="To"
          value={to}
          onChange={(id) => {
            setTo(id);
            setErrors((e) => ({ ...e, to: undefined }));
          }}
          filter={NOT_CREDIT}
          error={errors.to}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Add
        </Button>
      </div>
    </form>
  );
}

/** Pays something off from an account: how much, and from where. */
function PayForm({
  name,
  balance,
  suggested,
  pay,
  onDone,
}: {
  name: string;
  /** What is owed: the most that can be paid. */
  balance: number;
  /** What the amount starts at; nothing when it is 0. */
  suggested: number;
  pay(fromAccountId: string, amount: number): Promise<unknown>;
  onDone(): void;
}) {
  const currency = useCurrency();
  const money = useMoney();
  const run = useAction();
  const startFrom = useStartAccountId(NOT_CREDIT);
  const [amount, setAmount] = useState<number | null>(suggested > 0 ? suggested : null);
  const [from, setFrom] = useState(startFrom);
  const [errors, setErrors] = useState<{ amount?: string; from?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = {
      amount:
        amount === null || amount <= 0
          ? ENTER
          : amount > balance
            ? `That's more than the ${money(balance)} you owe.`
            : undefined,
      from: from ? undefined : PICK,
    };
    setErrors(found);
    if (found.amount || found.from || amount === null) return;
    setBusy(true);
    const saved = await run(() => pay(from, amount), {
      success: `Paid ${money(amount)} toward ${name}.`,
    });
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      {/* The dialog is about one amount: the big figure, then the account that pays as a plain row. */}
      <MoneyField
        size="hero"
        label="Amount"
        currency={currency}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setErrors((e) => ({ ...e, amount: undefined }));
        }}
        error={errors.amount}
        hint={`You owe ${money(balance)}.`}
      />
      <AccountField
        variant="row"
        label="From"
        value={from}
        onChange={(id) => {
          setFrom(id);
          setErrors((e) => ({ ...e, from: undefined }));
        }}
        filter={NOT_CREDIT}
        error={errors.from}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Pay
        </Button>
      </div>
    </form>
  );
}

function CardPayForm({
  card,
  balance,
  onDone,
}: {
  card: Account;
  balance: number;
  onDone(): void;
}) {
  const { payCard } = useFinanceActions();
  const today = useToday();
  const data = useApp((s) => s.data);
  return (
    <PayForm
      name={card.name}
      balance={balance}
      suggested={cardPayment(data, card, balance, today).amount}
      pay={(from, amount) => payCard(card.id, from, amount, today)}
      onDone={onDone}
    />
  );
}

function LoanPayForm({ loan, balance, onDone }: { loan: Debt; balance: number; onDone(): void }) {
  const { payDebt } = useFinanceActions();
  const today = useToday();
  const suggested = loan.minimumPayment > 0 ? Math.min(loan.minimumPayment, balance) : balance;
  return (
    <PayForm
      name={loan.name}
      balance={balance}
      suggested={suggested}
      pay={(from, amount) => payDebt(loan.id, from, amount, today)}
      onDone={onDone}
    />
  );
}

export function PayDialog({ target, onClose }: { target: PayTarget | null; onClose(): void }) {
  const title = !target
    ? ''
    : target.kind === 'goal'
      ? 'Add to goal'
      : `Pay ${target.kind === 'card' ? target.card.name : target.loan.name}`;
  return (
    <Dialog open={target !== null} title={title} onClose={onClose}>
      {target?.kind === 'goal' && (
        <GoalForm key={target.goal.id} goal={target.goal} onDone={onClose} />
      )}
      {target?.kind === 'card' && (
        <CardPayForm
          key={target.card.id}
          card={target.card}
          balance={target.balance}
          onDone={onClose}
        />
      )}
      {target?.kind === 'loan' && (
        <LoanPayForm
          key={target.loan.id}
          loan={target.loan}
          balance={target.balance}
          onDone={onClose}
        />
      )}
    </Dialog>
  );
}
