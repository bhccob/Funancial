import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import type { FinanceView } from '@/domain/view';
import { useMoney } from '@/store/useFinance';
import { ActualBalanceDialog, type Which } from '@/features/history/ActualBalanceDialog';
import { Row, Total } from './BreakdownRows';

/**
 * What "Available to spend" is made of, top to bottom: the cash and savings you have, less the
 * bills and card payments still to come and what the limits keep back. The parts are
 * `FinanceView`'s own, the numbers the hero adds up, so the rows reach its figure exactly. Cash
 * and savings can be corrected here; the dialog stacks over the sheet, which updates behind it.
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
  const [correcting, setCorrecting] = useState<Which | null>(null);

  const sum = (kind: 'subscription' | 'card') =>
    view.bills.filter((b) => b.kind === kind).reduce((s, b) => s + b.amount, 0);
  const correct = (which: Which) => ({ label: 'Correct', onClick: () => setCorrecting(which) });

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
              <Row label="Cash" value={money(view.buckets.cash)} action={correct('cash')} />
              <Row
                label="Savings"
                value={money(view.buckets.savings)}
                action={correct('savings')}
              />
              <Row label="Bills still to come this month" value={money(0 - sum('subscription'))} />
              <Row label="Card payments due" value={money(0 - sum('card'))} />
              {view.reserved !== 0 && (
                <Row label="Reserved for limits" value={money(0 - view.reserved)} />
              )}
            </ul>
            <Total label="= Available to spend" value={money(view.available)} />
          </>
        )}
      </Sheet>
      <ActualBalanceDialog
        open={correcting !== null}
        initial={correcting ?? 'cash'}
        onClose={() => setCorrecting(null)}
      />
    </>
  );
}
