import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { levelStart } from '@/domain/game/levels';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { topDialog } from '@/lib/dialogStack';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { INBOX_NOW, inboxData } from '@/test/inboxData';
import {
  makeDebt,
  makeDividend,
  makeGoal,
  makeIncome,
  makeLedgerEntry,
  makeProfile,
  makeSubscription,
} from '@/test/fixtures';
import { makeSalaryFreeze } from '@/test/retiredFixtures';
import { MENU_GROUPS } from './menu';
import { appRouteObjects } from './router';

const usd = (minor: number) => formatMoney(minor, 'USD');

function renderAt(path: string, data: DataSnapshot = emptySnapshot()) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: [path] });
  renderWithStore(<RouterProvider router={router} />, createStubStore({ data }));
  return router;
}

/**
 * Two active subscriptions ($15.99 a month and $120 a year), one cancelled, two goals, 130 coins,
 * and a salary freeze an older build saved, which no row reads.
 */
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
  data.tables.salaryFreeze.push(makeSalaryFreeze({ start: '2026-10-10', end: '2026-10-20' }));
  data.tables.ledger.push(makeLedgerEntry({ coins: 130, xp: 0 }));
  return data;
}

async function openMenu() {
  const bar = screen.getByRole('navigation', { name: 'Primary' });
  await userEvent.click(within(bar).getByRole('button', { name: 'Menu' }));
  return screen.getByRole('dialog', { name: 'Menu' });
}

/** The row's text, e.g. "Goals2 goals · 33% saved". */
const row = (sheet: HTMLElement, label: string) =>
  within(sheet).getByRole('link', { name: new RegExp(`^${label}`) });

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

