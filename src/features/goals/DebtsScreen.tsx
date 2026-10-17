import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Section } from '@/components/ui/Section';
import type { Debt } from '@/domain/entities';
import { ordinal } from '@/lib/format';
import { useFinanceView, useMoney } from '@/store/useFinance';
import { DebtDialog, type DebtTarget } from './DebtDialog';
import { PayDialog, type PayTarget } from './PayDialog';

function DebtRow({
  debt,
  balance,
  onPay,
  onEdit,
}: {
  debt: Debt;
  balance: number;
  onPay(): void;
  onEdit(): void;
}) {
  const money = useMoney();
  const card = debt.kind === 'credit_card';
  const details: string[] = [];
  if (card) {
    if (debt.creditLimit)
      details.push(`${Math.round((balance * 100) / debt.creditLimit)}% of limit`);
    if (debt.dueDay) details.push(`Due on the ${ordinal(debt.dueDay)}`);
  } else if (debt.minimumPayment > 0) {
    details.push(`${money(debt.minimumPayment)} minimum a month`);
  }
  const paidPct =
    debt.openingBalance > 0
      ? Math.max(0, Math.floor(((debt.openingBalance - balance) * 100) / debt.openingBalance))
      : 100;

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold">{debt.name}</p>
          <p className="text-muted text-sm font-semibold">
            {details.length > 0 ? details.join(' · ') : card ? 'Credit card' : 'Loan'}
          </p>
        </div>
        <p className="shrink-0 text-lg font-extrabold tabular-nums">{money(balance)}</p>
      </div>
      {!card && (
        <ProgressBar
          className="mt-3"
          label={`${debt.name} paid off`}
          value={paidPct}
          level="ok"
          valueText={`${paidPct}% paid off`}
        />
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" disabled={balance <= 0} onClick={onPay}>
          {card ? 'Pay card' : 'Make a payment'}
        </Button>
        <Button size="sm" variant="ghost" aria-label={`Edit ${debt.name}`} onClick={onEdit}>
          Edit
        </Button>
      </div>
    </li>
  );
}

export function DebtsScreen() {
  const { debts } = useFinanceView();
  const [debtEdit, setDebtEdit] = useState<DebtTarget | null>(null);
  const [pay, setPay] = useState<PayTarget | null>(null);

  const sortedDebts = [...debts].sort(
    (a, b) => a.debt.kind.localeCompare(b.debt.kind) || a.debt.name.localeCompare(b.debt.name),
  );

  return (
    <div>
      <PageHeader
        title="Debts"
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDebtEdit({ kind: 'credit_card', debt: null })}
            >
              Add card
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDebtEdit({ kind: 'loan', debt: null })}
            >
              Add loan
            </Button>
          </div>
        }
      />
      <Section>
        {sortedDebts.length > 0 ? (
          <ul className="divide-border -my-4 divide-y">
            {sortedDebts.map(({ debt, balance }) => (
              <DebtRow
                key={debt.id}
                debt={debt}
                balance={balance}
                onPay={() => setPay({ kind: 'debt', debt, balance })}
                onEdit={() => setDebtEdit({ kind: debt.kind, debt })}
              />
            ))}
          </ul>
        ) : (
          <EmptyState title="No cards or loans">
            Add a credit card to track what you owe on it and when it's due.
          </EmptyState>
        )}
      </Section>

      <DebtDialog target={debtEdit} onClose={() => setDebtEdit(null)} />
      <PayDialog target={pay} onClose={() => setPay(null)} />
    </div>
  );
}
