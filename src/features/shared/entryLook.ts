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
import type { Entry } from '@/domain/history';
import { formatDay } from '@/lib/format';
import { CATEGORY_ICONS } from './categories';

/** "Today", "Yesterday", else "Oct 12". */
export function dayName(day: LocalDate, today: LocalDate): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return formatDay(day);
}

/**
 * The icon a row that runs days together starts with (Home's Recent, the Cards tab's "On this
 * card"): the category of an expense, else the kind of entry.
 */
export function entryIcon(entry: Entry): LucideIcon {
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
