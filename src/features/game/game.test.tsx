import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestView } from '@/domain/game/quests';
import { purchaseEntry } from '@/domain/game/shop';
import type { QuestId } from '@/domain/game/types';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { formatMoney } from '@/domain/money';
import { toastStore } from '@/lib/toast';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import { createGameActions } from '@/store/gameActions';
import { useGameView } from '@/store/useGame';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import {
  makeAccount,
  makeExpense,
  makeLedgerEntry,
  makeLegacyPurchase,
  makeLimit,
  makeSettings,
  makeSubscription,
} from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { Avatar } from './Avatar';
import { QuestList } from './QuestList';
import { useBlockTone, useGameTheme } from './useGameTheme';
import { WeeklyCheckInDialog } from './WeeklyCheckInDialog';

const TODAY = '2026-10-14'; // a Wednesday: with weeks starting Monday the week starts 2026-10-12
const usd = (minor: number) => formatMoney(minor, 'USD');

function renderIn(ui: ReactNode, store = createStubStore()) {
  return renderWithStore(<MemoryRouter>{ui}</MemoryRouter>, store);
}

/** A stub store holding `data`, with the cosmetics and the ledger entries that own them. */
function dataWith(patch: (data: DataSnapshot) => void): DataSnapshot {
  const data = emptySnapshot();
  patch(data);
  return data;
}

/** A credit card owing 500.00, due on `dueDay`. */
const visa = (dueDay: number) =>
  makeAccount({
    id: 'card-visa',
    name: 'Visa',
    kind: 'credit',
    skin: 'violet',
    inAvailable: false,
    openingBalance: 500_00,
    openingDate: '2026-10-01',
    credit: {
      limit: null,
      statementDay: null,
      dueDay,
      payInFull: true,
      minimumPayment: 0,
      interestRate: 0,
    },
  });

function quest(id: QuestId, over: Partial<QuestView> = {}): QuestView {
  return {
    id,
    cadence: 'daily',
    period: TODAY,
    title: `Title of ${id}`,
    detail: `Detail of ${id}`,
    current: 0,
    target: 1,
    done: false,
    reward: { xp: 20, coins: 5 },
    action: null,
    ...over,
  };
}

afterEach(() => toastStore.setState({ toasts: [] }));

