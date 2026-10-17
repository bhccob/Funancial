import { incomeByMonth } from '@/domain/income';
import { formatDay } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceView, useMoney, useToday } from '@/store/useFinance';
import { useGameView } from '@/store/useGame';
import { useInboxItems } from '@/store/useInbox';

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** The line under each Menu row, keyed by path: what is inside that section right now. */
export function useMenuSubtitles(): Record<string, string> {
  const money = useMoney();
  const view = useFinanceView();
  const subscriptions = useApp((s) => s.data.tables.subscription);
  const debts = useApp((s) => s.data.tables.debt);
  const goals = useApp((s) => s.data.tables.goal);
  const data = useApp((s) => s.data);
  const today = useToday();
  // Reversals can take the ledger below zero; the Shop shows nothing to spend then, never a debt.
  const game = useGameView();
  const coins = Math.max(0, game.totals.coins);
  const level = game.level.level;
  const unread = useInboxItems().filter((i) => !i.read).length;

  const cards = debts.filter((d) => d.kind === 'credit_card').length;
  const active = subscriptions.filter((s) => s.status === 'active').length;
  const saved = goals.reduce((sum, g) => sum + g.current, 0);
  const target = goals.reduce((sum, g) => sum + g.target, 0);
  // Rounded down, as the Goals screen does, so a goal never reads as done before it is.
  const percent = target > 0 ? Math.floor((saved * 100) / target) : 0;
  // One of them is named; two or more are "cards and loans", as the page is.
  const debtCount =
    debts.length > 1
      ? `${debts.length} cards and loans`
      : plural(debts.length, cards ? 'card' : 'loan');

  // What is inside: the subscriptions with what they cost, then the credit cards.
  const billsLine = [
    active > 0 && `${active} active · ${money(view.subscriptionsMonthly)}/mo`,
    cards > 0 && plural(cards, 'card'),
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    '/subscriptions': billsLine || 'None yet',
    '/goals': goals.length > 0 ? `${plural(goals.length, 'goal')} · ${percent}% saved` : 'None yet',
    '/debts': debts.length > 0 ? `${debtCount} · ${money(view.debtTotal)}` : 'None yet',
    '/income': `${money(incomeByMonth(data, today, 1)[0]!.total)} this month`,
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
