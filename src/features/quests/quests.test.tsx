import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { levelStart } from '@/domain/game/levels';
import { purchaseEntry } from '@/domain/game/shop';
import type { ChallengeKind } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { formatDate } from '@/lib/format';
import { toastStore } from '@/lib/toast';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import {
  localIso,
  makeChallenge,
  makeCheckIn,
  makeExpense,
  makeGoal,
  makeLedgerEntry,
  makeLimit,
  makeProfile,
  makeSettings,
  makeSubscription,
} from '@/test/fixtures';
import { QuestsScreen } from './QuestsScreen';

const actions = vi.hoisted(() => ({
  startChallenge: vi.fn<(kind: string) => Promise<object>>(async () => ({})),
  abandonChallenge: vi.fn<(id: string) => Promise<void>>(async () => {}),
  checkInNoSpend: vi.fn(async () => {}),
  checkInWeek: vi.fn(async () => {}),
}));
vi.mock('@/store/useGame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useGame')>()),
  useGameActions: () => actions,
}));

const TODAY = '2026-10-14'; // a Wednesday: with weeks starting Monday the week starts 2026-10-12
const AT = (day: string) => localIso(day);
const usd = (minor: number) => formatMoney(minor, 'USD');

beforeEach(() => {
  toastStore.setState({ toasts: [] });
  Object.values(actions).forEach((a) => a.mockClear());
});
afterEach(() => toastStore.setState({ toasts: [] }));

function renderQuests(
  patch: (data: DataSnapshot) => void = () => {},
  overrides: Parameters<typeof createStubStore>[0] = {},
) {
  const data = emptySnapshot();
  patch(data);
  return renderWithStore(
    <MemoryRouter>
      <QuestsScreen />
      <Toaster />
    </MemoryRouter>,
    createStubStore({ data, today: TODAY, ...overrides }),
  );
}

const region = (name: string) => screen.getByRole('region', { name });
const group = (name: string) => screen.getByRole('group', { name });

/** A limit that has been in force since the start of the month. */
const aLimit = () => makeLimit({ createdAt: AT('2026-10-01'), updatedAt: AT('2026-10-01') });

