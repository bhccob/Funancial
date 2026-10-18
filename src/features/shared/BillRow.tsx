import { ChevronRight } from 'lucide-react';
import type { LocalDate } from '@/domain/dates';
import { dayOfMonth } from '@/domain/periods';
import { formatMonthShort } from '@/lib/format';

export interface BillRowProps {
  date: LocalDate;
  /** A card payment's date block reads DUE, the day, then the month; any other bill's the month, then the day. */
  due?: boolean;
  title: string;
  subline: string;
  /** Already written by `useMoney`, so it follows the hide-amounts eye. */
  amount: string;
  /** Tapping the row opens what it shows. */
  onOpen(): void;
}

const SMALL = 'text-muted block text-[11px] font-extrabold tracking-[0.06em]';

/** One bill as a tappable list row: a date block, what it is, when, the amount and a chevron. */
export function BillRow({ date, due = false, title, subline, amount, onOpen }: BillRowProps) {
  const month = <span className={SMALL}>{formatMonthShort(date)}</span>;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-11 w-full items-center gap-3.5 py-[13px] text-left"
      >
        <span className="w-10 flex-none text-center">
          {due ? <span className={SMALL}>DUE</span> : month}
          <b className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
            {dayOfMonth(date)}
          </b>
          {due && month}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[15px] font-extrabold">{title}</b>
          <span className="text-muted text-[13px] font-semibold">{subline}</span>
        </span>
        <span className="flex-none text-[15px] font-extrabold tabular-nums">{amount}</span>
        <ChevronRight aria-hidden="true" className="text-muted -ml-1.5 size-[18px] flex-none" />
      </button>
    </li>
  );
}
