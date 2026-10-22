import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { archivedBy } from '@/domain/accounts';
import { accountBalance } from '@/domain/balances';
import { cardPayment, nextDueDate } from '@/domain/budget';
import type { Account } from '@/domain/entities';
import { AccountDialog, type AccountTarget } from '@/features/cards/AccountDialog';
import { formatDay } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useMoney, useToday } from '@/store/useFinance';
import { PayDialog, type PayTarget } from './PayDialog';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted text-[13px] font-bold">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * What a credit card means for you, in plain words, with Pay and Edit one tap away. Open while
 * `accountId` names a credit card in use; the pay and edit dialogs are the Debts page's, stacked
 * over it.
 */
export function CardSheet({ accountId, onClose }: { accountId: string | null; onClose(): void }) {
  const today = useToday();
  const data = useApp((s) => s.data);
  const [pay, setPay] = useState<PayTarget | null>(null);
  const [edit, setEdit] = useState<AccountTarget | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);

  // Deleting it from inside closes the sheet, archived or gone.
  const card = data.tables.account.find(
    (a) => a.id === accountId && a.kind === 'credit' && !archivedBy(a, today),
  );
  const balance = card ? accountBalance(card, data, today) : 0;

  // Paying the card off disables "Pay card", which is where the pay dialog hands focus back to, so
  // it would fall to the page: "Edit card" takes it.
  useEffect(() => {
    if (pay === null && balance <= 0) editButton.current?.focus();
  }, [pay, balance]);

  return (
    <>
      <Sheet
        open={card !== undefined}
        title={card ? `${card.name} credit card` : ''}
        onClose={onClose}
      >
        {card && (
          <>
            {/* The sheet is named by its title; these are the drawn copy of it. */}
            <p aria-hidden="true" className="text-muted text-[13px] font-bold">
              Credit card
            </p>
            <p
              aria-hidden="true"
              className="truncate text-[22px] leading-tight font-extrabold tracking-[-0.02em]"
            >
              {card.name}
            </p>
            <CardFacts card={card} balance={balance} />
            <div className="mt-4 flex flex-col gap-2">
              <Button
                disabled={balance <= 0}
                onClick={() => setPay({ kind: 'card', card, balance })}
              >
                Pay card
              </Button>
              <Button
                ref={editButton}
                variant="secondary"
                onClick={() => setEdit({ account: card })}
              >
                Edit card
              </Button>
            </div>
          </>
        )}
      </Sheet>
      <PayDialog target={pay} onClose={() => setPay(null)} />
      <AccountDialog target={edit} onClose={() => setEdit(null)} />
    </>
  );
}

/**
 * A credit card's facts (what it owes, when it is due, what you pay, how much of the limit is used)
 * and why your cash stays put. The card sheet on the Cards tab shows them too.
 */
export function CardFacts({ card, balance }: { card: Account; balance: number }) {
  const money = useMoney();
  const today = useToday();
  const data = useApp((s) => s.data);
  const { amount, inFull } = cardPayment(data, card, balance, today);
  const limit = card.credit?.limit ?? null;
  const due = formatDay(nextDueDate(today, card.credit?.dueDay ?? null));

  return (
    <>
      <dl className="my-4 grid grid-cols-2 gap-x-3 gap-y-3">
        <Fact label="You owe" value={money(balance)} />
        <Fact label="Payment due" value={due} />
        <Fact
          label="You pay"
          value={
            inFull ? 'The full balance' : amount === 0 ? 'Minimum paid' : `${money(amount)} minimum`
          }
        />
        {limit ? (
          <Fact
            label="Limit used"
            value={`${Math.round((balance * 100) / limit)}% of ${money(limit)}`}
          />
        ) : null}
      </dl>
      {balance > 0 && (
        <p className="bg-surface-2 text-muted rounded-xl px-3.5 py-3 text-[13px] leading-snug font-semibold">
          {amount === 0
            ? `Buying with this card adds to what you owe. Your cash only drops when you pay the card, and the minimum due ${due} is paid, so Funcial keeps nothing aside.`
            : `Buying with this card adds to what you owe. Your cash only drops when you pay the card, so Funcial keeps ${money(amount)} aside for ${due}.`}
        </p>
      )}
    </>
  );
}