describe('Quests screen: header', () => {
  it('shows the level header with coins and a Shop link', () => {
    const { container } = renderQuests((d) => {
      d.tables.ledger = [
        makeLedgerEntry({ key: 'seed', xp: 250, coins: 400 }),
        purchaseEntry('avatar-rocket', 'p1', AT('2026-10-01')),
        purchaseEntry('frame-gold', 'p2', AT('2026-10-01')),
      ];
      d.tables.settings = [
        makeSettings({
          cosmetics: { theme: 'theme-violet', avatar: 'avatar-rocket', frame: 'frame-gold' },
        }),
      ];
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Quests' })).toBeInTheDocument();
    // 250 XP: 150 into the 264 of level 2. Coins: 400 earned, 280 spent.
    const chip = screen.getByText('LV 2');
    expect(chip).toHaveClass('bg-xp-text', 'text-xp-contrast', 'rounded-[8px]');
    expect(screen.getByText('Bronze Saver')).toBeInTheDocument();
    expect(screen.getByText('150 / 264 XP')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Level progress' });
    expect(bar).toHaveAttribute('aria-valuetext', '150 of 264 XP');
    expect(bar.firstElementChild).toHaveClass('bg-xp');
    expect(bar.firstElementChild).toHaveStyle({ width: `${(150 / 264) * 100}%` });
    expect(screen.getByText('120 coins')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop');
    expect(container.querySelector('svg.lucide-rocket')).toBeInTheDocument();
    expect(container.querySelector('[class*="ring-[#d4a017]"]')).toBeInTheDocument();
  });

  it('starts at level 1 with nothing earned, and says Max level at the top', () => {
    const { unmount } = renderQuests();
    expect(screen.getByText('LV 1')).toBeInTheDocument();
    expect(screen.getByText('0 / 100 XP')).toBeInTheDocument();
    expect(screen.getByText('0 coins')).toBeInTheDocument();
    unmount();

    renderQuests((d) => {
      d.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: levelStart(50) + 10, coins: 1 })];
    });
    expect(screen.getByText('LV 50')).toBeInTheDocument();
    expect(screen.getByText('Max level')).toBeInTheDocument();
    expect(screen.getByText('1 coin')).toBeInTheDocument();
  });
});

describe('Quests screen: streaks', () => {
  it('lists the three streaks, with the no-limit hint and freezes held', () => {
    renderQuests((d) => {
      d.tables.expense = ['2026-10-12', '2026-10-13', TODAY].map((day) =>
        makeExpense({ date: day, createdAt: AT(day) }),
      );
      d.tables.ledger = [purchaseEntry('freeze-logging', 'p1', AT('2026-10-01'))];
    });

    const rows = within(region('Streaks')).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    const [logging, noOverspend, checkin] = rows as [HTMLElement, HTMLElement, HTMLElement];

    expect(within(logging).getByText('Daily logging')).toBeInTheDocument();
    expect(within(logging).getByText('3 days')).toBeInTheDocument();
    expect(within(logging).getByText('Freezes: 1')).toBeInTheDocument();
    expect(within(logging).getByRole('link', { name: 'Get freezes' })).toHaveAttribute(
      'href',
      '/shop',
    );

    expect(within(noOverspend).getByText('No overspending')).toBeInTheDocument();
    expect(within(noOverspend).getByText('Set a limit to start this streak.')).toBeInTheDocument();
    expect(within(noOverspend).queryByText(/Freezes/)).not.toBeInTheDocument();
    expect(within(noOverspend).queryByRole('link')).not.toBeInTheDocument();

    expect(within(checkin).getByText('Weekly check-in')).toBeInTheDocument();
    expect(within(checkin).getByText('Start a new streak today.')).toBeInTheDocument();
    expect(within(checkin).getByText('Freezes: 0')).toBeInTheDocument();
    expect(within(checkin).getByRole('link', { name: 'Get freezes' })).toHaveAttribute(
      'href',
      '/shop',
    );
  });

  it('counts each streak in its own unit', () => {
    renderQuests((d) => {
      d.tables.budgetLimit = [aLimit()];
      d.tables.expense = [makeExpense({ date: TODAY, createdAt: AT(TODAY) })];
      d.tables.checkIn = [makeCheckIn({ kind: 'weekly', date: '2026-10-12' })];
    });

    const [logging, noOverspend, checkin] = within(region('Streaks')).getAllByRole('listitem') as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(within(logging).getByText('1 day')).toBeInTheDocument();
    expect(within(logging).queryByText('Start a new streak today.')).not.toBeInTheDocument();
    // The limit has held since Oct 1, and nothing went over it.
    expect(within(noOverspend).getByText('14 days')).toBeInTheDocument();
    expect(within(noOverspend).queryByText(/Set a limit/)).not.toBeInTheDocument();
    expect(within(checkin).getByText('1 week')).toBeInTheDocument();
  });

  it('says the no-overspending streak waits for the limit to reset while today is over', () => {
    renderQuests((d) => {
      d.tables.budgetLimit = [aLimit()];
      // Over the limit today: the streak is tracked, but cannot start again until the limit resets.
      d.tables.expense = [makeExpense({ date: TODAY, createdAt: AT(TODAY), amount: 500_00 })];
    });
    const [, noOverspend, checkin] = within(region('Streaks')).getAllByRole('listitem') as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(
      within(noOverspend).getByText(
        'Over a limit right now. The streak starts again when it resets.',
      ),
    ).toBeInTheDocument();
    expect(within(noOverspend).queryByText('Start a new streak today.')).not.toBeInTheDocument();
    expect(within(noOverspend).queryByText(/Set a limit/)).not.toBeInTheDocument();
    // The check-in streak is at 0 and not kept this week either: it can start today, and says so.
    expect(within(checkin).getByText('Start a new streak today.')).toBeInTheDocument();
  });
});

describe('Quests screen: quests', () => {
  it('groups quests by day, week and month', () => {
    renderQuests((d) => {
      d.tables.budgetLimit = [aLimit()];
      d.tables.subscription = [makeSubscription()];
      d.tables.profile = [makeProfile()];
    });

    const today = within(group('Today'));
    expect(today.getByText("Log today's spending")).toBeInTheDocument();
    expect(today.getAllByRole('listitem')).toHaveLength(1);

    const week = within(group('This week'));
    expect(week.getByText('Stay within your limits this week')).toBeInTheDocument();
    expect(week.getByText('Do your weekly check-in')).toBeInTheDocument();
    expect(week.getAllByRole('listitem')).toHaveLength(2);

    const month = within(group('This month'));
    expect(month.getByText("Reconcile this month's salary")).toBeInTheDocument();
    expect(month.getByText('Audit your subscriptions')).toBeInTheDocument();
    expect(month.getByText('Back up your data')).toBeInTheDocument();
    expect(month.getAllByRole('listitem')).toHaveLength(3);

    // The groups are the Quests section's own.
    expect(within(region('Quests')).getAllByRole('group')).toHaveLength(3);
  });

  it('leaves out a group with nothing in it', () => {
    // A demo can't back up, so with no salary or subscriptions nothing is left for the month.
    renderQuests(() => {}, { namespace: 'demo' });
    expect(group('Today')).toBeInTheDocument();
    expect(group('This week')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'This month' })).not.toBeInTheDocument();
  });

  it('keeps the quest buttons working', async () => {
    renderQuests();
    await userEvent.click(within(group('Today')).getByRole('button', { name: 'Nothing spent' }));
    expect(actions.checkInNoSpend).toHaveBeenCalledOnce();
    await userEvent.click(within(group('This week')).getByRole('button', { name: 'Check in' }));
    expect(screen.getByRole('dialog', { name: 'Weekly check-in' })).toBeInTheDocument();
  });
});

