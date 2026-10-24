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
import { activeAccounts } from '@/domain/accounts';
import { accountBalance, heroFigure } from '@/domain/balances';
import { addDays, type LocalDate } from '@/domain/dates';
import { entryDate, type Entry } from '@/domain/history';
import { CATEGORY_ICONS } from '@/features/shared/categories';
import { entryLine, type EntryLine } from '@/features/shared/entryLine';
import { EntryRow } from '@/features/shared/EntryRow';
import { EmptyRows, PlainSection, ROWS } from '@/features/shared/PlainSection';
import { useEntryActions } from '@/features/shared/useEntryActions';
import { cn } from '@/lib/cn';
import { formatDay } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useMoney, useToday } from '@/store/useFinance';

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
 * with the day after the line under the title; View all opens History. An expense opens the edit
 * form History opens, and every other row offers History's delete, asked about the same way
 * (`useEntryActions`). The newest row also says what is left on the card it moved money on, when it
 * did move money: the same figure Home leads with for that account ("$2,605.25 left", or "owed").
 */
export function RecentSection({ entries }: { entries: Entry[] }) {
  const money = useMoney();
  const today = useToday();
  const data = useApp((s) => s.data);
  const { account: accounts, debt: debts } = data.tables;
  const { actionsOf, dialogs } = useEntryActions();

  /** What is left on (or owed on) the account the newest entry moved money on, as that row says it. */
  function leftOn(entry: Entry, line: EntryLine): string | undefined {
    // An income not counted yet (expected, or one that didn't arrive) moved no money.
    if (entry.kind === 'income' && entry.item.status !== 'confirmed') return undefined;
    // Only an account in use has a figure of its own on Home.
    const account = activeAccounts(accounts, today).find((a) => a.id === line.mark?.accountId);
    if (!account) return undefined;
    const { label, amount } = heroFigure({
      account,
      balance: accountBalance(account, data, today),
    });
    return `${money(amount)} ${label === 'Owed' ? 'owed' : 'left'}`;
  }

  return (
    <>
      <PlainSection title="Recent transactions" to="/history">
        {entries.length > 0 ? (
          <ul className={cn('px-1', ROWS)}>
            {entries.map((entry, i) => {
              // Archived accounts are in the table too, so old rows keep their names.
              const line = entryLine(entry, { accounts, debts });
              return (
                <EntryRow
                  key={entry.item.id}
                  entryId={entry.item.id}
                  line={line}
                  icon={iconOf(entry)}
                  day={dayName(entryDate(entry), today)}
                  left={i === 0 ? leftOn(entry, line) : undefined}
                  danger
                  {...actionsOf(entry, line.title)}
                />
              );
            })}
          </ul>
        ) : (
          <EmptyRows>Nothing here yet.</EmptyRows>
        )}
      </PlainSection>
      {dialogs}
    </>
  );
}
