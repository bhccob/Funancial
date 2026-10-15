import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { SalaryFreeze } from '@/domain/entities';
import { newId, nowIso } from '@/domain/ids';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { topDialog } from '@/lib/dialogStack';
import { formatDay } from '@/lib/format';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeGoal, makeLedgerEntry, makeProfile, makeSubscription } from '@/test/fixtures';
import { MENU_GROUPS } from './menu';
import { appRouteObjects } from './router';

const usd = (minor: number) => formatMoney(minor, 'USD');

function renderAt(path: string, data: DataSnapshot = emptySnapshot()) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: [path] });
  renderWithStore(<RouterProvider router={router} />, createStubStore({ data }));
  return router;
}

function freeze(start: string, end: string): SalaryFreeze {
  const now = nowIso();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    start,
    end,
    lostAmount: 0,
    mode: 'manual',
    note: '',
  };
}

/** Two active subscriptions ($15.99 a month and $120 a year), one cancelled, two goals, a freeze, 130 coins. */
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
  data.tables.salaryFreeze.push(freeze('2026-10-10', '2026-10-20'));
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

describe('bottom bar', () => {
  it('shows Home, Budget, Add expense, Quests and Menu in the bottom bar', () => {
    renderAt('/');
    const bar = screen.getByRole('navigation', { name: 'Primary' });

    const slots = [...bar.querySelectorAll('a, button')];
    expect(slots.map((s) => s.getAttribute('aria-label') ?? s.textContent)).toEqual([
      'Home',
      'Budget',
      'Add expense',
      'Quests',
      'Menu',
    ]);
    expect(within(bar).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(bar).getByRole('link', { name: 'Budget' })).toHaveAttribute('href', '/budget');
    expect(within(bar).getByRole('link', { name: 'Add expense' })).toHaveAttribute('href', '/add');
    expect(within(bar).getByRole('link', { name: 'Quests' })).toHaveAttribute('href', '/quests');
    expect(within(bar).getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });

  it('labels the round Add button "Add" like the other slots, inside its "Add expense" name', () => {
    renderAt('/');
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    const add = within(bar).getByRole('link', { name: 'Add expense' });
    // The visible text is "Add" and the plus is decoration, so the name keeps the label in it.
    expect(add.textContent).toBe('Add');
    expect(add.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull();
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

  it('opens Add from the bar on any screen', async () => {
    renderAt('/invest');
    const bar = screen.getByRole('navigation', { name: 'Primary' });
    await userEvent.click(within(bar).getByRole('link', { name: 'Add expense' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Expense' })).toBeChecked();
  });
});

describe('Menu sheet', () => {
  it('opens the Menu sheet with three groups and live subtitles', async () => {
    renderAt('/', liveData());
    const sheet = await openMenu();

    expect(
      within(sheet)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Your money', 'Coming next', 'You']);
    expect(
      within(sheet)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(MENU_GROUPS.flatMap((g) => g.items.map((i) => i.path)));

    expect(row(sheet, 'Subscriptions')).toHaveTextContent(`2 active · ${usd(25_99)}/mo`);
    expect(row(sheet, 'Goals')).toHaveTextContent('2 goals · 33% saved');
    expect(row(sheet, 'History')).toHaveTextContent('Every entry, searchable');
    expect(row(sheet, 'Salary freeze')).toHaveTextContent(
      `Active until ${formatDay('2026-10-20')}`,
    );
    expect(row(sheet, 'Invest')).toHaveTextContent('Stocks and ETFs');
    expect(row(sheet, 'Buy it\\?')).toHaveTextContent('Ask before you spend');
    expect(row(sheet, 'Dividends')).toHaveTextContent('Passive income');
    expect(row(sheet, 'News')).toHaveTextContent('For what you hold');
    expect(row(sheet, 'Shop')).toHaveTextContent('130 coins to spend');
    expect(row(sheet, 'Inbox')).toHaveTextContent('Your notices');
    expect(row(sheet, 'Help')).toHaveTextContent('How everything works');
    expect(row(sheet, 'Settings')).toHaveTextContent('Lock, backups, reminders');
  });

  it('says so when there is nothing yet', async () => {
    renderAt('/');
    const sheet = await openMenu();
    expect(row(sheet, 'Subscriptions')).toHaveTextContent('None yet');
    expect(row(sheet, 'Goals')).toHaveTextContent('None yet');
    expect(row(sheet, 'Salary freeze')).toHaveTextContent('None right now');
    expect(row(sheet, 'Shop')).toHaveTextContent('0 coins to spend');
  });

  it('ignores a freeze that is over or has not started', async () => {
    const data = emptySnapshot();
    data.tables.salaryFreeze.push(
      freeze('2026-09-01', '2026-09-30'),
      freeze('2026-11-01', '2026-11-30'),
    );
    renderAt('/', data);
    const sheet = await openMenu();
    expect(row(sheet, 'Salary freeze')).toHaveTextContent('None right now');
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

  it('marks soon items', async () => {
    renderAt('/');
    const sheet = await openMenu();
    expect(row(sheet, 'Invest')).toHaveTextContent('Soon');
    expect(row(sheet, 'Inbox')).toHaveTextContent('Soon');
    expect(row(sheet, 'Subscriptions')).not.toHaveTextContent('Soon');
    expect(row(sheet, 'Settings')).not.toHaveTextContent('Soon');
    expect(within(sheet).getAllByText('Soon')).toHaveLength(
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
    expect(links.slice(1, 4).map((a) => a.textContent)).toEqual(['Home', 'Budget', 'Quests']);

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
    expect(within(sidebar).getByRole('link', { name: /^Dividends/ })).toHaveTextContent('Soon');
    expect(within(sidebar).getByRole('link', { name: /^Settings/ })).not.toHaveTextContent('Soon');
    expect(within(sidebar).getAllByText('Soon')).toHaveLength(6);
  });

  it('marks the current screen', () => {
    renderAt('/goals');
    const sidebar = screen.getByRole('navigation', { name: 'All sections' });
    expect(within(sidebar).getByRole('link', { name: 'Goals' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('menu items', () => {
  it('has the three groups in order, with a fixed chip colour that holds 3:1 against a white icon', () => {
    expect(MENU_GROUPS.map((g) => [g.title, g.items.length])).toEqual([
      ['Your money', 4],
      ['Coming next', 4],
      ['You', 4],
    ]);
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
