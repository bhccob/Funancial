import { formatDay } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceView, useMoney } from '@/store/useFinance';
import { useGameView } from '@/store/useGame';
import { useInboxItems } from '@/store/useInbox';

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** The line under each Menu row, keyed by path: what is inside that section right now. */
export function useMenuSubtitles(): Record<string, string> {
  const money = useMoney();
  const view = useFinanceView();
  const subscriptions = useApp((s) => s.data.tables.subscription);
  const goals = useApp((s) => s.data.tables.goal);
  // Reversals can take the ledger below zero; the Shop shows nothing to spend then, never a debt.
  const game = useGameView();
  const coins = Math.max(0, game.totals.coins);
  const level = game.level.level;
  const unread = useInboxItems().filter((i) => !i.read).length;

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
    '/buy': 'Ask before you spend',
    '/quests': `Level ${level}`,
    '/about-you': 'What the buy check knows',
    '/shop': `${plural(coins, 'coin')} to spend`,
    // Nothing under the name when there is nothing new.
    '/inbox': unread > 0 ? `${unread} new` : '',
    '/help': 'How everything works',
    '/settings': 'Lock, backups, reminders',
  };
}
