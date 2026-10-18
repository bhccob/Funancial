import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Section, SectionLink } from '@/components/ui/Section';
import type { Bill } from '@/domain/budget';
import type { Subscription } from '@/domain/entities';
import type { LocalDate } from '@/domain/dates';
import { CardSheet } from '@/features/goals/CardSheet';
import { BillRow } from '@/features/shared/BillRow';
import { SubscriptionDialog } from '@/features/subscriptions/SubscriptionDialog';
import { relativeDays } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useMoney } from '@/store/useFinance';

export interface BillsSectionProps {
  bills: Bill[];
  /** What the month's bills add up to. */
  total: number;
  today: LocalDate;
}

/**
 * The next four bills, each a button that opens what it shows: a subscription's edit dialog, or a
 * card's sheet. The title's link shows the month's total and leads to the bills page.
 */
export function BillsSection({ bills, total, today }: BillsSectionProps) {
  const money = useMoney();
  const subscriptions = useApp((s) => s.data.tables.subscription);
  const [editing, setEditing] = useState<Subscription>();
  const [cardId, setCardId] = useState<string | null>(null);

  return (
    <>
      <Section
        title="Coming up"
        action={
          <SectionLink to="/subscriptions">
            {`${money(total)} this month`}
            <span className="sr-only">, Bills & cards</span>
          </SectionLink>
        }
      >
        {bills.length > 0 ? (
          <ul className="divide-border divide-y">
            {bills.slice(0, 4).map((bill) => {
              const card = bill.kind === 'card';
              const when = relativeDays(today, bill.date);
              return (
                <BillRow
                  key={`${bill.refId}-${bill.date}`}
                  date={bill.date}
                  due={card}
                  title={card ? `${bill.name} card payment` : bill.name}
                  subline={
                    card
                      ? `${bill.inFull ? 'Pay the full balance' : 'Minimum payment'} · ${when}`
                      : `Subscription · ${when}`
                  }
                  amount={money(bill.amount)}
                  onOpen={() =>
                    card
                      ? setCardId(bill.refId)
                      : setEditing(subscriptions.find((s) => s.id === bill.refId))
                  }
                />
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Nothing due this month" />
        )}
      </Section>
      <CardSheet debtId={cardId} onClose={() => setCardId(null)} />
      <SubscriptionDialog sub={editing} onClose={() => setEditing(undefined)} />
    </>
  );
}
