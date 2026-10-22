import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { MENU_GROUPS } from '@/app/menu';
import { appRouteObjects } from '@/app/router';
import { BADGES } from '@/domain/game/badges';
import { levelStart } from '@/domain/game/levels';
import { purchaseEntry } from '@/domain/game/shop';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import {
  localIso,
  makeCheckIn,
  makeLedgerEntry,
  makeLegacyPurchase,
  makeProfile,
  makeSettings,
} from '@/test/fixtures';

/** The whole app at /profile, as nav.test does, so a row can be followed to its page. */
function renderProfile(
  data: DataSnapshot = emptySnapshot(),
  overrides: Parameters<typeof createStubStore>[0] = {},
) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: ['/profile'] });
  renderWithStore(<RouterProvider router={router} />, createStubStore({ data, ...overrides }));
  return router;
}

/** The page itself: the sidebar beside it also has headings and links. */
const page = () => within(screen.getByRole('main'));
/** The theme's block: the menu rows and the stats below it say "Level 2" and "coins" too. */
const blockOf = () =>
  page()
    .getByRole('heading', { level: 1, name: 'Profile' })
    .closest<HTMLElement>('[data-head-block]')!;
const header = () => within(blockOf());
/** The stats card under the block: streak, badges and coins. */
const stats = () => page().getByRole('list', { name: 'Your game' });

/** 250 XP is 150 into the 264 of level 2; 400 coins earned and 280 spent on an avatar and a frame. */
function levelTwo(): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile({ name: 'Sam' }));
  data.tables.ledger = [
    makeLedgerEntry({ key: 'seed', xp: 250, coins: 400 }),
    purchaseEntry('avatar-rocket', 'p1', localIso('2026-10-01')),
    makeLegacyPurchase('frame-gold', 200, 'p2'),
  ];
  data.tables.settings = [
    makeSettings({
      cosmetics: { theme: 'theme-violet', avatar: 'avatar-rocket', frame: 'frame-gold' },
    }),
  ];
  return data;
}

/** A player who has just reached `level`, with no coins and no purchases. */
function atLevel(level: number): DataSnapshot {
  const data = emptySnapshot();
  data.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: levelStart(level), coins: 0 })];
  return data;
}

