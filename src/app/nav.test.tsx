import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ChartColumn,
  ChartPie,
  CircleQuestionMark,
  Clock,
  CreditCard,
  House,
  Inbox,
  List,
  Settings,
  ShoppingBag,
  TrendingUp,
  Trophy,
  UserRound,
} from 'lucide-react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { levelStart } from '@/domain/game/levels';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { INBOX_NOW, inboxData } from '@/test/inboxData';
import { makeAccount, makeLedgerEntry, makeProfile } from '@/test/fixtures';
import { CARDS, HOME, INVEST, MENU_GROUPS, PROFILE, SPENDING, TABS } from './menu';
import { appRouteObjects } from './router';

const usd = (minor: number) => formatMoney(minor, 'USD');

function renderAt(path: string, data: DataSnapshot = emptySnapshot()) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: [path] });
  renderWithStore(<RouterProvider router={router} />, createStubStore({ data }));
  return router;
}

/** $1,200 in the bank and $300 in savings: a net worth of $1,500. 130 coins. */
function liveData(): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile({ currency: 'USD' }));
  data.tables.account.push(
    makeAccount({ id: 'main', name: 'Main', openingBalance: 1_200_00 }),
    makeAccount({ id: 'save', name: 'Savings', kind: 'savings', openingBalance: 300_00 }),
  );
  data.tables.ledger.push(makeLedgerEntry({ coins: 130, xp: 0 }));
  return data;
}

/**
 * Profile's menu: the two groups of rows below its header, opened at /profile. The sidebar beside
 * the page lists the same rows, so the rows are looked for in the groups' box alone.
 */
function openMenu(data?: DataSnapshot) {
  renderAt('/profile', data);
  return within(screen.getByRole('main'))
    .getByRole('heading', { level: 2, name: 'Your money' })
    .closest('section')!.parentElement!;
}

/** The row named `label`, a link or a button, with the line under its name: "QuestsLevel 1". */
function row(menu: HTMLElement, label: string) {
  const name = new RegExp(`^${label}`);
  return within(menu).queryByRole('link', { name }) ?? within(menu).getByRole('button', { name });
}

/** The rows of a group, links and buttons, in order. */
function rowsOf(menu: HTMLElement, title: string) {
  const group = within(menu).getByRole('heading', { level: 2, name: title }).parentElement!;
  return [...group.querySelectorAll<HTMLElement>('a, button')];
}

