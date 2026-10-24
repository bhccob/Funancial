import { activeAccounts } from '@/domain/accounts';
import { accountBalance, heroFigure } from '@/domain/balances';
import { entryDate, type Entry } from '@/domain/history';
import { entryLine, type EntryLine } from '@/features/shared/entryLine';
import { entryIcon, dayName } from '@/features/shared/entryLook';
import { EntryRow } from '@/features/shared/EntryRow';
import { EmptyRows, PlainSection, ROWS } from '@/features/shared/PlainSection';
import { useEntryActions } from '@/features/shared/useEntryActions';
import { cn } from '@/lib/cn';
import { useApp } from '@/store/AppStoreProvider';
import { useMoney, useToday } from '@/store/useFinance';

/**
 * The newest entries History lists, as plain rows written as History writes them (`entryLine`),
 * with the day after the line under the title; View all opens History. An expense opens the edit
 * form History opens, and every other row offers History's delete, asked about the same way
 * (`useEntryActions`). The newest row also says what is left on the card it moved money on, when it
 * did move money: the figure Home leads with for that account, in whole units ("$2,605 left", or
 * "owed"), so the row's words keep their room.
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
    return `${money(amount, { whole: true })} ${label === 'Owed' ? 'owed' : 'left'}`;
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
                  icon={entryIcon(entry)}
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