describe('Quests screen: challenges', () => {
  it('shows a running challenge with its progress and the days left', () => {
    renderQuests((d) => {
      d.tables.budgetLimit = [aLimit()];
      d.tables.challenge = [
        makeChallenge({ id: 'c1', kind: 'budget-30', start: TODAY, end: '2026-11-12' }),
      ];
    });

    const active = within(group('Active'));
    expect(active.getByText('30-Day Budget Streak')).toBeInTheDocument();
    expect(active.getByText('Day 1 of 30, within every limit')).toBeInTheDocument();
    expect(active.getByText('1 / 30')).toBeInTheDocument();
    expect(active.getByText('30 days left')).toBeInTheDocument();
    const bar = active.getByRole('progressbar', { name: '30-Day Budget Streak' });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '30');
    expect(bar).toHaveAttribute('aria-valuetext', 'Day 1 of 30, within every limit');
    expect(bar.firstElementChild).toHaveClass('bg-xp');
    expect(active.getByRole('button', { name: 'Give up' })).toBeInTheDocument();
    // A running challenge is not offered again.
    expect(within(group('Available')).queryByText('30-Day Budget Streak')).not.toBeInTheDocument();
  });

  it('counts the last day as a day left', () => {
    renderQuests((d) => {
      d.tables.budgetLimit = [aLimit()];
      d.tables.challenge = [makeChallenge({ kind: 'budget-30', start: '2026-09-15', end: TODAY })];
    });
    expect(screen.getByText('1 day left')).toBeInTheDocument();
  });

  it('shows the emergency sprint in money, not minor units', () => {
    renderQuests((d) => {
      d.tables.profile = [makeProfile()];
      d.tables.goal = [makeGoal({ kind: 'emergency', current: 300_000, target: 1_000_000 })];
      d.tables.challenge = [
        makeChallenge({
          kind: 'emergency-sprint',
          start: TODAY,
          end: '2026-11-12',
          baseline: 270_000,
          goal: 100_000,
        }),
      ];
    });
    const active = within(group('Active'));
    // 30000 of 100000 minor units: $300.00 of $1,000.00.
    expect(active.getByText(`${usd(30_000)} / ${usd(100_000)}`)).toBeInTheDocument();
    expect(active.queryByText(/30000|100000/)).not.toBeInTheDocument();
  });

  it('starts a challenge and gives it up after asking', async () => {
    renderQuests((d) => {
      d.tables.budgetLimit = [aLimit()];
      d.tables.challenge = [
        makeChallenge({ id: 'c1', kind: 'budget-30', start: TODAY, end: '2026-11-12' }),
      ];
    });

    // Start: the available challenge that can start.
    const weekend = screen.getByText('No-Spend Weekend').closest('li')!;
    expect(
      within(weekend).getByText('Log no spending this coming Saturday and Sunday.'),
    ).toBeInTheDocument();
    expect(within(weekend).getByText('+120 XP, +30 coins')).toHaveClass('text-xp-text');
    await userEvent.click(within(weekend).getByRole('button', { name: 'Start' }));
    expect(actions.startChallenge).toHaveBeenCalledExactlyOnceWith('no-spend-weekend');

    // Give up: asks first, and Keep going leaves it running.
    await userEvent.click(within(group('Active')).getByRole('button', { name: 'Give up' }));
    const dialog = screen.getByRole('dialog', { name: 'Give up 30-Day Budget Streak?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep going' }));
    expect(actions.abandonChallenge).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /Give up/ })).not.toBeInTheDocument();

    await userEvent.click(within(group('Active')).getByRole('button', { name: 'Give up' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Give up 30-Day Budget Streak?' })).getByRole(
        'button',
        { name: 'Give up' },
      ),
    );
    expect(actions.abandonChallenge).toHaveBeenCalledExactlyOnceWith('c1');
    expect(screen.queryByRole('dialog', { name: /Give up/ })).not.toBeInTheDocument();
  });

  it('keeps the dialog open and says why when giving up fails', async () => {
    actions.abandonChallenge.mockRejectedValueOnce(new Error('That item no longer exists.'));
    renderQuests((d) => {
      d.tables.budgetLimit = [aLimit()];
      d.tables.challenge = [
        makeChallenge({ id: 'c1', kind: 'budget-30', start: TODAY, end: '2026-11-12' }),
      ];
    });
    await userEvent.click(within(group('Active')).getByRole('button', { name: 'Give up' }));
    const dialog = screen.getByRole('dialog', { name: 'Give up 30-Day Budget Streak?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Give up' }));
    expect(await screen.findByText('That item no longer exists.')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Give up 30-Day Budget Streak?' }),
    ).toBeInTheDocument();
  });

  it('turns Start off while a start is pending, so a double tap starts one challenge', async () => {
    let finish!: () => void;
    actions.startChallenge.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({}))),
    );
    renderQuests();
    const row = screen.getByText('No-Spend Weekend').closest('li')!;
    const start = within(row).getByRole('button', { name: 'Start' });

    await userEvent.click(start);
    expect(start).toBeDisabled();
    await userEvent.click(start);
    expect(actions.startChallenge).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(start).toBeEnabled();
  });

  it('turns Give up off while it is pending', async () => {
    let finish!: () => void;
    actions.abandonChallenge.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    renderQuests((d) => {
      d.tables.budgetLimit = [aLimit()];
      d.tables.challenge = [
        makeChallenge({ id: 'c1', kind: 'budget-30', start: TODAY, end: '2026-11-12' }),
      ];
    });
    await userEvent.click(within(group('Active')).getByRole('button', { name: 'Give up' }));
    const dialog = screen.getByRole('dialog', { name: 'Give up 30-Day Budget Streak?' });
    const confirm = within(dialog).getByRole('button', { name: 'Give up' });

    await userEvent.click(confirm);
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(actions.abandonChallenge).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(screen.queryByRole('dialog', { name: /Give up/ })).not.toBeInTheDocument();
  });

  it('disables Start with the reason', () => {
    renderQuests();
    const available = within(group('Available'));

    const budget = available.getByText('30-Day Budget Streak').closest('li')!;
    expect(within(budget).getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(within(budget).getByText('Set a limit first.')).toBeInTheDocument();

    const audit = available.getByText('Subscription Audit').closest('li')!;
    expect(within(audit).getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(within(audit).getByText('Add a subscription first.')).toBeInTheDocument();

    const sprint = available.getByText('Emergency Fund Sprint').closest('li')!;
    expect(within(sprint).getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(within(sprint).getByText('Add an emergency fund goal first.')).toBeInTheDocument();

    const weekend = available.getByText('No-Spend Weekend').closest('li')!;
    expect(within(weekend).getByRole('button', { name: 'Start' })).toBeEnabled();
    expect(within(weekend).queryByText(/first\./)).not.toBeInTheDocument();
  });

  it('links the reason to its button for screen readers', () => {
    renderQuests();
    const budget = screen.getByText('30-Day Budget Streak').closest('li')!;
    const start = within(budget).getByRole('button', { name: 'Start' });
    expect(start).toHaveAccessibleDescription('Set a limit first.');
  });

  it('shows the last 5 finished challenges as Won, Missed or Given up', () => {
    renderQuests((d) => {
      d.tables.subscription = [makeSubscription()];
      d.tables.expense = [makeExpense({ date: '2026-10-03', createdAt: AT('2026-10-03') })];
      d.tables.ledger = [makeLedgerEntry({ key: 'challenge:won', xp: 120, coins: 30 })];
      const at = (n: number) => AT(`2026-09-0${n}`);
      d.tables.challenge = [
        // Won: paid in the ledger.
        makeChallenge({
          id: 'won',
          kind: 'subscription-audit',
          createdAt: at(6),
          start: '2026-09-06',
          end: '2026-09-12',
        }),
        // Missed: something was logged on the weekend.
        makeChallenge({
          id: 'lost',
          kind: 'no-spend-weekend',
          createdAt: at(5),
          start: '2026-10-03',
          end: '2026-10-04',
        }),
        makeChallenge({ id: 'a1', kind: 'budget-30', status: 'abandoned', createdAt: at(4) }),
        makeChallenge({ id: 'a2', kind: 'budget-30', status: 'abandoned', createdAt: at(3) }),
        makeChallenge({ id: 'a3', kind: 'budget-30', status: 'abandoned', createdAt: at(2) }),
        // The oldest: not among the last 5.
        makeChallenge({
          id: 'old',
          kind: 'emergency-sprint',
          status: 'abandoned',
          createdAt: at(1),
        }),
      ];
    });

    const rows = within(group('Finished')).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(within(rows[0]!).getByText('Subscription Audit')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Won')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('No-Spend Weekend')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Missed')).toBeInTheDocument();
    for (const row of rows.slice(2)) {
      expect(within(row).getByText('30-Day Budget Streak')).toBeInTheDocument();
      expect(within(row).getByText('Given up')).toBeInTheDocument();
    }
    expect(within(group('Finished')).queryByText('Emergency Fund Sprint')).not.toBeInTheDocument();
  });

  it('shows only the groups that have something in them', () => {
    const running: Record<ChallengeKind, Partial<Parameters<typeof makeChallenge>[0]>> = {
      'no-spend-weekend': {},
      'subscription-audit': {},
      'budget-30': {},
      'emergency-sprint': { baseline: 300_000, goal: 100_000 },
    };
    renderQuests((d) => {
      d.tables.budgetLimit = [aLimit()];
      d.tables.subscription = [makeSubscription()];
      d.tables.goal = [makeGoal({ current: 300_000 })];
      d.tables.challenge = (Object.keys(running) as ChallengeKind[]).map((kind) =>
        makeChallenge({ kind, start: TODAY, end: '2026-11-12', ...running[kind] }),
      );
    });
    const section = within(region('Challenges'));
    expect(section.getByRole('group', { name: 'Active' })).toBeInTheDocument();
    expect(section.getAllByRole('button', { name: 'Give up' })).toHaveLength(4);
    expect(section.queryByRole('group', { name: 'Available' })).not.toBeInTheDocument();
    expect(section.queryByRole('group', { name: 'Finished' })).not.toBeInTheDocument();
  });
});