describe('Profile screen: the block', () => {
  it("is the Profile page, with the theme's block first and its title inside it", () => {
    renderProfile();
    const title = page().getByRole('heading', { level: 1, name: 'Profile' });
    const block = title.closest('[data-head-block]');
    expect(block).toBeInTheDocument();
    // Nothing before it but the shell's banner box, so the block can reach the top edge.
    expect(block?.parentElement?.previousElementSibling).toHaveAttribute('data-shell-banners');
    // The wireframe draws no title there, so it is for a screen reader alone.
    expect(title).toHaveClass('sr-only');
  });

  it('has a glass gear at the top right of the block that opens Settings', async () => {
    const router = renderProfile();
    const gear = header().getByRole('link', { name: 'Settings' });
    expect(gear).toHaveAttribute('href', '/settings');
    expect(gear).toHaveClass('glass-head', 'size-11', 'rounded-full');
    await userEvent.click(gear);
    expect(router.state.location.pathname).toBe('/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('shows the name over the tier, in the block', () => {
    renderProfile(levelTwo());
    expect(header().getByText('Sam')).toBeInTheDocument();
    expect(header().getByText('Bronze Saver')).toBeInTheDocument();
  });

  it('calls someone with no name You', () => {
    const data = emptySnapshot();
    data.tables.profile.push(makeProfile({ name: '' }));
    renderProfile(data);
    expect(header().getByText('You')).toBeInTheDocument();
  });

  it('shows the worn avatar, 92px, in the border it wears', () => {
    renderProfile(levelTwo());
    const avatar = blockOf().querySelector<HTMLElement>('svg.lucide-rocket');
    expect(avatar).toBeInTheDocument();
    const chip = avatar!.parentElement!;
    expect(chip).toHaveClass('ring-[#d4a017]');
    expect(chip).toHaveStyle({ width: '92px', height: '92px' });
    // On the block it is the theme's avatar chip, not the page's light one.
    expect(chip).toHaveClass('bg-(--av)', 'text-(--av-ink)');
    expect(chip).not.toHaveClass('bg-surface-2');
  });

  it('wears no ring at level 1, where no border is unlocked', () => {
    renderProfile();
    const chip = blockOf().querySelector<HTMLElement>('svg.lucide-sprout')!.parentElement!;
    expect(chip.className).not.toMatch(/\bring-/);
  });

  it('puts a Lv badge on the avatar, in the block button, that opens the border sheet', async () => {
    renderProfile(levelTwo());
    const open = header().getByRole('button', { name: 'Level 2, choose your border' });
    const badge = within(open).getByText('Lv 2');
    expect(badge).toHaveClass('btn-head');
    expect(open.querySelector('svg.lucide-rocket')).toBeInTheDocument();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(open);
    expect(screen.getByRole('dialog', { name: 'Your border' })).toBeInTheDocument();
  });

  it('shows the way to the next level on a glass track and in words under it', () => {
    renderProfile(levelTwo());
    const bar = page().getByRole('progressbar', { name: 'Level progress' });
    expect(bar).toHaveAttribute('aria-valuetext', '150 of 264 XP');
    expect(bar).toHaveAttribute('aria-valuenow', '150');
    expect(bar).toHaveAttribute('aria-valuemax', '264');
    expect(bar.firstElementChild).toHaveStyle({ width: `${(150 / 264) * 100}%` });
    expect(header().getByText('150 / 264 XP')).toBeInTheDocument();
    expect(header().getByText('114 to level 3')).toBeInTheDocument();
    // On the block the track is the theme's glass and the fill the block's XP color.
    expect(bar).toHaveClass('glass-head');
    expect(bar).not.toHaveClass('bg-track');
    expect(bar.firstElementChild).toHaveClass('bg-hero-xp');
    expect(bar.firstElementChild).not.toHaveClass('bg-xp');
  });

  it('level progress at level 1 and at the top level', () => {
    renderProfile();
    let bar = page().getByRole('progressbar', { name: 'Level progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '0 of 100 XP');
    expect(bar.firstElementChild).toHaveStyle({ width: '0%' });
    expect(header().getByText('0 / 100 XP')).toBeInTheDocument();
    expect(header().getByText('100 to level 2')).toBeInTheDocument();
    expect(header().getByRole('button', { name: /^Level 1,/ })).toHaveTextContent('Lv 1');
    cleanup();

    const top = emptySnapshot();
    top.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: levelStart(50) + 10, coins: 0 })];
    renderProfile(top);
    bar = page().getByRole('progressbar', { name: 'Level progress' });
    expect(header().getByText('Max level')).toBeInTheDocument();
    expect(header().queryByText(/ XP$/)).not.toBeInTheDocument();
    expect(header().queryByText(/to level/)).not.toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-valuetext', 'Max level');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '1');
    expect(bar.firstElementChild).toHaveStyle({ width: '100%' });
    expect(header().getByRole('button', { name: /^Level 50,/ })).toHaveTextContent('Lv 50');
  });
});

describe('Profile screen: the stats card', () => {
  it('hangs over the block on thick glass, with the streak, badges and coins', () => {
    const data = levelTwo();
    data.tables.checkIn = [
      makeCheckIn({ kind: 'no-spend', date: '2026-10-14' }),
      makeCheckIn({ kind: 'no-spend', date: '2026-10-13' }),
    ];
    data.tables.ledger.push(makeLedgerEntry({ key: 'badge:first-expense', xp: 50, coins: 10 }));
    renderProfile(data);

    expect(stats()).toHaveClass('glass-strong', 'text-text');
    // Beside the block, not in it: it hangs over its edge.
    expect(blockOf()).not.toContainElement(stats());
    const cells = within(stats()).getAllByRole('listitem');
    // Coins: 400 + 10 earned, less 80 for the avatar and 200 for the frame.
    expect(cells.map((c) => c.textContent)).toEqual([
      '2day streak',
      `1/${BADGES.length}badges`,
      '130coins',
    ]);
  });

  it('starts at no streak, no badges and the coins there are', () => {
    renderProfile();
    expect(
      within(stats())
        .getAllByRole('listitem')
        .map((c) => c.textContent),
    ).toEqual(['0day streak', `0/${BADGES.length}badges`, '0coins']);
  });

  it('never shows less than 0 coins', () => {
    const data = emptySnapshot();
    data.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: 0, coins: -30 })];
    renderProfile(data);
    expect(within(stats()).getByText('coins').previousElementSibling).toHaveTextContent('0');
  });
});

