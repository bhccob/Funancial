import {
  ArrowDownLeft,
  ArrowLeftRight,
  Coins,
  CreditCard,
  HandCoins,
  SlidersHorizontal,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { addDays, type LocalDate } from '@/domain/dates';
import { entryDate, type Entry } from '@/domain/history';
import { CATEGORY_ICONS } from '@/features/shared/categories';
import { EntryChip, EntryDetail } from '@/features/shared/EntryParts';
import { entryLine, type EntryTone } from '@/features/shared/entryLine';
import { EmptyRows, PlainSection, ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { formatDay } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useMoney, useToday } from '@/store/useFinance';

/** The wireframe's amounts: money in in the success color, money out in the danger color. */
const TONE: Record<EntryTone, string> = {
  in: 'text-success',
  out: 'text-danger',
  plain: '',
};

/** "Today", "Yesterday", else "Oct 12". */
function dayName(day: LocalDate, today: LocalDate): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return formatDay(day);
}

/** The icon a row of Recent starts with: the category of an expense, else the kind of entry. */
function iconOf(entry: Entry): LucideIcon {
  switch (entry.kind) {
    case 'expense':
      return CATEGORY_ICONS[entry.item.category];
    case 'income':
      return ArrowDownLeft;
    case 'dividend':
      return Coins;
    case 'sale':
      return TrendingUp;
    case 'transaction':
      return {
        transfer: ArrowLeftRight,
        card_payment: CreditCard,
        adjustment: SlidersHorizontal,
        investment: TrendingUp,
        debt_payment: HandCoins,
      }[entry.item.type];
  }
}

/**
 * The newest entries History lists, as plain rows written as History writes them (`entryLine`),
 * with the day after the line under the title; View all opens History.
 */
export function RecentSection({ entries }: { entries: Entry[] }) {
  const money = useMoney();
  const today = useToday();
  const accounts = useApp((s) => s.data.tables.account);
  const debts = useApp((s) => s.data.tables.debt);

  return (
    <PlainSection title="Recent transactions" to="/history">
      {entries.length > 0 ? (
        <ul className={cn('px-1', ROWS)}>
          {entries.map((entry) => {
            const Icon = iconOf(entry);
            const line = entryLine(entry, { accounts, debts });
            return (
              <li
                key={entry.item.id}
                data-entry={entry.item.id}
                className="flex min-h-[62px] items-center gap-3 py-[9px]"
              >
                <span className="glass grid size-11 flex-none place-items-center rounded-full">
                  <Icon aria-hidden="true" className="size-[19px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <b className="truncate text-[14.5px] font-extrabold">{line.title}</b>
                    <EntryChip line={line} />
                  </span>
                  <span className="text-muted block truncate text-[12px] font-semibold">
                    <EntryDetail line={line} day={dayName(entryDate(entry), today)} />
                  </span>
                </span>
                <span
                  className={cn(
                    'text-[14.5px] font-extrabold whitespace-nowrap tabular-nums',
                    TONE[line.tone],
                  )}
                >
                  {`${line.sign}${money(line.amount)}`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyRows>Nothing here yet.</EmptyRows>
      )}
    </PlainSection>
  );
}