describe('bottom bar', () => {
  it('shows Home, Budget, Invest and Menu in the bar, and Quests first in the Menu', async () => {
    renderAt('/');
    const bar = screen.getByRole('navigation', { name: 'Primary' });

    const slots = [...bar.querySelectorAll('a, button')];
    expect(slots.map((s) => s.textContent)).toEqual(['Home', 'Budget', 'Invest', 'Menu']);
    expect(within(bar).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(bar).getByRole('link', { name: 'Budget' })).toHaveAttribute('href', '/budget');
    expect(within(bar).getByRole('link', { name: 'Invest' })).toHaveAttribute('href', '/invest');
    expect(within(bar).getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(within(bar).queryByRole('link', { name: /add|quests/i })).not.toBeInTheDocument();

    const sheet = await openMenu();
    const you = within(sheet).getByRole('heading', { level: 3, name: 'You' }).parentElement!;
    const first = within(you).getAllByRole('link')[0]!;
    expect(first).toHaveAttribute('href', '/quests');
    expect(first).toHaveTextContent('Level 1');
  });

  it('opens the Invest screen from the bar and marks it as the current one', async () => {
    renderAt('/');
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    await userEvent.click(within(bar).getByRole('link', { name: 'Invest' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Invest' })).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: 'Invest' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('marks the current screen and leaves the Menu sheet closed', () => {
    renderAt('/budget');
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(bar).getByRole('link', { name: 'Budget' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(bar).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('tells assistive tech whether the Menu sheet is open', async () => {
    renderAt('/');
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    const menu = within(bar).getByRole('button', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-haspopup', 'dialog');
    expect(menu).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{Escape}');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Menu sheet', () => {
  it('opens the Menu sheet with two groups and live subtitles', async () => {
    renderAt('/', liveData());
    const sheet = await openMenu();

    expect(
      within(sheet)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Your money', 'You']);
    expect(
      within(sheet)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(MENU_GROUPS.flatMap((g) => g.items.map((i) => i.path)));

    expect(row(sheet, 'Bills & cards')).toHaveTextContent(`2 active · ${usd(25_99)}/mo`);
    expect(row(sheet, 'Goals')).toHaveTextContent('2 goals · 33% saved');
    expect(row(sheet, 'History')).toHaveTextContent('Every entry, searchable');
    expect(row(sheet, 'Quests')).toHaveTextContent('Level 1');
    expect(row(sheet, 'Shop')).toHaveTextContent('130 coins to spend');
    expect(row(sheet, 'Inbox')).toHaveTextContent(/^Inbox$/);
    expect(row(sheet, 'Help')).toHaveTextContent('How everything works');
    expect(row(sheet, 'Settings')).toHaveTextContent('Lock, account, reminders');
  });

  it('moves the Invest, Dividends and News rows out of the Menu', async () => {
    renderAt('/');
    const sheet = await openMenu();
    for (const label of ['Invest', 'Dividends', 'News']) {
      expect(within(sheet).queryByRole('link', { name: new RegExp(`^${label}`) })).toBeNull();
    }
  });

  it('adds the number of credit cards to the Bills & cards row, when there are any', async () => {
    const data = liveData();
    data.tables.debt.push(
      makeDebt({ kind: 'credit_card' }),
      makeDebt({ kind: 'credit_card' }),
      makeDebt({ kind: 'loan' }),
    );
    renderAt('/', data);
    expect(row(await openMenu(), 'Bills & cards')).toHaveTextContent(
      `2 active · ${usd(25_99)}/mo · 2 cards`,
    );
    cleanup();

    const oneCard = emptySnapshot();
    oneCard.tables.debt.push(makeDebt({ kind: 'credit_card' }));
    renderAt('/', oneCard);
    expect(row(await openMenu(), 'Bills & cards')).toHaveTextContent(/^Bills & cards1 card$/);
  });

  describe('Debts row', () => {
    afterEach(() => useAmountsHidden.setState({ hidden: false }));

    const owing = () => {
      const data = emptySnapshot();
      data.tables.profile.push(makeProfile({ currency: 'USD' }));
      data.tables.debt.push(
        makeDebt({ kind: 'credit_card', openingBalance: 230_00 }),
        makeDebt({ kind: 'loan', openingBalance: 1_000_00 }),
      );
      return data;
    };

    it('says how many cards and loans there are, and what they come to', async () => {
      renderAt('/', owing());
      const sheet = await openMenu();
      expect(row(sheet, 'Debts')).toHaveTextContent(`2 cards and loans · ${usd(1_230_00)}`);
      expect(row(sheet, 'Debts')).toHaveAttribute('href', '/debts');
    });

    it('names the one card or loan there is', async () => {
      const card = emptySnapshot();
      card.tables.debt.push(makeDebt({ kind: 'credit_card', openingBalance: 230_00 }));
      renderAt('/', card);
      expect(row(await openMenu(), 'Debts')).toHaveTextContent(`1 card · ${usd(230_00)}`);
      cleanup();

      const loan = emptySnapshot();
      loan.tables.debt.push(makeDebt({ kind: 'loan', openingBalance: 1_000_00 }));
      renderAt('/', loan);
      expect(row(await openMenu(), 'Debts')).toHaveTextContent(`1 loan · ${usd(1_000_00)}`);
    });

    it('hides the total with the eye', async () => {
      useAmountsHidden.setState({ hidden: true });
      renderAt('/', owing());
      expect(row(await openMenu(), 'Debts')).toHaveTextContent('2 cards and loans · ••••');
    });

    it('leaves archived cards out of the count, as the Debts page does', async () => {
      const data = owing();
      data.tables.debt.push(makeDebt({ kind: 'credit_card', archivedOn: '2026-10-01' }));
      renderAt('/', data);
      const sheet = await openMenu();
      expect(row(sheet, 'Debts')).toHaveTextContent(`2 cards and loans · ${usd(1_230_00)}`);
      expect(row(sheet, 'Bills & cards')).toHaveTextContent(/^Bills & cards1 card$/);
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

    it('sits before History and says what came in this month', async () => {
      renderAt('/', earning());
      const sheet = await openMenu();
      expect(row(sheet, 'Income')).toHaveTextContent(`${usd(4_013_00)} this month`);
      expect(row(sheet, 'Income')).toHaveAttribute('href', '/income');
      const hrefs = within(sheet)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'));
      expect(hrefs.indexOf('/income')).toBe(hrefs.indexOf('/history') - 1);
    });

    it('says $0 this month when nothing has come in', async () => {
      renderAt('/');
      expect(row(await openMenu(), 'Income')).toHaveTextContent(`${usd(0)} this month`);
    });

    it('hides the amount with the eye', async () => {
      useAmountsHidden.setState({ hidden: true });
      renderAt('/', earning());
      expect(row(await openMenu(), 'Income')).toHaveTextContent('•••• this month');
    });

    it('opens the Income page and closes the sheet', async () => {
      renderAt('/', earning());
      await userEvent.click(row(await openMenu(), 'Income'));
      expect(screen.getByRole('heading', { level: 1, name: 'Income' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    });
  });

  it('shows the level the player has reached on the Quests row', async () => {
    const data = emptySnapshot();
    data.tables.ledger.push(makeLedgerEntry({ coins: 0, xp: levelStart(3) }));
    renderAt('/', data);
    const sheet = await openMenu();
    expect(row(sheet, 'Quests')).toHaveTextContent('Level 3');
  });

  it('says so when there is nothing yet', async () => {
    renderAt('/');
    const sheet = await openMenu();
    expect(row(sheet, 'Bills & cards')).toHaveTextContent('None yet');
    expect(row(sheet, 'Goals')).toHaveTextContent('None yet');
    expect(row(sheet, 'Debts')).toHaveTextContent('None yet');
    expect(row(sheet, 'Shop')).toHaveTextContent('0 coins to spend');
  });

  it('has no Salary freeze row, whatever an older build saved', async () => {
    const data = emptySnapshot();
    data.tables.salaryFreeze.push(makeSalaryFreeze({ start: '2026-10-10', end: '2026-10-20' }));
    renderAt('/', data);
    const sheet = await openMenu();
    expect(within(sheet).queryByRole('link', { name: /^Salary freeze/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: /freeze/i })).not.toBeInTheDocument();
  });

  it('uses the singular for one goal and one coin', async () => {
    const data = emptySnapshot();
    data.tables.goal.push(makeGoal({ target: 200_00, current: 50_00 }));
    data.tables.ledger.push(makeLedgerEntry({ coins: 1, xp: 0 }));
    renderAt('/', data);
    const sheet = await openMenu();
    expect(row(sheet, 'Goals')).toHaveTextContent('1 goal · 25% saved');
    expect(row(sheet, 'Shop')).toHaveTextContent('1 coin to spend');
  });

  it('never shows a negative coin balance', async () => {
    const data = emptySnapshot();
    data.tables.ledger.push(
      makeLedgerEntry({ key: 'bought', kind: 'purchase', coins: -40, xp: 0 }),
      makeLedgerEntry({ key: 'earned', coins: 15, xp: 0 }),
    );
    renderAt('/', data);
    const sheet = await openMenu();
    expect(row(sheet, 'Shop')).toHaveTextContent('0 coins to spend');
  });

  describe('Inbox row', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: INBOX_NOW }));
    afterEach(() => vi.useRealTimers());

    it('says how many reminders are new', async () => {
      renderAt('/', inboxData({ readBefore: null, read: ['week:2026-10-11'] }));
      const sheet = await openMenu();
      expect(row(sheet, 'Inbox')).toHaveTextContent('Inbox6 new');
    });

    it('says nothing when there are none, whether none came due or all were read', async () => {
      renderAt('/');
      const sheet = await openMenu();
      expect(row(sheet, 'Inbox')).toHaveTextContent(/^Inbox$/);
      cleanup();

      renderAt('/', inboxData({ readBefore: '2026-10-14T09:00:00.000Z', read: [] }));
      expect(row(await openMenu(), 'Inbox')).toHaveTextContent(/^Inbox$/);
    });
  });

  it('marks soon items', async () => {
    renderAt('/');
    const sheet = await openMenu();
    expect(row(sheet, 'Inbox')).not.toHaveTextContent('Soon');
    expect(row(sheet, 'Help')).not.toHaveTextContent('Soon');
    expect(row(sheet, 'Quests')).not.toHaveTextContent('Soon');
    expect(row(sheet, 'Bills & cards')).not.toHaveTextContent('Soon');
    expect(row(sheet, 'Settings')).not.toHaveTextContent('Soon');
    expect(within(sheet).queryAllByText('Soon')).toHaveLength(
      MENU_GROUPS.flatMap((g) => g.items).filter((i) => i.soon).length,
    );
  });

  it('navigates from a row and closes the sheet', async () => {
    renderAt('/');
    const sheet = await openMenu();
    await userEvent.click(row(sheet, 'Settings'));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('opens Help from the Menu, with its pages listed', async () => {
    renderAt('/');
    const sheet = await openMenu();
    await userEvent.click(row(sheet, 'Help'));
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search help' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Available to spend/ })).toHaveAttribute(
      'href',
      '/help/available',
    );
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('has no Buy it?, no About you and no Salary freeze', async () => {
    renderAt('/');
    const sheet = await openMenu();
    const money = within(sheet).getByRole('heading', {
      level: 3,
      name: 'Your money',
    }).parentElement!;
    expect(
      within(money)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/subscriptions', '/goals', '/debts', '/income', '/history']);
    const you = within(sheet).getByRole('heading', { level: 3, name: 'You' }).parentElement!;
    expect(
      within(you)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
        .slice(0, 2),
    ).toEqual(['/quests', '/shop']);
    expect(within(sheet).queryByRole('link', { name: /^Buy it/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: /^About you/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: /^Salary freeze/ })).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    renderAt('/');
    await openMenu();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
  });

  it('closes on the dialog cancel event (Android back)', async () => {
    renderAt('/');
    const sheet = await openMenu();
    // The back gesture finds the sheet through the dialog stack and asks it to cancel.
    expect(topDialog()).toBe(sheet);
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(sheet, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    expect(topDialog()).toBeNull();
  });

  it('closes when the dimmed page behind it is tapped, but not when the sheet is', async () => {
    renderAt('/');
    const sheet = await openMenu();
    await userEvent.click(within(sheet).getByRole('heading', { level: 3, name: 'You' }));
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument();
    // A tap on the backdrop is delivered to the dialog element itself.
    await userEvent.click(sheet);
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('opens again after it was closed', async () => {
    renderAt('/');
    await openMenu();
    await userEvent.keyboard('{Escape}');
    expect(await openMenu()).toBeInTheDocument();
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
