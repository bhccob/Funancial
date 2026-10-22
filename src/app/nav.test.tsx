import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartPie, CircleUser, CreditCard } from 'lucide-react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/domain/entities';
import { levelStart } from '@/domain/game/levels';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { INBOX_NOW, inboxData } from '@/test/inboxData';
import {
  makeAccount,
  makeDebt,
  makeDividend,
  makeGoal,
  makeIncome,
  makeLedgerEntry,
  makeProfile,
  makeSubscription,
} from '@/test/fixtures';
import { CARDS_TAB, HOME, INVEST, MENU_GROUPS, PROFILE, SPENDING_TAB, TABS } from './menu';
import { appRouteObjects } from './router';

const usd = (minor: number) => formatMoney(minor, 'USD');

function renderAt(path: string, data: DataSnapshot = emptySnapshot()) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: [path] });
  renderWithStore(<RouterProvider router={router} />, createStubStore({ data }));
  return router;
}

/** A credit card's account with `owed` on it. */
const card = (id: string, owed = 0, overrides: Partial<Account> = {}) =>
  makeAccount({
    id,
    name: id,
    kind: 'credit',
    skin: 'violet',
    inAvailable: false,
    openingBalance: owed,
    credit: {
      limit: null,
      statementDay: null,
      dueDay: 21,
      payInFull: true,
      minimumPayment: 0,
      interestRate: 0,
    },
    ...overrides,
  });

/** Two active subscriptions ($15.99 a month and $120 a year), one cancelled, two goals, 130 coins. */
function liveData(): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile({ currency: 'USD' }));
  data.tables.subscription.push(
    makeSubscription({ amount: 15_99, cycle: 'monthly' }),
    makeSubscription({ amount: 120_00, cycle: 'yearly' }),
    makeSubscription({ amount: 99_00, cycle: 'monthly', status: 'cancelled' }),
  );
  data.tables.goal.push(
    makeGoal({ target: 1_000_00, current: 250_00 }),
    makeGoal({ target: 500_00, current: 250_00 }),
  );
  data.tables.ledger.push(makeLedgerEntry({ coins: 130, xp: 0 }));
  return data;
}

/**
 * Profile's menu: the two groups of rows below its header, opened at /profile. The header has a
 * "Shop" pill of its own, and the sidebar beside the page lists the same rows, so the rows are
 * looked for in the groups' box alone.
 */
function openMenu(data?: DataSnapshot) {
  renderAt('/profile', data);
  return within(screen.getByRole('main'))
    .getByRole('heading', { level: 2, name: 'Your money' })
    .closest('section')!.parentElement!;
}

/** The row's text, e.g. "Goals2 goals · 33% saved". */
const row = (menu: HTMLElement, label: string) =>
  within(menu).getByRole('link', { name: new RegExp(`^${label}`) });

describe('sidebar', () => {
  it('has links that are 44px tall', () => {
    renderAt('/');
    const sidebar = screen.getByRole('navigation', { name: 'All sections' });
    // The Add expense button above them is 48px (a medium button); the rows are nav links.
    const rows = within(sidebar)
      .getAllByRole('link')
      .filter((link) => link.textContent !== 'Add expense');
    expect(rows.length).toBeGreaterThan(10);
    for (const link of rows) expect(link, link.textContent ?? '').toHaveClass('min-h-11');
  });
});