describe('Quests screen: badges', () => {
  it('shows earned and locked badges', () => {
    const { container } = renderQuests((d) => {
      d.tables.ledger = [
        makeLedgerEntry({
          key: 'badge:first-expense',
          xp: 50,
          coins: 10,
          createdAt: AT('2026-10-10'),
        }),
        purchaseEntry('frame-gold', 'p1', AT('2026-10-01')),
      ];
      d.tables.settings = [
        makeSettings({
          cosmetics: { theme: 'theme-violet', avatar: 'avatar-sprout', frame: 'frame-gold' },
        }),
      ];
    });

    const badges = within(region('Badges')).getAllByRole('listitem');
    expect(badges).toHaveLength(4);

    const earned = badges[0]!;
    expect(within(earned).getByText('First Expense Logged')).toBeInTheDocument();
    expect(within(earned).getByText(`Earned ${formatDate('2026-10-10')}`)).toBeInTheDocument();
    expect(within(earned).queryByText('Log your first expense.')).not.toBeInTheDocument();
    expect(earned.querySelector('svg.lucide-lock')).not.toBeInTheDocument();
    expect(earned.querySelector('svg.lucide-receipt')).toBeInTheDocument();
    expect(earned.querySelector('[class*="ring-[#d4a017]"]')).toBeInTheDocument();

    const locked = {
      'Subscription Slayer': ["Cancel a subscription you don't need.", 'scissors'],
      'Limit Keeper': ['Finish a calendar month without going over any limit.', 'target'],
      'Freeze Master': ['Get through a salary freeze without going over any limit.', 'snowflake'],
    } as const;
    for (const [name, [description, icon]] of Object.entries(locked)) {
      const row = screen.getByText(name).closest('li')!;
      expect(within(row).getByText(description)).toBeInTheDocument();
      expect(row.querySelector('svg.lucide-lock')).toBeInTheDocument();
      expect(row.querySelector(`svg.lucide-${icon}`)).toBeInTheDocument();
      expect(within(row).queryByText(/Earned/)).not.toBeInTheDocument();
      expect(row.querySelector('[class*="ring-"]')).not.toBeInTheDocument();
    }
    expect(container.querySelectorAll('svg.lucide-lock')).toHaveLength(3);
  });
});

