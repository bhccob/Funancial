import { Car, CreditCard, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Section } from '@/components/ui/Section';
import { AccountDialog, type AccountTarget } from '@/features/cards/AccountDialog';
import { IconRow, ROW_SUB, ROW_TITLE } from '@/features/shared/IconRow';
import { ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { ordinal } from '@/lib/format';
import { useFinanceView, useMoney } from '@/store/useFinance';
import { EditButton } from './EditButton';
import { LoanDialog, type LoanTarget } from './LoanDialog';
import { PayDialog, type PayTarget } from './PayDialog';

/** A card or a loan: what it is called, what it owes, and Pay (the pill) and Edit (the pencil). */
function DebtRow({
  icon,
  name,
  details,
  balance,
  progress,
  payLabel,
  onPay,
  onEdit,
}: {
  icon: LucideIcon;
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
    <li>
      <IconRow
        icon={icon}
        top
        end={<p className="shrink-0 text-lg font-extrabold tabular-nums">{money(balance)}</p>}
      >
        <p className={cn(ROW_TITLE, 'truncate')}>{name}</p>
        <p className={ROW_SUB}>{details}</p>
        {progress}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={balance <= 0} onClick={onPay}>
            {payLabel}
          </Button>
          <EditButton name={name} onClick={onEdit} />
        </div>
      </IconRow>
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
    <div className="max-w-3xl">
      {/* The loans are listed on Cards: where Back goes when the app has no history to go back through. */}
      <PageHeader
        title="Debts"
        back
        backTo="/cards"
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
          <ul className={cn('px-1', ROWS)}>
            {cards.map(({ account: card, balance }) => {
              const details: string[] = [];
              const limit = card.credit?.limit ?? null;
              const dueDay = card.credit?.dueDay ?? null;
              if (limit) details.push(`${Math.round((balance * 100) / limit)}% of limit`);
              if (dueDay) details.push(`Due on the ${ordinal(dueDay)}`);
              return (
                <DebtRow
                  key={card.id}
                  icon={CreditCard}
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
                  icon={Car}
                  name={loan.name}
                  details={
                    loan.minimumPayment > 0
                      ? `${money(loan.minimumPayment)} minimum a month`
                      : 'Loan'
                  }
                  balance={balance}
                  progress={
                    <ProgressBar
                      className="mt-2.5"
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
