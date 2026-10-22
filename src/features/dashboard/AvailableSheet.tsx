import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { availableParts } from '@/domain/budget';
import type { FinanceView } from '@/domain/view';
import { useMoney } from '@/store/useFinance';
import { ActualBalanceDialog } from '@/features/history/ActualBalanceDialog';
import { Row, Total } from './BreakdownRows';

/**
 * What "Available to spend" is made of, top to bottom: each account that counts in Available (a
 * bank account or cash wallet by default, never savings or a credit card), less the bills still
 * to come on those accounts, the card payments due and what the limits keep back. The parts are
 * `availableParts` of `FinanceView`'s own numbers, the ones the hero's figure is the total of, so
 * the rows reach it exactly. Each account can be corrected here; the dialog stacks over the sheet,
 * which updates behind it.
 */
export function AvailableSheet({
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
  const parts = availableParts(view.accounts, view.bills, view.reserved);

  return (
    <>
      <Sheet open={open} title="Available to spend" onClose={onClose}>
        {open && (
          <>
            {/* The sheet is named by its title; this is the drawn copy of it. */}
            <p
              aria-hidden="true"
              className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]"
            >
              Available to spend
            </p>
            <ul className="mt-3">
              {parts.accounts.map(({ account, balance }) => (
                <Row
                  key={account.id}
                  label={account.name}
                  value={money(balance)}
                  action={{ label: 'Correct', onClick: () => setCorrecting(account.id) }}
                />
              ))}
              {/* Zero is 0 - x, never -x: that is -0, which prints as "-$0.00". */}
              <Row label="Bills still to come this month" value={money(0 - parts.bills)} />
              <Row label="Card payments due" value={money(0 - parts.cards)} />
              {parts.reserved !== 0 && (
                <Row label="Reserved for limits" value={money(0 - parts.reserved)} />
              )}
            </ul>
            <Total label="= Available to spend" value={money(view.available)} />
          </>
        )}
      </Sheet>
      <ActualBalanceDialog
        open={correcting !== null}
        accountId={correcting}
        onClose={() => setCorrecting(null)}
      />
    </>
  );
}
