import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Section } from '@/components/ui/Section';
import { AccountDialog, type AccountTarget } from '@/features/cards/AccountDialog';
import { ordinal } from '@/lib/format';
import { useFinanceView, useMoney } from '@/store/useFinance';
import { LoanDialog, type LoanTarget } from './LoanDialog';
import { PayDialog, type PayTarget } from './PayDialog';

/** A card or a loan: what it is called, what it owes, and Pay and Edit. */
function DebtRow({
  name,
  details,
  balance,
  progress,
  payLabel,
  onPay,
  onEdit,
}: {
  name: string;
  /** The line under the name. */
  details: string;
  balance: number;
  /** A loan's payoff bar. */
  progress?: ReactNode;
  payLabel: string;
  onPay(): void;
  onEdit(): void;
}) {
  const money = useMoney();
  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold">{name}</p>
          <p className="text-muted text-sm font-semibold">{details}</p>
        </div>
        <p className="shrink-0 text-lg font-extrabold tabular-nums">{money(balance)}</p>
      </div>
      {progress}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" disabled={balance <= 0} onClick={onPay}>
          {payLabel}
        </Button>
        <Button size="sm" variant="ghost" aria-label={`Edit ${name}`} onClick={onEdit}>
          Edit
        </Button>
      </div>
    </li>
  );
}

export function DebtsScreen() {
  const { accounts, loans } = useFinanceView();
  const money = useMoney();
  const [cardEdit, setCardEdit] = useState<AccountTarget | null>(null);
  const [loanEdit, setLoanEdit] = useState<LoanTarget | null>(null);
  const [pay, setPay] = useState<PayTarget | null>(null);

  // The cards, which are credit accounts, then the loans: each by name.
  const cards = accounts
    .filter((r) => r.account.kind === 'credit')
    .sort((a, b) => a.account.name.localeCompare(b.account.name));
  const sortedLoans = [...loans].sort((a, b) => a.debt.name.localeCompare(b.debt.name));

  return (
    <div>
      <PageHeader
        title="Debts"
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setCardEdit({ account: null, kind: 'credit' })}
            >
              Add card
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setLoanEdit({ loan: null })}>
              Add loan
            </Button>
          </div>
        }
      />
      <Section>
        {cards.length + sortedLoans.length > 0 ? (
          <ul className="divide-border -my-4 divide-y">
            {cards.map(({ account: card, balance }) => {
              const details: string[] = [];
              const limit = card.credit?.limit ?? null;
              const dueDay = card.credit?.dueDay ?? null;
              if (limit) details.push(`${Math.round((balance * 100) / limit)}% of limit`);
              if (dueDay) details.push(`Due on the ${ordinal(dueDay)}`);
              return (
                <DebtRow
                  key={card.id}
                  name={card.name}
                  details={details.length > 0 ? details.join(' · ') : 'Credit card'}
                  balance={balance}
                  payLabel="Pay card"
                  onPay={() => setPay({ kind: 'card', card, balance })}
                  onEdit={() => setCardEdit({ account: card })}
                />
              );
            })}
            {sortedLoans.map(({ debt: loan, balance }) => {
              const paidPct =
                loan.openingBalance > 0
                  ? Math.max(
                      0,
                      Math.floor(((loan.openingBalance - balance) * 100) / loan.openingBalance),
                    )
                  : 100;
              return (
                <DebtRow
                  key={loan.id}
                  name={loan.name}
                  details={
                    loan.minimumPayment > 0
                      ? `${money(loan.minimumPayment)} minimum a month`
                      : 'Loan'
                  }
                  balance={balance}
                  progress={
                    <ProgressBar
                      className="mt-3"
                      label={`${loan.name} paid off`}
                      value={paidPct}
                      level="ok"
                      valueText={`${paidPct}% paid off`}
                    />
                  }
                  payLabel="Make a payment"
                  onPay={() => setPay({ kind: 'loan', loan, balance })}
                  onEdit={() => setLoanEdit({ loan })}
                />
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No cards or loans">
            Add a credit card to track what you owe on it and when it's due.
          </EmptyState>
        )}
      </Section>

      <AccountDialog target={cardEdit} onClose={() => setCardEdit(null)} />
      <LoanDialog target={loanEdit} onClose={() => setLoanEdit(null)} />
      <PayDialog target={pay} onClose={() => setPay(null)} />
    </div>
  );
}