describe('Profile menu rows', () => {
  it('lists two groups with what is inside each', () => {
    const menu = openMenu(liveData());

    expect(
      within(menu)
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(['Your money', 'You']);
    expect(
      within(menu)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(MENU_GROUPS.flatMap((g) => g.items.map((i) => i.path)));

    expect(row(menu, 'Bills & cards')).toHaveTextContent(`2 active · ${usd(25_99)}/mo`);
    expect(row(menu, 'Goals')).toHaveTextContent('2 goals · 33% saved');
    expect(row(menu, 'History')).toHaveTextContent('Every entry, searchable');
    expect(row(menu, 'Quests')).toHaveTextContent('Level 1');
    expect(row(menu, 'Shop')).toHaveTextContent('130 coins to spend');
    expect(row(menu, 'Inbox')).toHaveTextContent(/^Inbox$/);
    expect(row(menu, 'Help')).toHaveTextContent('How everything works');
    expect(row(menu, 'Settings')).toHaveTextContent('Lock, account, reminders');
  });

  it('puts Quests first in the You group, with the level', () => {
    const menu = openMenu();
    const you = within(menu).getByRole('heading', { level: 2, name: 'You' }).parentElement!;
    const first = within(you).getAllByRole('link')[0]!;
    expect(first).toHaveAttribute('href', '/quests');
    expect(first).toHaveTextContent('Level 1');
  });

  it('has no Invest, Dividends or News rows', () => {
    const menu = openMenu();
    for (const label of ['Invest', 'Dividends', 'News']) {
      expect(within(menu).queryByRole('link', { name: new RegExp(`^${label}`) })).toBeNull();
    }
  });

  it('adds the number of credit cards to the Bills & cards row, when there are any', () => {
    const data = liveData();
    data.tables.account.push(card('visa'), card('amex'));
    data.tables.debt.push(makeDebt({ kind: 'loan' }));
    expect(row(openMenu(data), 'Bills & cards')).toHaveTextContent(
      `2 active · ${usd(25_99)}/mo · 2 cards`,
    );
    cleanup();

    const oneCard = emptySnapshot();
    oneCard.tables.account.push(card('visa'));
    expect(row(openMenu(oneCard), 'Bills & cards')).toHaveTextContent(/^Bills & cards1 card$/);
  });

  describe('Debts row', () => {
    afterEach(() => useAmountsHidden.setState({ hidden: false }));

    const owing = () => {
      const data = emptySnapshot();
      data.tables.profile.push(makeProfile({ currency: 'USD' }));
      data.tables.account.push(card('visa', 230_00));
      data.tables.debt.push(makeDebt({ kind: 'loan', openingBalance: 1_000_00 }));
      return data;
    };

    it('says how many cards and loans there are, and what they come to', () => {
      const menu = openMenu(owing());
      expect(row(menu, 'Debts')).toHaveTextContent(`2 cards and loans · ${usd(1_230_00)}`);
      expect(row(menu, 'Debts')).toHaveAttribute('href', '/debts');
    });

    it('names the one card or loan there is', () => {
      const withCard = emptySnapshot();
      withCard.tables.account.push(card('visa', 230_00));
      expect(row(openMenu(withCard), 'Debts')).toHaveTextContent(`1 card · ${usd(230_00)}`);
      cleanup();

      const loan = emptySnapshot();
      loan.tables.debt.push(makeDebt({ kind: 'loan', openingBalance: 1_000_00 }));
      expect(row(openMenu(loan), 'Debts')).toHaveTextContent(`1 loan · ${usd(1_000_00)}`);
    });

    it('hides the total with the eye', () => {
      useAmountsHidden.setState({ hidden: true });
      expect(row(openMenu(owing()), 'Debts')).toHaveTextContent('2 cards and loans · ••••');
    });

    it('leaves archived cards out of the count, as the Debts page does', () => {
      const data = owing();
      data.tables.account.push(card('old', 90_00, { archivedOn: '2026-10-01' }));
      data.tables.debt.push(makeDebt({ kind: 'loan', archivedOn: '2026-10-01' }));
      const menu = openMenu(data);
      expect(row(menu, 'Debts')).toHaveTextContent(`2 cards and loans · ${usd(1_230_00)}`);
      expect(row(menu, 'Bills & cards')).toHaveTextContent(/^Bills & cards1 card$/);
    });
  });

  describe('Income row', () => {
    afterEach(() => useAmountsHidden.setState({ hidden: false }));

    const earning = () => {
      const data = emptySnapshot();
      data.tables.profile.push(makeProfile({ currency: 'USD' }));
      data.tables.income.push(
        makeIncome({ date: '2026-10-05', amount: 4_000_00 }),
        makeIncome({ date: '2026-09-25', amount: 9_000_00 }),
        // Not arrived: not income.
        makeIncome({ date: '2026-10-25', amount: 5_000_00, status: 'expected' }),
      );
      data.tables.dividend.push(
        makeDividend({ paidOn: '2026-10-03', expectedPayDate: '2026-10-03', amount: 13_00 }),
      );
      return data;
    };

    it('sits before History and says what came in this month', () => {
      const menu = openMenu(earning());
      expect(row(menu, 'Income')).toHaveTextContent(`${usd(4_013_00)} this month`);
      expect(row(menu, 'Income')).toHaveAttribute('href', '/income');
      const hrefs = within(menu)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'));
      expect(hrefs.indexOf('/income')).toBe(hrefs.indexOf('/history') - 1);
    });

    it('says $0 this month when nothing has come in', () => {
      expect(row(openMenu(), 'Income')).toHaveTextContent(`${usd(0)} this month`);
    });

    it('hides the amount with the eye', () => {
      useAmountsHidden.setState({ hidden: true });
      expect(row(openMenu(earning()), 'Income')).toHaveTextContent('•••• this month');
    });

    it('opens the Income page', async () => {
      await userEvent.click(row(openMenu(earning()), 'Income'));
      expect(screen.getByRole('heading', { level: 1, name: 'Income' })).toBeInTheDocument();
    });
  });

  it('shows the level the player has reached on the Quests row', () => {
    const data = emptySnapshot();
    data.tables.ledger.push(makeLedgerEntry({ coins: 0, xp: levelStart(3) }));
    expect(row(openMenu(data), 'Quests')).toHaveTextContent('Level 3');
  });

  it('says so when there is nothing yet', () => {
    const menu = openMenu();
    expect(row(menu, 'Bills & cards')).toHaveTextContent('None yet');
    expect(row(menu, 'Goals')).toHaveTextContent('None yet');
    expect(row(menu, 'Debts')).toHaveTextContent('None yet');
    expect(row(menu, 'Shop')).toHaveTextContent('0 coins to spend');
  });

  it('uses the singular for one goal and one coin', () => {
    const data = emptySnapshot();
    data.tables.goal.push(makeGoal({ target: 200_00, current: 50_00 }));
    data.tables.ledger.push(makeLedgerEntry({ coins: 1, xp: 0 }));
    const menu = openMenu(data);
    expect(row(menu, 'Goals')).toHaveTextContent('1 goal · 25% saved');
    expect(row(menu, 'Shop')).toHaveTextContent('1 coin to spend');
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

  it('marks soon items', () => {
    const menu = openMenu();
    expect(row(menu, 'Inbox')).not.toHaveTextContent('Soon');
    expect(row(menu, 'Help')).not.toHaveTextContent('Soon');
    expect(row(menu, 'Quests')).not.toHaveTextContent('Soon');
    expect(row(menu, 'Bills & cards')).not.toHaveTextContent('Soon');
    expect(row(menu, 'Settings')).not.toHaveTextContent('Soon');
    expect(within(menu).queryAllByText('Soon')).toHaveLength(
      MENU_GROUPS.flatMap((g) => g.items).filter((i) => i.soon).length,
    );
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

  it('has no Buy it?, no About you and no Salary freeze', () => {
    const menu = openMenu();
    const money = within(menu).getByRole('heading', {
      level: 2,
      name: 'Your money',
    }).parentElement!;
    expect(
      within(money)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/subscriptions', '/goals', '/debts', '/income', '/history']);
    const you = within(menu).getByRole('heading', { level: 2, name: 'You' }).parentElement!;
    expect(
      within(you)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
        .slice(0, 2),
    ).toEqual(['/quests', '/shop']);
    expect(within(menu).queryByRole('link', { name: /^Buy it/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: /^About you/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: /^Salary freeze/ })).not.toBeInTheDocument();
  });
});

describe('sidebar', () => {
  it('puts Add expense first in the sidebar, then the groups', () => {
    renderAt('/');
    const sidebar = screen.getByRole('navigation', { name: 'All sections' });

    const links = within(sidebar).getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('Add expense');
    expect(links[0]).toHaveAttribute('href', '/add');
    expect(links.slice(1, 4).map((a) => a.textContent)).toEqual(['Home', 'Budget', 'Invest']);

    expect(
      within(sidebar)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(MENU_GROUPS.map((g) => g.title));
    expect(links.slice(4).map((a) => a.getAttribute('href'))).toEqual(
      MENU_GROUPS.flatMap((g) => g.items.map((i) => i.path)),
    );
  });

  it('tags the soon items', () => {
    renderAt('/');
    const sidebar = screen.getByRole('navigation', { name: 'All sections' });
    expect(within(sidebar).queryByRole('link', { name: /^Buy it/ })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole('link', { name: /^About you/ })).not.toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: /^Settings/ })).not.toHaveTextContent('Soon');
    expect(within(sidebar).getByRole('link', { name: /^Help/ })).not.toHaveTextContent('Soon');
    expect(within(sidebar).getByRole('link', { name: /^Inbox/ })).not.toHaveTextContent('Soon');
    expect(within(sidebar).queryAllByText('Soon')).toHaveLength(
      MENU_GROUPS.flatMap((g) => g.items).filter((i) => i.soon).length,
    );
  });

  it.each([
    ['/goals', 'Goals'],
    ['/debts', 'Debts'],
    ['/income', 'Income'],
  ])('marks %s as the current screen', (path, name) => {
    renderAt(path);
    const sidebar = screen.getByRole('navigation', { name: 'All sections' });
    expect(within(sidebar).getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
  });
});

describe('menu items', () => {
  it('names the Profile page', () => {
    expect(PROFILE).toMatchObject({ path: '/profile', label: 'Profile' });
    expect(PROFILE.icon).toBe(CircleUser);
  });

  it('has the four tabs, Cards and Spending on the pages they open today', () => {
    expect(TABS).toEqual([HOME, CARDS_TAB, SPENDING_TAB, INVEST]);
    expect(CARDS_TAB).toEqual({ path: '/subscriptions', label: 'Cards', icon: CreditCard });
    expect(SPENDING_TAB).toEqual({ path: '/budget', label: 'Spending', icon: ChartPie });
  });

  it('has the two groups in order, with a fixed chip colour that holds 3:1 against a white icon', () => {
    expect(MENU_GROUPS.map((g) => [g.title, g.items.length])).toEqual([
      ['Your money', 5],
      ['You', 5],
    ]);
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const v = parseInt(hex.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const items = MENU_GROUPS.flatMap((g) => g.items);
    for (const { label, color } of items) {
      expect(1.05 / (luminance(color) + 0.05), label).toBeGreaterThanOrEqual(3);
    }
  });
});
