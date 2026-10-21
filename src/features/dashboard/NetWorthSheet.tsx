import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import type { FinanceView } from '@/domain/view';
import { CardDialog, type CardTarget } from '@/features/goals/CardDialog';
import { LoanDialog, type LoanTarget } from '@/features/goals/LoanDialog';
import { ActualBalanceDialog, type Which } from '@/features/history/ActualBalanceDialog';
import { useMoney } from '@/store/useFinance';
import { Row, Total } from './BreakdownRows';

const HEADING = 'text-muted mt-4 mb-1 text-[13px] font-bold';

/**
 * What "Net worth" is made of: what you have (cash and savings, which can be corrected here, the
 * passive income received and any investments), less what you owe on each card and loan, each of
 * which opens its editor. The rows are `FinanceView`'s own parts, so they add up to the figure on
 * Home exactly. The dialogs stack over the sheet, which updates behind them.
 */
export function NetWorthSheet({
  open,
  view,
  onClose,
}: {
  open: boolean;
  view: FinanceView;
  onClose(): void;
}) {
  const money = useMoney();
  const [correcting, setCorrecting] = useState<Which | null>(null);
  const [editingCard, setEditingCard] = useState<CardTarget | null>(null);
  const [editingLoan, setEditingLoan] = useState<LoanTarget | null>(null);
  const cards = view.accounts.filter((r) => r.account.kind === 'credit');

  const correct = (which: Which) => ({ label: 'Correct', onClick: () => setCorrecting(which) });

  return (
    <>
      <Sheet open={open} title="Net worth" onClose={onClose}>
        {open && (
          <>
            {/* The sheet is named by its title; this is the drawn copy of it. */}
            <p
              aria-hidden="true"
              className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]"
            >
              Net worth
            </p>
            <h3 className={HEADING}>What you have</h3>
            <ul>
              <Row label="Cash" value={money(view.buckets.cash)} action={correct('cash')} />
              <Row
                label="Savings"
                value={money(view.buckets.savings)}
                action={correct('savings')}
              />
              <Row label="Passive income received" value={money(view.buckets.passive)} />
              {view.investments !== 0 && (
                <Row
                  label="Investments"
                  value={money(view.investments)}
                  action={{ label: 'See Invest', to: '/invest', onClick: onClose }}
                />
              )}
            </ul>
            <h3 className={HEADING}>What you owe</h3>
            {cards.length + view.loans.length === 0 ? (
              <p className="text-muted min-h-11 py-2.5 text-[15px] font-semibold">
                No cards or loans.
              </p>
            ) : (
              <ul>
                {cards.map(({ account, balance }) => (
                  <Row
                    key={account.id}
                    label={account.name}
                    // Owing is taken off and a card paid past its balance is a credit, which adds. Zero
                    // is 0 - balance, never -balance: that is -0, which prints as "-$0.00".
                    value={money(0 - balance)}
                    action={{ label: 'Edit', onClick: () => setEditingCard({ card: account }) }}
                  />
                ))}
                {view.loans.map(({ debt, balance }) => (
                  <Row
                    key={debt.id}
                    label={debt.name}
                    value={money(0 - balance)}
                    action={{ label: 'Edit', onClick: () => setEditingLoan({ loan: debt }) }}
                  />
                ))}
              </ul>
            )}
            <Total label="= Net worth" value={money(view.netWorth)} />
          </>
        )}
      </Sheet>
      <ActualBalanceDialog
        open={correcting !== null}
        initial={correcting ?? 'cash'}
        onClose={() => setCorrecting(null)}
      />
      <CardDialog target={editingCard} onClose={() => setEditingCard(null)} />
      <LoanDialog target={editingLoan} onClose={() => setEditingLoan(null)} />
    </>
  );
}
