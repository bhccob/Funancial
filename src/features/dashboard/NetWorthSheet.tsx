import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import type { AccountKind } from '@/domain/entities';
import type { FinanceView } from '@/domain/view';
import { AccountDialog, type AccountTarget } from '@/features/cards/AccountDialog';
import { LoanDialog, type LoanTarget } from '@/features/goals/LoanDialog';
import { ActualBalanceDialog } from '@/features/history/ActualBalanceDialog';
import { useMoney } from '@/store/useFinance';
import { Row, Total } from './BreakdownRows';

const HEADING = 'text-muted mt-4 mb-1 text-[13px] font-bold';

/** The order what you have is listed in: savings, then bank accounts and cash wallets. */
const HAVE: AccountKind[][] = [['savings'], ['debit', 'cash']];

/**
 * What "Net worth" is made of: what you have (each savings account, then each bank account and
 * cash wallet, any of which can be corrected here, and any investments), less what you owe on
 * each credit card and loan, each of which opens its editor. The rows are `FinanceView`'s own
 * parts, so they add up to the figure on Home exactly. The dialogs stack over the sheet, which
 * updates behind them.
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
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<AccountTarget | null>(null);
  const [editingLoan, setEditingLoan] = useState<LoanTarget | null>(null);
  // Each group keeps the carousel order the view's accounts are in.
  const held = HAVE.flatMap((kinds) => view.accounts.filter((r) => kinds.includes(r.account.kind)));
  const cards = view.accounts.filter((r) => r.account.kind === 'credit');

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
              {held.map(({ account, balance }) => (
                <Row
                  key={account.id}
                  label={account.name}
                  value={money(balance)}
                  action={{ label: 'Correct', onClick: () => setCorrecting(account.id) }}
                />
              ))}
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
                    action={{ label: 'Edit', onClick: () => setEditingCard({ account }) }}
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
        accountId={correcting}
        onClose={() => setCorrecting(null)}
      />
      <AccountDialog target={editingCard} onClose={() => setEditingCard(null)} />
      <LoanDialog target={editingLoan} onClose={() => setEditingLoan(null)} />
    </>
  );
}