describe('Quests screen: how to earn', () => {
  it('explains how XP is earned', () => {
    renderQuests((d) => {
      d.tables.budgetLimit = [aLimit()];
    });
    const section = within(region('How to earn'));
    const list = (name: string) => within(section.getByRole('group', { name }));

    expect(
      list('Logging').getByText('Log an expense or income — +10 XP (up to 5 a day)'),
    ).toBeInTheDocument();

    const quests = list('Quests');
    expect(quests.getByText("Log today's spending — +20 XP, +5 coins")).toBeInTheDocument();
    expect(
      quests.getByText('Stay within your limits this week — +60 XP, +15 coins'),
    ).toBeInTheDocument();
    expect(quests.getByText('Do your weekly check-in — +40 XP, +10 coins')).toBeInTheDocument();
    expect(
      quests.getByText("Reconcile this month's salary — +100 XP, +25 coins"),
    ).toBeInTheDocument();
    expect(quests.getByText('Audit your subscriptions — +100 XP, +25 coins')).toBeInTheDocument();
    expect(quests.getByText('Back up your data — +80 XP, +20 coins')).toBeInTheDocument();
    expect(quests.getAllByRole('listitem')).toHaveLength(6);

    const logging = list('Daily logging streak');
    expect(logging.getByText('7-day streak — +50 XP, +10 coins')).toBeInTheDocument();
    expect(logging.getByText('30-day streak — +150 XP, +40 coins')).toBeInTheDocument();
    expect(logging.getByText('100-day streak — +400 XP, +100 coins')).toBeInTheDocument();
    expect(
      logging.getByText(`365-day streak — +${(1000).toLocaleString()} XP, +250 coins`),
    ).toBeInTheDocument();
    const noOverspend = list('No overspending streak');
    expect(noOverspend.getAllByRole('listitem')).toHaveLength(4);
    expect(noOverspend.getByText('7-day streak — +50 XP, +10 coins')).toBeInTheDocument();
    const checkin = list('Weekly check-in streak');
    expect(checkin.getByText('4-week streak — +60 XP, +15 coins')).toBeInTheDocument();
    expect(checkin.getByText('12-week streak — +200 XP, +50 coins')).toBeInTheDocument();
    expect(checkin.getByText('52-week streak — +800 XP, +200 coins')).toBeInTheDocument();

    const badges = list('Badges');
    expect(badges.getByText('First Expense Logged — +50 XP, +10 coins')).toBeInTheDocument();
    expect(badges.getByText('Subscription Slayer — +100 XP, +25 coins')).toBeInTheDocument();
    expect(badges.getByText('Limit Keeper — +150 XP, +40 coins')).toBeInTheDocument();
    expect(badges.getByText('Freeze Master — +150 XP, +40 coins')).toBeInTheDocument();

    const challenges = list('Challenges');
    expect(challenges.getByText('No-Spend Weekend — +120 XP, +30 coins')).toBeInTheDocument();
    expect(challenges.getByText('Subscription Audit — +120 XP, +30 coins')).toBeInTheDocument();
    expect(challenges.getByText('30-Day Budget Streak — +400 XP, +100 coins')).toBeInTheDocument();
    expect(challenges.getByText('Emergency Fund Sprint — +250 XP, +60 coins')).toBeInTheDocument();
  });
});

