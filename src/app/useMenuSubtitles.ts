import { formatDay } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceView, useMoney } from '@/store/useFinance';
import { useGameView } from '@/store/useGame';

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** The line under each Menu row, keyed by path: what is inside that section right now. */
export function useMenuSubtitles(): Record<string, string> {
  const money = useMoney();
  const view = useFinanceView();
  const subscriptions = useApp((s) => s.data.tables.subscription);
  const goals = useApp((s) => s.data.tables.goal);
  // Reversals can take the ledger below zero; the Shop shows nothing to spend then, never a debt.
  const coins = Math.max(0, useGameView().totals.coins);

  const active = subscriptions.filter((s) => s.status === 'active').length;
  const saved = goals.reduce((sum, g) => sum + g.current, 0);
  const target = goals.reduce((sum, g) => sum + g.target, 0);
  // Rounded down, as the Goals screen does, so a goal never reads as done before it is.
  const percent = target > 0 ? Math.floor((saved * 100) / target) : 0;

  return {
    '/subscriptions':
      active > 0 ? `${active} active · ${money(view.subscriptionsMonthly)}/mo` : 'None yet',
    '/goals': goals.length > 0 ? `${plural(goals.length, 'goal')} · ${percent}% saved` : 'None yet',
    '/history': 'Every entry, searchable',
    '/freeze': view.activeFreeze
      ? `Active until ${formatDay(view.activeFreeze.end)}`
      : 'None right now',
    '/invest': 'Stocks and ETFs',
    '/buy': 'Ask before you spend',
    '/dividends': 'Passive income',
    '/news': 'For what you hold',
    '/shop': `${plural(coins, 'coin')} to spend`,
    '/inbox': 'Your notices',
    '/help': 'How everything works',
    '/settings': 'Lock, backups, reminders',
  };
}
