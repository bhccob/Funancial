import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { MENU_GROUPS } from '@/app/menu';
import { appRouteObjects } from '@/app/router';
import { levelStart } from '@/domain/game/levels';
import { purchaseEntry } from '@/domain/game/shop';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import {
  localIso,
  makeLedgerEntry,
  makeLegacyPurchase,
  makeProfile,
  makeSettings,
} from '@/test/fixtures';

/** The whole app at /profile, as nav.test does, so a row can be followed to its page. */
function renderProfile(data: DataSnapshot = emptySnapshot()) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: ['/profile'] });
  renderWithStore(<RouterProvider router={router} />, createStubStore({ data }));
  return router;
}

/** The page itself: the sidebar beside it also has headings and links. */
const page = () => within(screen.getByRole('main'));
/** The theme's block: the menu rows below it say "Level 2" and "120 coins to spend" too. */
const header = () =>
  within(
    page()
      .getByRole('heading', { level: 1, name: 'Profile' })
      .closest<HTMLElement>('[data-head-block]')!,
  );

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

describe('Profile screen', () => {
  it("is the Profile page, with the theme's block first and its title inside it", () => {
    renderProfile();
    const title = page().getByRole('heading', { level: 1, name: 'Profile' });
    const header = title.closest('[data-head-block]');
    expect(header).toBeInTheDocument();
    // Nothing before it but the shell's banner box, so the block can reach the top edge.
    expect(header?.parentElement?.previousElementSibling).toHaveAttribute('data-shell-banners');
  });

  it('lists both groups, each row a link to its page, a button for its sheet, or Soon', () => {
    renderProfile();
    expect(
      page()
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(MENU_GROUPS.map((g) => g.title));
    for (const { title, items } of MENU_GROUPS) {
      const group = page().getByRole('heading', { level: 2, name: title }).parentElement!;
      expect(
        [...group.querySelectorAll<HTMLElement>('a, button')].map((el) =>
          el.tagName === 'A' ? el.getAttribute('href') : el.matches(':disabled') ? 'soon' : 'sheet',
        ),
      ).toEqual(items.map((i) => i.path ?? (i.soon ? 'soon' : 'sheet')));
    }
  });

  it('opens a row on its page', async () => {
    const router = renderProfile();
    await userEvent.click(page().getByRole('link', { name: /^Settings/ }));
    expect(router.state.location.pathname).toBe('/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('shows the name over the tier, and the worn avatar in its frame', () => {
    renderProfile(levelTwo());
    expect(header().getByText('Sam')).toBeInTheDocument();
    expect(header().getByText('Bronze Saver')).toBeInTheDocument();
    const avatar = document.body.querySelector<HTMLElement>('[data-head-block] svg.lucide-rocket');
    expect(avatar).toBeInTheDocument();
    const chip = avatar!.parentElement!;
    expect(chip).toHaveClass('ring-[#d4a017]');
    expect(chip).toHaveStyle({ width: '64px', height: '64px' });
    // On the dark header it is a glass chip, not the page's light one.
    expect(chip).toHaveClass('bg-white/15');
    expect(chip).not.toHaveClass('bg-surface-2');
  });

  it('calls someone with no name You', () => {
    const data = emptySnapshot();
    data.tables.profile.push(makeProfile({ name: '' }));
    renderProfile(data);
    expect(header().getByText('You')).toBeInTheDocument();
  });

  it('shows the level and the coins, and links the Shop', () => {
    renderProfile(levelTwo());
    // Level 2, and 120 coins left: a pill each, with the coins plain text.
    expect(header().getByText('Level 2')).toBeInTheDocument();
    expect(header().queryByRole('link', { name: 'Level 2' })).not.toBeInTheDocument();
    expect(header().getByText('120 coins').closest('a, button')).toBeNull();
    expect(header().getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop');
  });

  it('says 1 coin for one', () => {
    const data = emptySnapshot();
    data.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: 0, coins: 1 })];
    renderProfile(data);
    expect(header().getByText('1 coin')).toBeInTheDocument();
  });

  it('shows the way to the next level on a bar and in words', () => {
    renderProfile(levelTwo());
    const bar = page().getByRole('progressbar', { name: 'Level progress' });
    expect(bar).toHaveAttribute('aria-valuetext', '150 of 264 XP');
    expect(bar).toHaveAttribute('aria-valuenow', '150');
    expect(bar).toHaveAttribute('aria-valuemax', '264');
    expect(bar.firstElementChild).toHaveStyle({ width: `${(150 / 264) * 100}%` });
    expect(header().getByText('150 / 264 XP')).toBeInTheDocument();
    // Over the dark header the track is glass, not the page's.
    expect(bar).toHaveClass('bg-white/15');
    expect(bar).not.toHaveClass('bg-track');
    // And the fill is the header's white: the XP color of a light theme is too faint on the glass.
    expect(bar.firstElementChild).toHaveClass('bg-hero-text');
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
    expect(header().getByText('Level 1')).toBeInTheDocument();
    cleanup();

    const top = emptySnapshot();
    top.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: levelStart(50) + 10, coins: 0 })];
    renderProfile(top);
    bar = page().getByRole('progressbar', { name: 'Level progress' });
    expect(header().getByText('Max level')).toBeInTheDocument();
    expect(header().queryByText(/ XP$/)).not.toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-valuetext', 'Max level');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '1');
    expect(bar.firstElementChild).toHaveStyle({ width: '100%' });
    expect(header().getByText('Level 50')).toBeInTheDocument();
  });

  it('brings each group of rows in after the header, one beat apart', () => {
    renderProfile();
    const top = page()
      .getByRole('heading', { level: 1, name: 'Profile' })
      .closest('[data-head-block]')!;
    MENU_GROUPS.forEach(({ title }, i) => {
      const block = page().getByRole('heading', { level: 2, name: title }).parentElement!;
      expect(top.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(block).toHaveClass('motion-safe:animate-rise');
      expect(block).toHaveStyle({ animationDelay: `${(i + 1) * 60}ms` });
    });
  });
});
