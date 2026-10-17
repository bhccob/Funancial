import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { debtBalance } from '@/domain/balances';
import { cardPayment, nextDueDate } from '@/domain/budget';
import type { Debt } from '@/domain/entities';
import { formatDay } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useMoney, useToday } from '@/store/useFinance';
import { DebtDialog, type DebtTarget } from './DebtDialog';
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
 * `debtId` names a card; the pay and edit dialogs are the Goals & debts ones, stacked over it.
 */
export function CardSheet({ debtId, onClose }: { debtId: string | null; onClose(): void }) {
  const today = useToday();
  const data = useApp((s) => s.data);
  const [pay, setPay] = useState<PayTarget | null>(null);
  const [edit, setEdit] = useState<DebtTarget | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);

  const debt = data.tables.debt.find((d) => d.id === debtId);
  const balance = debt ? debtBalance(debt, data, today) : 0;

  // Paying the card off disables "Pay card", which is where the pay dialog hands focus back to, so
  // it would fall to the page: "Edit card" takes it.
  useEffect(() => {
    if (pay === null && balance <= 0) editButton.current?.focus();
  }, [pay, balance]);

  return (
    <>
      <Sheet
        open={debt !== undefined}
        title={debt ? `${debt.name} credit card` : ''}
        onClose={onClose}
      >
        {debt && (
          <>
            {/* The sheet is named by its title; these are the drawn copy of it. */}
            <p aria-hidden="true" className="text-muted text-[13px] font-bold">
              Credit card
            </p>
            <p
              aria-hidden="true"
              className="truncate text-[22px] leading-tight font-extrabold tracking-[-0.02em]"
            >
              {debt.name}
            </p>
            <CardFacts debt={debt} balance={balance} />
            <div className="mt-4 flex flex-col gap-2">
              <Button
                disabled={balance <= 0}
                onClick={() => setPay({ kind: 'debt', debt, balance })}
              >
                Pay card
              </Button>
              <Button
                ref={editButton}
                variant="secondary"
                onClick={() => setEdit({ kind: debt.kind, debt })}
              >
                Edit card
              </Button>
            </div>
          </>
        )}
      </Sheet>
      <PayDialog target={pay} onClose={() => setPay(null)} />
      <DebtDialog target={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function CardFacts({ debt, balance }: { debt: Debt; balance: number }) {
  const money = useMoney();
  const today = useToday();
  const { amount, inFull } = cardPayment(debt, balance);
  const due = formatDay(nextDueDate(today, debt.dueDay));

  return (
    <>
      <dl className="my-4 grid grid-cols-2 gap-x-3 gap-y-3">
        <Fact label="You owe" value={money(balance)} />
        <Fact label="Payment due" value={due} />
        <Fact label="You pay" value={inFull ? 'The full balance' : `${money(amount)} minimum`} />
        {debt.creditLimit ? (
          <Fact
            label="Limit used"
            value={`${Math.round((balance * 100) / debt.creditLimit)}% of ${money(debt.creditLimit)}`}
          />
        ) : null}
      </dl>
      {balance > 0 && (
        <p className="bg-surface-2 text-muted rounded-xl px-3.5 py-3 text-[13px] leading-snug font-semibold">
          {`Buying with this card adds to what you owe. Your cash only drops when you pay the card, so Funancial keeps ${money(amount)} aside for ${due}.`}
        </p>
      )}
    </>
  );
}