describe('Profile menu rows', () => {
  it('lists History, Net worth and My numbers, then Quests, Shop, Inbox, Help and Settings', () => {
    const menu = openMenu(liveData());

    expect(
      within(menu)
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(['Your money', 'You']);

    const money = rowsOf(menu, 'Your money');
    expect(money.map((el) => [el.tagName, el.getAttribute('href')])).toEqual([
      ['A', '/history'],
      ['BUTTON', null],
      ['BUTTON', null],
    ]);
    expect(money[0]).toHaveTextContent(/^History/);
    expect(money[1]).toHaveTextContent(/^Net worth/);
    expect(money[2]).toHaveTextContent(/^My numbers/);

    expect(rowsOf(menu, 'You').map((el) => el.getAttribute('href'))).toEqual([
      '/quests',
      '/shop',
      '/inbox',
      '/help',
      '/settings',
    ]);
  });

  it('says what is inside each row', () => {
    const menu = openMenu(liveData());
    expect(row(menu, 'History')).toHaveTextContent('Every entry, searchable');
    expect(row(menu, 'Net worth')).toHaveTextContent(usd(1_500_00));
    expect(row(menu, 'Quests')).toHaveTextContent('Level 1');
    expect(row(menu, 'Shop')).toHaveTextContent('130 coins to spend');
    expect(row(menu, 'Inbox')).toHaveTextContent(/^Inbox$/);
    expect(row(menu, 'Help')).toHaveTextContent('How everything works');
    expect(row(menu, 'Settings')).toHaveTextContent('Lock, account, reminders');
  });

  it('no longer lists the pages that moved: Bills & cards, Goals, Debts and Income', () => {
    const menu = openMenu();
    for (const label of ['Bills & cards', 'Goals', 'Debts', 'Income', 'Invest', 'Dividends']) {
      expect(within(menu).queryByRole('link', { name: new RegExp(`^${label}`) }), label).toBeNull();
    }
    expect(within(menu).queryByRole('link', { name: /^Buy it/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: /^About you/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: /^Salary freeze/ })).not.toBeInTheDocument();
  });

  describe('Net worth row', () => {
    afterEach(() => useAmountsHidden.setState({ hidden: false }));

    it('opens the Net worth sheet over Profile, and closing it puts focus back on the row', async () => {
      const router = renderAt('/profile', liveData());
      const menu = within(screen.getByRole('main'));
      const netWorth = menu.getByRole('button', { name: /^Net worth/ });

      await userEvent.click(netWorth);

      const sheet = screen.getByRole('dialog', { name: 'Net worth' });
      expect(within(sheet).getByText('What you have')).toBeInTheDocument();
      expect(within(sheet).getByText('Main')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/profile');

      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'Net worth' })).not.toBeInTheDocument();
      expect(netWorth).toHaveFocus();
    });

    it('hides the amount with the eye', () => {
      useAmountsHidden.setState({ hidden: true });
      expect(row(openMenu(liveData()), 'Net worth')).toHaveTextContent(/^Net worth••••/);
    });
  });

  it('shows My numbers, marked Soon, as a row that does nothing yet', async () => {
    const router = renderAt('/profile');
    const myNumbers = within(screen.getByRole('main')).getByRole('button', {
      name: /^My numbers/,
    });
    expect(myNumbers).toBeDisabled();
    expect(myNumbers).toHaveTextContent('Soon');
    await userEvent.click(myNumbers);
    expect(router.state.location.pathname).toBe('/profile');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks only My numbers as Soon', () => {
    const menu = openMenu();
    expect(within(menu).getAllByText('Soon')).toHaveLength(1);
    expect(row(menu, 'My numbers')).toHaveTextContent('Soon');
  });

  it('puts Quests first in the You group, with the level', () => {
    const menu = openMenu();
    const [first] = rowsOf(menu, 'You');
    expect(first).toHaveAttribute('href', '/quests');
    expect(first).toHaveTextContent('Level 1');
  });

  it('shows the level the player has reached on the Quests row', () => {
    const data = emptySnapshot();
    data.tables.ledger.push(makeLedgerEntry({ coins: 0, xp: levelStart(3) }));
    expect(row(openMenu(data), 'Quests')).toHaveTextContent('Level 3');
  });

  it('says 0 coins when there are none, and the singular for one', () => {
    expect(row(openMenu(), 'Shop')).toHaveTextContent('0 coins to spend');
    cleanup();

    const data = emptySnapshot();
    data.tables.ledger.push(makeLedgerEntry({ coins: 1, xp: 0 }));
    expect(row(openMenu(data), 'Shop')).toHaveTextContent('1 coin to spend');
  });

  it('never shows a negative coin balance', () => {
    const data = emptySnapshot();
    data.tables.ledger.push(
      makeLedgerEntry({ key: 'bought', kind: 'purchase', coins: -40, xp: 0 }),
      makeLedgerEntry({ key: 'earned', coins: 15, xp: 0 }),
    );
    expect(row(openMenu(data), 'Shop')).toHaveTextContent('0 coins to spend');
  });

  describe('Inbox row', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: INBOX_NOW }));
    afterEach(() => vi.useRealTimers());

    it('says how many reminders are new', () => {
      const menu = openMenu(inboxData({ readBefore: null, read: ['week:2026-10-11'] }));
      expect(row(menu, 'Inbox')).toHaveTextContent('Inbox6 new');
    });

    it('says nothing when there are none, whether none came due or all were read', () => {
      expect(row(openMenu(), 'Inbox')).toHaveTextContent(/^Inbox$/);
      cleanup();

      const allRead = inboxData({ readBefore: '2026-10-14T09:00:00.000Z', read: [] });
      expect(row(openMenu(allRead), 'Inbox')).toHaveTextContent(/^Inbox$/);
    });
  });

  it('opens Help, with its pages listed', async () => {
    await userEvent.click(row(openMenu(), 'Help'));
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search help' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Available to spend/ })).toHaveAttribute(
      'href',
      '/help/available',
    );
  });
});