describe('Profile screen: the badges row', () => {
  const badges = () => page().getByRole('list', { name: 'Badges' });

  it('shows five, the earned ones first, and a link to all of them on Quests', () => {
    const data = emptySnapshot();
    // The last badge of the catalogue, earned: it comes before the four the catalogue starts with.
    const last = BADGES.at(-1)!;
    data.tables.ledger = [makeLedgerEntry({ key: `badge:${last.id}`, xp: 50, coins: 10 })];
    renderProfile(data);

    const items = within(badges()).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent(last.name);
    expect(items[0]).not.toHaveTextContent('not earned yet');
    expect(items[0]).toHaveClass('text-accent');
    expect(items[1]).toHaveTextContent(`${BADGES[0]!.name} (not earned yet)`);
    expect(items[1]).toHaveClass('text-muted');
    for (const item of items) expect(item).toHaveClass('glass', 'size-[50px]', 'rounded-full');

    const all = page().getByRole('link', { name: 'All badges' });
    expect(all).toHaveAttribute('href', '/quests');
    expect(all).toHaveTextContent('All');
  });

  it('shows five of the catalogue when none is earned yet', () => {
    renderProfile();
    expect(
      within(badges())
        .getAllByRole('listitem')
        .map((i) => i.textContent),
    ).toEqual(BADGES.slice(0, 5).map((b) => `${b.name} (not earned yet)`));
  });
});

