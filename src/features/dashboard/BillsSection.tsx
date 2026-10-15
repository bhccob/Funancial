import { EmptyState } from '@/components/ui/EmptyState';
import type { Bill } from '@/domain/budget';
import type { LocalDate } from '@/domain/dates';
import { dayOfMonth } from '@/domain/periods';
import { formatMonthShort, relativeDays } from '@/lib/format';
import { useMoney } from '@/store/useFinance';
import { HomeSection, SectionLink } from './HomeSection';

export interface BillsSectionProps {
  bills: Bill[];
  /** What the month's bills add up to. */
  total: number;
  today: LocalDate;
}

/** The next four bills, each with a date block. The title's link shows the month's total. */
export function BillsSection({ bills, total, today }: BillsSectionProps) {
  const money = useMoney();

  return (
    <HomeSection
      title="Coming up"
      action={<SectionLink to="/subscriptions">{money(total)}</SectionLink>}
    >
      {bills.length > 0 ? (
        <ul className="divide-border divide-y">
          {bills.slice(0, 4).map((bill) => (
            <li key={`${bill.refId}-${bill.date}`} className="flex items-center gap-3.5 py-[13px]">
              <div className="w-10 flex-none text-center">
                <span className="text-muted block text-[11px] font-extrabold tracking-[0.06em]">
                  {formatMonthShort(bill.date)}
                </span>
                <b className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
                  {dayOfMonth(bill.date)}
                </b>
              </div>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[15px] font-extrabold">{bill.name}</b>
                <span className="text-muted text-[13px] font-semibold">
                  {`${bill.kind === 'card' ? 'Card' : 'Subscription'} · ${relativeDays(today, bill.date)}`}
                </span>
              </div>
              <span className="flex-none text-[15px] font-extrabold tabular-nums">
                {money(bill.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nothing due this month" />
      )}
    </HomeSection>
  );
}