describe('Avatar', () => {
  const icons = {
    'avatar-sprout': 'sprout',
    'avatar-rocket': 'rocket',
    'avatar-cat': 'cat',
    'avatar-mountain': 'mountain',
    'avatar-anchor': 'anchor',
    'avatar-crown': 'crown',
    'avatar-gem': 'gem',
  };

  it.each(Object.entries(icons))('draws %s as a lucide %s icon', (item, icon) => {
    const { container } = renderIn(<Avatar item={item} frame="frame-none" size={32} />);
    expect(container.querySelector(`svg.lucide-${icon}`)).toBeInTheDocument();
  });

  it('draws a sprout for an item it does not know', () => {
    const { container } = renderIn(<Avatar item="avatar-unknown" frame="frame-none" size={32} />);
    expect(container.querySelector('svg.lucide-sprout')).toBeInTheDocument();
  });

  it('draws the frames as 2px rings, and no ring for none', () => {
    const ring = (frame: string) => {
      const { container, unmount } = renderIn(<Avatar item="avatar-cat" frame={frame} size={40} />);
      const classes = (container.firstElementChild as HTMLElement).className;
      unmount();
      return classes;
    };
    expect(ring('frame-bronze')).toMatch(/\bring-2\b.*\bring-\[#b0703c\]/);
    expect(ring('frame-silver')).toMatch(/\bring-2\b.*\bring-\[#a8adb7\]/);
    expect(ring('frame-gold')).toMatch(/\bring-2\b.*\bring-\[#d4a017\]/);
    expect(ring('frame-platinum')).toMatch(/\bring-2\b.*\bring-\[#8fb3c9\]/);
    expect(ring('frame-diamond')).toMatch(/\bring-2\b.*\bring-\[#4cc9f0\]/);
    expect(ring('frame-game')).toMatch(/\bring-2\b.*\bring-xp\b/);
    expect(ring('frame-none')).not.toMatch(/\bring/);
    expect(ring('frame-unknown')).not.toMatch(/\bring/);
  });

  it('draws the prism frame as a rainbow ring, not a plain one', () => {
    const { container } = renderIn(<Avatar item="avatar-cat" frame="frame-prism" size={40} />);
    const classes = (container.firstElementChild as HTMLElement).className;
    // frame-prism is the conic-gradient ring in index.css; a plain 2px ring could not be a gradient.
    expect(classes).toMatch(/\bframe-prism\b/);
    expect(classes).not.toMatch(/\bring-/);
  });

  it("is the theme's avatar chip on the block, and the page's light chip on the page", () => {
    const chip = (tone?: 'page' | 'hero') => {
      const { container, unmount } = renderIn(
        <Avatar item="avatar-cat" frame="frame-none" size={40} tone={tone} />,
      );
      const classes = (container.firstElementChild as HTMLElement).className;
      unmount();
      return classes;
    };
    // The raw variables, so a preview's own theme shows too; --av-ink is the ink that holds on --av.
    expect(chip('hero')).toMatch(/\bbg-\(--av\)/);
    expect(chip('hero')).toMatch(/\btext-\(--av-ink\)/);
    expect(chip('hero')).not.toMatch(/\bbg-surface-2\b/);
    expect(chip('page')).toMatch(/\bbg-surface-2\b.*\btext-text\b|\btext-text\b.*\bbg-surface-2\b/);
    expect(chip()).toBe(chip('page'));
  });

  it('is as big as asked and is not read out on its own', () => {
    const { container } = renderIn(<Avatar item="avatar-cat" frame="frame-none" size={40} />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar).toHaveStyle({ width: '40px', height: '40px' });
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('useGameTheme', () => {
  function themeOf() {
    return document.documentElement.dataset.gameTheme;
  }
  const wrapperFor =
    (store: ReturnType<typeof createStubStore>) =>
    ({ children }: { children: ReactNode }) => (
      <AppStoreProvider store={store}>{children}</AppStoreProvider>
    );

  it('applies the equipped game theme while unlocked, and removes it when locked', async () => {
    const { store } = await freshRealStore();
    await store.getState().setSecret('2468', 'pin'); // a store with no lock cannot be locked
    await store.getState().put('ledger', makeLedgerEntry({ key: 'seed', xp: 0, coins: 500 }));
    const game = createGameActions(store);
    renderHook(() => useGameTheme(), { wrapper: wrapperFor(store) });
    expect(themeOf()).toBe('mono');

    await act(async () => {
      await game.buy('theme-sky');
      await game.equip('theme-sky');
    });
    expect(themeOf()).toBe('sky');

    act(() => store.getState().lock());
    expect(store.getState().phase).toBe('locked');
    expect(themeOf()).toBeUndefined();
  });

  it('follows the equipped theme and falls back to mono for one that is not owned', () => {
    const settings = (theme: string) =>
      makeSettings({ cosmetics: { theme, avatar: 'avatar-sprout', frame: 'frame-none' } });
    const owned = [purchaseEntry('theme-forest', 'p1', '2026-10-01T10:00:00.000Z')];
    const store = createStubStore({
      data: dataWith((d) => {
        d.tables.settings = [settings('theme-navy')];
        d.tables.ledger = owned;
      }),
    });
    renderHook(() => useGameTheme(), { wrapper: wrapperFor(store) });
    expect(themeOf()).toBe('mono'); // navy is equipped but was never bought

    act(() =>
      store.setState({
        data: dataWith((d) => {
          d.tables.settings = [settings('theme-forest')];
          d.tables.ledger = owned;
        }),
      }),
    );
    expect(themeOf()).toBe('forest');
  });

  it('shows a 0.11 theme as the one that replaced it, and the old default as mono', () => {
    const settings = (theme: string) =>
      makeSettings({ cosmetics: { theme, avatar: 'avatar-sprout', frame: 'frame-none' } });
    const ocean = [makeLegacyPurchase('theme-ocean', 150)];
    const store = createStubStore({
      data: dataWith((d) => {
        d.tables.settings = [settings('theme-violet')];
        d.tables.ledger = ocean;
      }),
    });
    renderHook(() => useGameTheme(), { wrapper: wrapperFor(store) });
    expect(themeOf()).toBe('mono'); // violet was the free default

    act(() =>
      store.setState({
        data: dataWith((d) => {
          d.tables.settings = [settings('theme-ocean')];
          d.tables.ledger = ocean;
        }),
      }),
    );
    expect(themeOf()).toBe('powder'); // the Ocean that was bought is Powder Blue now

    act(() =>
      store.setState({
        data: dataWith((d) => {
          d.tables.settings = [settings('theme-ocean')];
        }),
      }),
    );
    expect(themeOf()).toBe('mono'); // Ocean was never bought, so there is nothing to read it as
  });

  it('sets nothing before the app is unlocked, and cleans up when it goes', () => {
    const store = createStubStore({ phase: 'welcome' });
    const view = renderHook(() => useGameTheme(), { wrapper: wrapperFor(store) });
    expect(themeOf()).toBeUndefined();

    act(() => store.setState({ phase: 'unlocked' }));
    expect(themeOf()).toBe('mono');

    view.unmount();
    expect(themeOf()).toBeUndefined();
  });
});

describe('useBlockTone', () => {
  /** The tone of the block with `theme` equipped and `ledger` holding what was bought. */
  function toneWith(
    theme: string,
    ledger = [purchaseEntry(theme, 'p1', '2026-10-01T10:00:00.000Z')],
  ) {
    const store = createStubStore({
      data: dataWith((d) => {
        d.tables.settings = [
          makeSettings({ cosmetics: { theme, avatar: 'avatar-sprout', frame: 'frame-none' } }),
        ];
        d.tables.ledger = ledger;
      }),
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppStoreProvider store={store}>{children}</AppStoreProvider>
    );
    return renderHook(() => useBlockTone(), { wrapper }).result.current;
  }

  it('is dark for Black & White, the free theme and the default', () => {
    const store = createStubStore();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppStoreProvider store={store}>{children}</AppStoreProvider>
    );
    expect(renderHook(() => useBlockTone(), { wrapper }).result.current).toBe('dark');
    expect(toneWith('theme-mono', [])).toBe('dark');
  });

  it('is light for a light theme and dark for a dark one', () => {
    expect(toneWith('theme-sky')).toBe('light');
    expect(toneWith('theme-seafoam')).toBe('light');
    expect(toneWith('theme-navy')).toBe('dark');
    expect(toneWith('theme-espresso')).toBe('dark');
  });

  it('reads a 0.11 theme as the one that replaced it, and one not owned as Black & White', () => {
    // A bought Ocean is Powder Blue now: a light block.
    expect(toneWith('theme-ocean', [makeLegacyPurchase('theme-ocean', 150)])).toBe('light');
    // Sunny Sky equipped but never bought is not worn.
    expect(toneWith('theme-sky', [])).toBe('dark');
  });
});

describe('QuestList', () => {
  it('shows each quest with its icon, title, detail, progress and reward', () => {
    const icons: Record<QuestId, string> = {
      'log-today': 'receipt',
      'week-limits': 'target',
      'week-checkin': 'calendar-check',
      'month-salary': 'wallet',
      'month-audit': 'list-checks',
      'month-dividends': 'coins',
    };
    const quests = (Object.keys(icons) as QuestId[]).map((id) =>
      quest(id, { current: 1, target: 4, reward: { xp: 40, coins: 10 } }),
    );
    renderIn(<QuestList quests={quests} />);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(6);
    for (const [id, icon] of Object.entries(icons)) {
      const row = screen.getByText(`Title of ${id}`).closest('li')!;
      expect(row.querySelector(`svg.lucide-${icon}`)).toBeInTheDocument();
      expect(within(row).getByText(`Detail of ${id}`)).toBeInTheDocument();
      expect(within(row).getByText('+40 XP')).toHaveClass('text-xp-text');
      const bar = within(row).getByRole('progressbar', { name: `Title of ${id}` });
      expect(bar).toHaveAttribute('aria-valuenow', '1');
      expect(bar).toHaveAttribute('aria-valuemax', '4');
      expect(bar).toHaveAttribute('aria-valuetext', `Detail of ${id}`);
      expect(bar.firstElementChild).toHaveClass('bg-xp');
      expect(bar.firstElementChild).toHaveStyle({ width: '25%' });
    }
  });

  it('shows Done in place of the reward for a finished quest', () => {
    renderIn(
      <QuestList
        quests={[quest('log-today', { done: true, current: 1, detail: 'Done for today' })]}
      />,
    );
    const row = screen.getByText('Title of log-today').closest('li')!;
    expect(within(row).getByText('Done')).toBeInTheDocument();
    expect(row.querySelector('svg.lucide-check')).toBeInTheDocument();
    expect(within(row).queryByText(/XP/)).not.toBeInTheDocument();
    expect(within(row).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('puts unfinished quests first, then daily before weekly before monthly', () => {
    const quests = [
      quest('month-salary', { cadence: 'monthly' }),
      quest('week-checkin', { cadence: 'weekly', done: true }),
      quest('week-limits', { cadence: 'weekly' }),
      quest('log-today', { cadence: 'daily', done: true }),
      quest('month-dividends', { cadence: 'monthly', done: true }),
      quest('month-audit', { cadence: 'monthly' }),
    ];
    renderIn(<QuestList quests={quests} />);
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)).toEqual(
      [
        'Title of week-limits',
        'Title of month-salary',
        'Title of month-audit',
        'Title of log-today',
        'Title of week-checkin',
        'Title of month-dividends',
      ],
    );
  });

  it('shows no more than the limit', () => {
    const quests = [quest('log-today'), quest('week-limits'), quest('week-checkin')];
    renderIn(<QuestList quests={quests} limit={2} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('Title of week-checkin')).not.toBeInTheDocument();
  });

  it('records Nothing spent from the quest row', async () => {
    const { store } = await freshRealStore();
    function Quests() {
      return <QuestList quests={useGameView().quests} />;
    }
    renderIn(<Quests />, store);
    const row = screen.getByText("Log today's spending").closest('li')!;
    expect(within(row).queryByText('Done')).not.toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: 'Nothing spent' }));

    expect(await within(row).findByText('Done')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Nothing spent' })).not.toBeInTheDocument();
    expect(store.getState().data.tables.checkIn).toEqual([
      expect.objectContaining({ id: `checkin:no-spend:${TODAY}`, kind: 'no-spend', date: TODAY }),
    ]);
  });

  it('keeps Nothing spent off while it is being recorded, so a double tap runs it once', async () => {
    let finish!: () => void;
    const put = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderIn(
      <QuestList quests={[quest('log-today', { action: 'no-spend' })]} />,
      createStubStore({ put }),
    );
    const button = screen.getByRole('button', { name: 'Nothing spent' });

    await userEvent.dblClick(button);
    expect(button).toBeDisabled();
    expect(put).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(button).toBeEnabled();
  });

  it('says why when Nothing spent is refused', async () => {
    const put = vi.fn(async () => {});
    const data = dataWith((d) => {
      d.tables.expense = [makeExpense({ date: TODAY })];
    });
    renderIn(
      <QuestList quests={[quest('log-today', { action: 'no-spend' })]} />,
      createStubStore({ data, today: TODAY, put }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Nothing spent' }));

    expect(put).not.toHaveBeenCalled();
    expect(toastStore.getState().toasts).toEqual([
      expect.objectContaining({ tone: 'danger', message: 'You already logged spending today.' }),
    ]);
    expect(screen.getByRole('button', { name: 'Nothing spent' })).toBeEnabled();
  });

  it('opens the weekly check-in from the Check in button', async () => {
    renderIn(
      <QuestList quests={[quest('week-checkin', { cadence: 'weekly', action: 'checkin' })]} />,
    );
    expect(screen.queryByRole('dialog', { name: 'Weekly check-in' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Check in' }));

    expect(screen.getByRole('dialog', { name: 'Weekly check-in' })).toBeInTheDocument();
  });

  it('offers no button to a quest with no action', () => {
    renderIn(<QuestList quests={[quest('week-limits', { cadence: 'weekly' })]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('WeeklyCheckInDialog', () => {
  /** Four weekly limits at 120%, 90%, 50% and 10% this week, and bills 4 and 20 days out. */
  function weekData() {
    return dataWith((d) => {
      const spend = (
        category: 'entertainment' | 'transport' | 'food' | 'shopping',
        cents: number,
      ) => {
        d.tables.budgetLimit.push(makeLimit({ category, amount: 100_00 }));
        d.tables.expense.push(makeExpense({ category, amount: cents, date: '2026-10-13' }));
      };
      spend('entertainment', 120_00);
      spend('transport', 90_00);
      spend('food', 50_00);
      spend('shopping', 10_00);
      d.tables.subscription = [
        makeSubscription({ name: 'Streamflix', amount: 15_99, nextRenewal: '2026-10-18' }),
        makeSubscription({ name: 'FitHub Gym', amount: 40_00, nextRenewal: '2026-10-30' }),
      ];
    });
  }

  it('looks back on the week: spending, the top three limits and the bills coming', () => {
    renderIn(
      <WeeklyCheckInDialog open onClose={() => {}} />,
      createStubStore({ data: weekData(), today: TODAY }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Weekly check-in' });

    expect(within(dialog).getByText('Spent this week')).toBeInTheDocument();
    expect(within(dialog).getByText(usd(270_00))).toBeInTheDocument();

    const limits = within(dialog).getByRole('list', { name: 'Limits' });
    expect(
      within(limits)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Fun · this week120% used',
      'Transport · this week90% used',
      'Food · this week50% used',
    ]);

    expect(within(dialog).getByText('Bills in the next 7 days')).toBeInTheDocument();
    expect(within(dialog).getByText(`1 bill · ${usd(15_99)}`)).toBeInTheDocument();
  });

  it('counts a renewal in the first days of next month when the week runs past month end', () => {
    const data = dataWith((d) => {
      d.tables.subscription = [
        makeSubscription({ name: 'Streamflix', amount: 15_99, nextRenewal: '2026-11-02' }),
        makeSubscription({ name: 'FitHub Gym', amount: 40_00, nextRenewal: '2026-11-04' }),
      ];
    });
    renderIn(
      <WeeklyCheckInDialog open onClose={() => {}} />,
      createStubStore({ data, today: '2026-10-28' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Weekly check-in' });
    expect(within(dialog).getByText(`1 bill · ${usd(15_99)}`)).toBeInTheDocument();
    expect(within(dialog).queryByText('Nothing due')).not.toBeInTheDocument();
  });

  it('counts bills from today to six days later, and not the seventh day after', () => {
    const data = dataWith((d) => {
      d.tables.subscription = [
        makeSubscription({ name: 'Today', amount: 1_00, nextRenewal: TODAY }),
        makeSubscription({ name: 'Day 6', amount: 2_00, nextRenewal: '2026-10-20' }),
        makeSubscription({ name: 'Day 7', amount: 4_00, nextRenewal: '2026-10-21' }),
      ];
      // A card's next bill is its due day: the 21st is the seventh day after today.
      d.tables.account = [visa(21)];
    });
    renderIn(
      <WeeklyCheckInDialog open onClose={() => {}} />,
      createStubStore({ data, today: TODAY }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Weekly check-in' });
    expect(within(dialog).getByText(`2 bills · ${usd(3_00)}`)).toBeInTheDocument();
  });

  it('counts a card due on the sixth day after today', () => {
    const data = dataWith((d) => {
      d.tables.account = [visa(20)];
    });
    renderIn(
      <WeeklyCheckInDialog open onClose={() => {}} />,
      createStubStore({ data, today: TODAY }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Weekly check-in' });
    expect(within(dialog).getByText(`1 bill · ${usd(500_00)}`)).toBeInTheDocument();
  });

  it('says so when there are no limits and no bills', () => {
    renderIn(<WeeklyCheckInDialog open onClose={() => {}} />, createStubStore({ today: TODAY }));
    const dialog = screen.getByRole('dialog', { name: 'Weekly check-in' });
    expect(within(dialog).getByText(usd(0))).toBeInTheDocument();
    expect(within(dialog).getByText('No limits set yet')).toBeInTheDocument();
    expect(within(dialog).getByText('Nothing due')).toBeInTheDocument();
  });

  it('checks in from the dialog and closes it', async () => {
    const { store } = await freshRealStore();
    function Quests() {
      return <QuestList quests={useGameView().quests} />;
    }
    renderIn(<Quests />, store);
    const row = screen.getByText('Do your weekly check-in').closest('li')!;

    await userEvent.click(within(row).getByRole('button', { name: 'Check in' }));
    const dialog = screen.getByRole('dialog', { name: 'Weekly check-in' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check in' }));

    expect(await within(row).findByText('Done')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Weekly check-in' })).not.toBeInTheDocument(),
    );
    expect(store.getState().data.tables.checkIn).toEqual([
      expect.objectContaining({ id: 'checkin:weekly:2026-10-12', kind: 'weekly' }),
    ]);
  });

  it('closes on Not now without checking in', async () => {
    const onClose = vi.fn();
    const put = vi.fn(async () => {});
    renderIn(<WeeklyCheckInDialog open onClose={onClose} />, createStubStore({ put }));

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
  });

  it('keeps Check in off while it saves, and stays open with the reason if it fails', async () => {
    const onClose = vi.fn();
    let fail!: (e: Error) => void;
    const put = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    renderIn(<WeeklyCheckInDialog open onClose={onClose} />, createStubStore({ put }));
    const button = screen.getByRole('button', { name: 'Check in' });

    await userEvent.dblClick(button);
    expect(button).toBeDisabled();
    expect(put).toHaveBeenCalledTimes(1);

    await act(async () => fail(new Error('Could not save.')));
    expect(onClose).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
    expect(toastStore.getState().toasts).toEqual([
      expect.objectContaining({ tone: 'danger', message: 'Could not save.' }),
    ]);
  });
});

beforeEach(() => {
  delete document.documentElement.dataset.gameTheme;
});