describe('Quests screen: how to earn, with nothing set up', () => {
  it('lists all six quests with their rewards, whether or not they apply yet', () => {
    // No limit, no salary, no subscription, and a demo that cannot back up: three quests do not apply.
    renderQuests(() => {}, { namespace: 'demo' });
    expect(screen.queryByRole('group', { name: 'This month' })).not.toBeInTheDocument();

    const quests = within(within(region('How to earn')).getByRole('group', { name: 'Quests' }));
    expect(quests.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      "Log today's spending — +20 XP, +5 coins",
      'Stay within your limits this week — +60 XP, +15 coins',
      'Do your weekly check-in — +40 XP, +10 coins',
      "Reconcile this month's salary — +100 XP, +25 coins",
      'Audit your subscriptions — +100 XP, +25 coins',
      'Back up your data — +80 XP, +20 coins',
    ]);
  });
});

describe('Quests screen: recent XP', () => {
  it('lists recent XP', () => {
    renderQuests((d) => {
      d.tables.ledger = [
        makeLedgerEntry({
          key: 'log:expense:e1',
          label: 'Logged an expense',
          xp: 10,
          coins: 0,
          createdAt: AT('2026-10-14'),
        }),
        makeLedgerEntry({
          key: 'quest:log-today:2026-10-13',
          label: "Quest: Log today's spending",
          xp: 20,
          coins: 5,
          createdAt: AT('2026-10-13'),
        }),
        makeLedgerEntry({
          key: 'log:expense:e2',
          kind: 'reversal',
          label: 'Logged an expense',
          xp: -10,
          coins: 0,
          createdAt: AT('2026-10-12'),
        }),
        makeLedgerEntry({
          key: 'shop:avatar-cat:p1',
          kind: 'purchase',
          label: 'Bought the Cat avatar',
          xp: 0,
          coins: -80,
          createdAt: AT('2026-10-11'),
        }),
      ];
    });

    const rows = within(region('Recent XP')).getAllByRole('listitem');
    expect(rows).toHaveLength(4);

    expect(within(rows[0]!).getByText('Logged an expense')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('+10 XP')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText(/coin/)).not.toBeInTheDocument();
    expect(within(rows[0]!).getByText(formatDate('2026-10-14'))).toBeInTheDocument();

    expect(within(rows[1]!).getByText("Quest: Log today's spending")).toBeInTheDocument();
    expect(within(rows[1]!).getByText('+20 XP')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('+5 coins')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(formatDate('2026-10-13'))).toBeInTheDocument();

    expect(within(rows[2]!).getByText('−10 XP')).toBeInTheDocument();

    expect(within(rows[3]!).getByText('Bought the Cat avatar')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('0 XP')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('−80 coins')).toBeInTheDocument();
  });

  it('invites a first log when there is no XP yet', () => {
    renderQuests();
    expect(within(region('Recent XP')).getByText('No XP yet')).toBeInTheDocument();
    expect(within(region('Recent XP')).queryByRole('listitem')).not.toBeInTheDocument();
  });
});