describe('sidebar', () => {
  const sidebar = () => screen.getByRole('navigation', { name: 'All sections' });

  it('puts Add expense first, then the tabs, then the groups with their rows', () => {
    renderAt('/');
    const links = within(sidebar()).getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('Add expense');
    expect(links[0]).toHaveAttribute('href', '/add');
    expect(links.slice(1, 6).map((a) => [a.textContent, a.getAttribute('href')])).toEqual(
      TABS.map((t) => [t.label, t.path]),
    );

    expect(
      within(sidebar())
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(MENU_GROUPS.map((g) => g.title));
    // After the tabs, every row of the groups in order: links, the Net worth button, My numbers.
    const rows = [...sidebar().querySelectorAll('section a, section button')];
    expect(rows.map((el) => el.textContent?.replace('Soon', ''))).toEqual(
      MENU_GROUPS.flatMap((g) => g.items.map((i) => i.label)),
    );
  });

  it('has rows that are 44px tall', () => {
    renderAt('/');
    // The Add expense button above them is 48px (a medium button); the rows are nav links and buttons.
    const rows = [...sidebar().querySelectorAll<HTMLElement>('a, button')].filter(
      (el) => el.textContent !== 'Add expense',
    );
    expect(rows.length).toBeGreaterThanOrEqual(13);
    for (const el of rows) expect(el, el.textContent ?? '').toHaveClass('min-h-11');
  });

  it('opens Net worth as a sheet, and tags My numbers Soon, doing nothing', async () => {
    renderAt('/history', liveData());
    const myNumbers = within(sidebar()).getByRole('button', { name: /^My numbers/ });
    expect(myNumbers).toBeDisabled();
    expect(myNumbers).toHaveTextContent('Soon');
    expect(within(sidebar()).getAllByText('Soon')).toHaveLength(1);

    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Net worth' }));
    expect(screen.getByRole('dialog', { name: 'Net worth' })).toBeInTheDocument();
  });

  it('has no Buy it?, no About you and no Salary freeze', () => {
    renderAt('/');
    for (const gone of [/^Buy it/, /^About you/, /^Salary freeze/]) {
      expect(within(sidebar()).queryByRole('link', { name: gone })).not.toBeInTheDocument();
    }
  });

  it.each([
    ['/cards', 'Cards'],
    ['/profile', 'Profile'],
    ['/history', 'History'],
    ['/quests', 'Quests'],
  ])('marks %s as the current screen', (path, name) => {
    renderAt(path);
    expect(within(sidebar()).getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
  });
});

describe('menu items', () => {
  it('has the five tabs, Profile at the bottom right', () => {
    expect(TABS).toEqual([HOME, CARDS, SPENDING, INVEST, PROFILE]);
    expect(HOME).toEqual({ path: '/', label: 'Home', icon: House });
    expect(CARDS).toEqual({ path: '/cards', label: 'Cards', icon: CreditCard });
    expect(SPENDING).toEqual({ path: '/budget', label: 'Spending', icon: ChartPie });
    expect(INVEST).toEqual({ path: '/invest', label: 'Invest', icon: TrendingUp });
    expect(PROFILE).toEqual({ path: '/profile', label: 'Profile', icon: UserRound });
  });

  it('has the two groups: a page, a sheet or Soon for each row, with its icon', () => {
    expect(
      MENU_GROUPS.map((g) => [
        g.title,
        g.items.map(({ label, icon, path, sheet, soon }) => [
          label,
          icon,
          path ?? sheet ?? (soon && 'soon'),
        ]),
      ]),
    ).toEqual([
      [
        'Your money',
        [
          ['History', Clock, '/history'],
          ['Net worth', ChartColumn, 'net-worth'],
          ['My numbers', List, 'soon'],
        ],
      ],
      [
        'You',
        [
          ['Quests', Trophy, '/quests'],
          ['Shop', ShoppingBag, '/shop'],
          ['Inbox', Inbox, '/inbox'],
          ['Help', CircleQuestionMark, '/help'],
          ['Settings', Settings, '/settings'],
        ],
      ],
    ]);
  });

  it('gives each row a fixed chip colour that holds 3:1 against a white icon', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const v = parseInt(hex.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const { label, color } of MENU_GROUPS.flatMap((g) => g.items)) {
      expect(1.05 / (luminance(color) + 0.05), label).toBeGreaterThanOrEqual(3);
    }
  });
});
