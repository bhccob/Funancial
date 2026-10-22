import { useFinanceView, useMoney } from '@/store/useFinance';
import { useGameView } from '@/store/useGame';
import { useInboxItems } from '@/store/useInbox';

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** The line under each Menu row, keyed by its label: what is inside that section right now. */
export function useMenuSubtitles(): Record<string, string> {
  const money = useMoney();
  const view = useFinanceView();
  // Reversals can take the ledger below zero; the Shop shows nothing to spend then, never a debt.
  const game = useGameView();
  const coins = Math.max(0, game.totals.coins);
  const level = game.level.level;
  const unread = useInboxItems().filter((i) => !i.read).length;

  return {
    History: 'Every entry, searchable',
    'Net worth': money(view.netWorth),
    Quests: `Level ${level}`,
    Shop: `${plural(coins, 'coin')} to spend`,
    // Nothing under the name when there is nothing new.
    Inbox: unread > 0 ? `${unread} new` : '',
    Help: 'How everything works',
    Settings: 'Lock, account, reminders',
  };
}