describe('Profile screen: the menus', () => {
  it('lists both groups, each row a link to its page, a button for its sheet, or Soon', () => {
    renderProfile();
    expect(
      page()
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(['Badges', ...MENU_GROUPS.map((g) => g.title)]);
    for (const { title, items } of MENU_GROUPS) {
      const group = page().getByRole('heading', { level: 2, name: title }).parentElement!;
      expect(
        [...group.querySelectorAll<HTMLElement>('a, button')].map((el) =>
          el.tagName === 'A' ? el.getAttribute('href') : el.matches(':disabled') ? 'soon' : 'sheet',
        ),
      ).toEqual(items.map((i) => i.path ?? (i.soon ? 'soon' : 'sheet')));
    }
  });

  it('draws them as plain rows with hairlines: no box round a group', () => {
    renderProfile();
    for (const { title, items } of MENU_GROUPS) {
      const group = page().getByRole('heading', { level: 2, name: title }).parentElement!;
      const rows = group.querySelector('ul')!;
      expect(rows).toHaveClass('divide-y', 'divide-black/7');
      expect(rows.className).not.toMatch(/\b(bg-|border|shadow|rounded)/);
      expect(rows.children).toHaveLength(items.length);
    }
  });

  it('gives each row a glass icon chip, its name and a chevron; Soon takes the chevron', () => {
    renderProfile();
    const history = page().getByRole('link', { name: 'History' });
    expect(history.querySelector('.glass.rounded-full svg.lucide-clock')).toBeInTheDocument();
    expect(history.querySelector('svg.lucide-chevron-right')).toBeInTheDocument();
    const myNumbers = page().getByRole('button', { name: /^My numbers/ });
    expect(myNumbers).toBeDisabled();
    expect(myNumbers).toHaveTextContent('Soon');
    expect(myNumbers.querySelector('svg.lucide-chevron-right')).not.toBeInTheDocument();
    expect(page().getAllByText('Soon')).toHaveLength(1);
  });

  it('opens a row on its page', async () => {
    const router = renderProfile();
    const you = page().getByRole('heading', { level: 2, name: 'You' }).parentElement!;
    await userEvent.click(within(you).getByRole('link', { name: /^Settings/ }));
    expect(router.state.location.pathname).toBe('/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('says where the pages that moved went', () => {
    renderProfile();
    expect(
      page().getByText(
        'Goals are in the Spending tab · Income opens from Home · Bills & cards and Loans are on the Cards tab.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Profile screen: the order', () => {
  it('runs from the block to the stats, the badges, the two menus and the note', () => {
    renderProfile();
    const heading = (name: string) => page().getByRole('heading', { level: 2, name });
    const note = page().getByText(/^Goals are in the Spending tab/);
    const sequence = [
      blockOf(),
      stats(),
      heading('Badges'),
      heading('Your money'),
      heading('You'),
      note,
    ];
    sequence.slice(1).forEach((node, i) => {
      expect(
        sequence[i]!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${i}`,
      ).toBeTruthy();
    });
  });

  it('brings each part in after the block, one beat apart', () => {
    renderProfile();
    const block = blockOf();
    const rises = [
      ...screen.getByRole('main').querySelectorAll<HTMLElement>('.motion-safe\\:animate-rise'),
    ];
    expect(rises.length).toBeGreaterThanOrEqual(5);
    const delays = rises.map((r) => parseInt(r.style.animationDelay, 10));
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(delays.length);
    for (const rise of rises.slice(1)) {
      expect(block.compareDocumentPosition(rise) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

describe('Profile screen: the border sheet', () => {
  const openSheet = async (level: number) =>
    userEvent.click(header().getByRole('button', { name: `Level ${level}, choose your border` }));
  const sheet = () => screen.getByRole('dialog', { name: 'Your border' });
  const option = (name: string) =>
    within(sheet()).getByRole('button', { name: new RegExp(`^${name}`) });

  it('offers none and the six borders, in order, and no legacy frame nobody bought', async () => {
    renderProfile(atLevel(12));
    await openSheet(12);
    expect(
      within(sheet())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'None',
      'Bronze',
      'Silver',
      'GoldLevel 21',
      'PlatinumLevel 31',
      'DiamondLevel 41',
      'PrismLevel 50',
    ]);
  });

  it('greys a border the level has not reached, with the level it needs', async () => {
    renderProfile(atLevel(12));
    await openSheet(12);
    const gold = option('Gold');
    expect(gold).toBeDisabled();
    expect(gold).toHaveTextContent('Level 21');
    expect(gold.querySelector('[data-preview]')).toHaveClass('opacity-45');
    // Bronze and Silver are open.
    expect(option('Bronze')).toBeEnabled();
    expect(option('Silver')).toBeEnabled();
    expect(option('Silver')).not.toHaveTextContent('Level');
  });

  it('draws each border on a sample avatar', async () => {
    renderProfile(atLevel(50));
    await openSheet(50);
    const ring = (name: string) =>
      option(name).querySelector<HTMLElement>('[data-preview] > span')!.className;
    expect(ring('Bronze')).toMatch(/ring-\[#b0703c\]/);
    expect(ring('Gold')).toMatch(/ring-\[#d4a017\]/);
    expect(ring('Prism')).toMatch(/\bframe-prism\b/);
    expect(ring('None')).not.toMatch(/\bring/);
  });

  it('marks the one worn', async () => {
    const data = atLevel(12);
    data.tables.settings = [
      makeSettings({
        cosmetics: { theme: 'theme-mono', avatar: 'avatar-sprout', frame: 'frame-silver' },
      }),
    ];
    renderProfile(data);
    await openSheet(12);
    expect(option('Silver')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Silver').querySelector('svg.lucide-check')).toBeInTheDocument();
    expect(option('None')).toHaveAttribute('aria-pressed', 'false');
    expect(option('Bronze')).toHaveAttribute('aria-pressed', 'false');
  });

  it('wears Silver when it is picked at level 11, and closes', async () => {
    const put = vi.fn(async () => {});
    renderProfile(atLevel(11), { put });
    await openSheet(11);
    await userEvent.click(option('Silver'));

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({
        cosmetics: { theme: 'theme-mono', avatar: 'avatar-sprout', frame: 'frame-silver' },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('takes the border off with None', async () => {
    const data = atLevel(12);
    data.tables.settings = [
      makeSettings({
        cosmetics: { theme: 'theme-mono', avatar: 'avatar-sprout', frame: 'frame-silver' },
      }),
    ];
    const put = vi.fn(async () => {});
    renderProfile(data, { put });
    await openSheet(12);
    await userEvent.click(option('None'));
    expect(put).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({ cosmetics: expect.objectContaining({ frame: 'frame-none' }) }),
    );
  });

  it('keeps Gold shut at level 12: nothing is saved', async () => {
    const put = vi.fn(async () => {});
    renderProfile(atLevel(12), { put });
    await openSheet(12);
    await userEvent.click(option('Gold'));
    expect(put).not.toHaveBeenCalled();
    expect(sheet()).toBeInTheDocument();
  });

  it('keeps a border bought in 0.11 open at level 1, and shows the Game color frame only when bought', async () => {
    const data = emptySnapshot();
    data.tables.ledger = [
      makeLedgerEntry({ key: 'seed', xp: 0, coins: 500 }),
      makeLegacyPurchase('frame-gold', 200),
      makeLegacyPurchase('frame-game', 100, 'p2'),
    ];
    renderProfile(data);
    await openSheet(1);
    expect(option('Gold')).toBeEnabled();
    expect(option('Gold')).not.toHaveTextContent('Level');
    expect(option('Silver')).toBeDisabled();
    const names = within(sheet())
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names.at(-1)).toBe('Game color');
    expect(option('Game color')).toBeEnabled();
  });

  it('closes without a change on Escape', async () => {
    const put = vi.fn(async () => {});
    renderProfile(atLevel(12), { put });
    await openSheet(12);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });
});
