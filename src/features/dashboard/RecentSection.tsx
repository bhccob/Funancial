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
import { categoryLabel } from '@/domain/budget';
import { addDays, type LocalDate } from '@/domain/dates';
import type { Account, Debt } from '@/domain/entities';
import { entryDate, type Entry } from '@/domain/history';
import { accountName } from '@/features/shared/AccountField';
import { CATEGORY_ICONS } from '@/features/shared/categories';
import { EmptyRows, PlainSection } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { formatDay, formatShares } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useMoney, useToday } from '@/store/useFinance';

/** A plain row's hairline above it, on the light page and the dark one. */
const ROWS = 'divide-y divide-black/7 dark:divide-white/8';

type Line = {
  icon: LucideIcon;
  title: string;
  detail: string;
  amount: number;
  sign: '+' | '−' | '';
};

/** "Today", "Yesterday", else "Oct 12". */
function dayName(day: LocalDate, today: LocalDate): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return formatDay(day);
}

/**
 * One History entry as a row of Home's Recent: what it was, its kind and day, and the money in (+),
 * out (−) or moved (no sign), named as History names it. Income that was only expected, or didn't
 * arrive, says so and adds nothing.
 */
function lineOf(
  entry: Entry,
  today: LocalDate,
  accounts: readonly Account[],
  debts: readonly Debt[],
): Line {
  const day = dayName(entryDate(entry), today);
  const nameOf = (id: string | null) => accountName(accounts, id);
  switch (entry.kind) {
    case 'expense': {
      const e = entry.item;
      const category = categoryLabel(e.category);
      return {
        icon: CATEGORY_ICONS[e.category],
        title: e.note || category,
        detail: `${category} · ${day}`,
        amount: e.amount,
        sign: '−',
      };
    }
    case 'income': {
      const i = entry.item;
      const status =
        i.status === 'confirmed'
          ? 'Income'
          : i.status === 'expected'
            ? 'Expected'
            : "Didn't arrive";
      return {
        icon: ArrowDownLeft,
        title: i.label,
        detail: `${status} · ${day}`,
        amount: i.status === 'skipped' ? 0 : i.amount,
        sign: i.status === 'confirmed' ? '+' : '',
      };
    }
    case 'dividend': {
      const d = entry.item;
      const counted = d.status === 'confirmed';
      return {
        icon: Coins,
        title: `Dividend · ${d.symbol}`,
        detail: day,
        amount: counted ? d.amount : 0,
        sign: counted ? '+' : '',
      };
    }
    case 'sale': {
      const s = entry.item;
      return {
        icon: TrendingUp,
        title: `Sold ${formatShares(s.shares)} ${s.symbol}`,
        detail: day,
        amount: s.proceeds,
        sign: '+',
      };
    }
    case 'transaction': {
      const t = entry.item;
      if (t.type === 'transfer') {
        return {
          icon: ArrowLeftRight,
          title: `${nameOf(t.fromAccountId)} → ${nameOf(t.toAccountId)}`,
          detail: `Transfer · ${day}`,
          amount: t.amount,
          sign: '',
        };
      }
      if (t.type === 'card_payment') {
        return {
          icon: CreditCard,
          title: `${nameOf(t.fromAccountId)} → ${nameOf(t.toAccountId)}`,
          detail: `Card payment · ${day}`,
          amount: t.amount,
          sign: '−',
        };
      }
      if (t.type === 'adjustment') {
        // On a card a correction up is owing more, which reads as money out, as in History.
        const onCard = accounts.find((a) => a.id === t.toAccountId)?.kind === 'credit';
        const out = onCard ? t.amount > 0 : t.amount < 0;
        return {
          icon: SlidersHorizontal,
          title: 'Balance correction',
          detail: `${nameOf(t.toAccountId)} · ${day}`,
          amount: Math.abs(t.amount),
          sign: out ? '−' : '+',
        };
      }
      if (t.type === 'investment') {
        return {
          icon: TrendingUp,
          title: t.note || 'Investment',
          detail: day,
          amount: t.amount,
          sign: '−',
        };
      }
      return {
        icon: HandCoins,
        title: `Paid ${debts.find((d) => d.id === t.debtId)?.name ?? 'a loan'}`,
        detail: day,
        amount: t.amount,
        sign: '−',
      };
    }
  }
}

/** The newest entries History lists, as plain rows; View all opens History. */
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
            const {
              icon: Icon,
              title,
              detail,
              amount,
              sign,
            } = lineOf(entry, today, accounts, debts);
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
                  <b className="block truncate text-[14.5px] font-extrabold">{title}</b>
                  <span className="text-muted block truncate text-[12px] font-semibold">
                    {detail}
                  </span>
                </span>
                <span
                  className={cn(
                    'text-[14.5px] font-extrabold whitespace-nowrap tabular-nums',
                    sign === '+' && 'text-success',
                    sign === '−' && 'text-danger',
                  )}
                >
                  {`${sign}${money(amount)}`}
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
