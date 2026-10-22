import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { purchaseEntry, THEMES } from '@/domain/game/shop';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { toastStore } from '@/lib/toast';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { localIso, makeLedgerEntry, makeLegacyPurchase, makeSettings } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { ShopScreen } from './ShopScreen';

const TODAY = '2026-10-14';
const AT = (day: string) => localIso(day);

beforeEach(() => toastStore.setState({ toasts: [] }));
afterEach(() => toastStore.setState({ toasts: [] }));

/** Coins earned in the game, as one ledger entry. */
const earned = (coins: number) => makeLedgerEntry({ key: 'seed', xp: 0, coins });
const bought = (itemId: string, id = 'p1') => purchaseEntry(itemId, id, AT('2026-10-01'));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function shopIn(entries: string[], index?: number) {
  return (
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <ShopScreen />
      <Toaster />
      <Where />
    </MemoryRouter>
  );
}

function renderShop(
  patch: (data: DataSnapshot) => void = () => {},
  overrides: Parameters<typeof createStubStore>[0] = {},
) {
  const data = emptySnapshot();
  patch(data);
  return renderWithStore(shopIn(['/shop']), createStubStore({ data, today: TODAY, ...overrides }));
}

/** The block at the top: Back, the title and the coins. */
const block = () =>
  screen
    .getByRole('heading', { level: 1, name: 'Shop' })
    .closest<HTMLElement>('[data-head-block]')!;
/** The Themes, Avatars and Freezes tabs. */
const tabs = () => screen.getByRole('group', { name: 'Shop sections' });
const showing = (name: 'Themes' | 'Avatars' | 'Freezes') =>
  userEvent.click(within(tabs()).getByRole('button', { name }));
/** A group of cards or rows, by its title. */
const group = (title: string) =>
  screen.getByRole('heading', { level: 2, name: title }).closest<HTMLElement>('section')!;
/** The card or row of an item, found by its name. */
const row = (name: string) => screen.getByText(name, { selector: 'p' }).closest<HTMLElement>('li')!;

describe('Shop screen: the block', () => {
  it('has the title and the balance in the theme block, and the no-money-value line below', () => {
    renderShop((d) => {
      d.tables.ledger = [earned(90)];
    });

    expect(block()).toBeInTheDocument();
    expect(within(block()).getByText('90 coins')).toHaveClass('glass-head');
    expect(
      screen.getByText("Coins are for fun. They can't be bought and have no money value."),
    ).toBeInTheDocument();
    expect(block()).not.toHaveTextContent('no money value');
  });

  it('says 1 coin for one, and never shows less than 0', () => {
    const { unmount } = renderShop((d) => {
      d.tables.ledger = [earned(1)];
    });
    expect(screen.getByText('1 coin')).toBeInTheDocument();
    unmount();

    renderShop((d) => {
      d.tables.ledger = [earned(-30)];
    });
    expect(screen.getByText('0 coins')).toBeInTheDocument();
  });

  it('has a Back button that goes back, or to Profile when nothing came before', async () => {
    const { unmount } = renderWithStore(
      shopIn(['/quests', '/shop'], 1),
      createStubStore({ today: TODAY }),
    );
    await userEvent.click(within(block()).getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/quests');
    unmount();

    renderShop();
    await userEvent.click(within(block()).getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/profile');
  });

  it('has Themes, Avatars and Freezes under the title, on the block, Themes first', async () => {
    renderShop();
    expect(block()).toContainElement(tabs());
    const buttons = within(tabs()).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Themes', 'Avatars', 'Freezes']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);

    await showing('Avatars');
    expect(within(tabs()).getByRole('button', { name: 'Avatars' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(tabs()).getByRole('button', { name: 'Themes' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('Shop screen: themes', () => {
  it('has Free, Light and Dark, each with its themes in catalogue order and their prices', () => {
    renderShop();

    const groups = [
      ['Free', 'free'],
      ['Light · 400–450 coins', 'light'],
      ['Dark · 600 coins', 'dark'],
    ] as const;
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(
      groups.map(([title]) => title),
    );
    for (const [title, kind] of groups) {
      const expected = THEMES.filter((t) => t.kind === kind);
      const cards = within(group(title)).getAllByRole('listitem');
      expect(cards).toHaveLength(expected.length);
      expected.forEach((theme, i) => {
        expect(within(cards[i]!).getByText(theme.name)).toBeInTheDocument();
        expect(
          within(cards[i]!).getByText(theme.price === 0 ? 'Free' : `${theme.price}`),
        ).toBeInTheDocument();
      });
    }
    // Twelve themes in all: one free, seven light, four dark.
    expect(THEMES.filter((t) => t.kind === 'light')).toHaveLength(7);
  });

  it('says what a price is in coins to a screen reader', () => {
    renderShop();
    expect(within(row('Sunny Sky')).getByText('400')).toHaveTextContent('400 coins');
  });

  it('gives each theme a glass card with a mini preview in its own colors', () => {
    renderShop();
    const themes: [string, string][] = [
      ['Black & White', 'mono'],
      ['Sunny Sky', 'sky'],
      ['Lemon Mint', 'lemon'],
      ['Pastel', 'pastel'],
      ['Daisy Sage', 'daisy'],
      ['Peach Sorbet', 'peach'],
      ['Powder Blue', 'powder'],
      ['Seafoam', 'seafoam'],
      ['Midnight Navy', 'navy'],
      ['Forest Night', 'forest'],
      ['Plum Night', 'plum'],
      ['Espresso', 'espresso'],
    ];
    for (const [name, id] of themes) {
      const card = row(name);
      expect(card).toHaveClass('glass', 'rounded-[22px]', 'overflow-hidden');
      const preview = card.querySelector<HTMLElement>(`[data-theme-preview="${id}"]`)!;
      expect(preview, name).toBeInTheDocument();
      expect(preview).toHaveAttribute('aria-hidden', 'true');
      // The raw-variable utilities, which read the preview's own theme: the color tokens
      // (bg-bg, text-head-ink …) are set on :root and would show the theme worn now.
      expect(preview).toHaveClass('bg-head', 'text-(--head-ink)', 'h-[92px]');
      expect(preview.querySelector('.glass-head')).toBeInTheDocument();
      expect(preview).toHaveTextContent('Available balance');
      expect(preview.className).not.toMatch(/(^|\s)(bg-bg|bg-surface|text-text|text-head-ink)\b/);
    }
  });

  it('shows a sample balance in the profile currency in the preview', () => {
    renderShop();
    expect(row('Sunny Sky').querySelector('[data-theme-preview]')).toHaveTextContent('$2,617');
  });

  it('sells no frames: borders come with the level', () => {
    renderShop();
    expect(screen.queryByRole('heading', { name: /frame/i })).not.toBeInTheDocument();
    expect(screen.queryByText('No frame')).not.toBeInTheDocument();
    expect(screen.queryByText('Game color')).not.toBeInTheDocument();
  });
});

describe('Shop screen: buttons', () => {
  it('disables Buy with the reason when coins are short', () => {
    renderShop((d) => {
      d.tables.ledger = [earned(100)];
    });

    const sky = row('Sunny Sky');
    const buy = within(sky).getByRole('button', { name: 'Buy Sunny Sky' });
    expect(buy).toBeDisabled();
    expect(within(sky).getByText('Not enough coins.')).toBeInTheDocument();
    expect(buy).toHaveAccessibleDescription('Not enough coins.');
  });

  it('shows On for the one worn, Use for what is owned, and Buy for the rest', () => {
    renderShop((d) => {
      d.tables.ledger = [earned(2_000), bought('theme-sky'), bought('theme-lemon', 'p2')];
      d.tables.settings = [
        makeSettings({
          cosmetics: { theme: 'theme-sky', avatar: 'avatar-sprout', frame: 'frame-none' },
        }),
      ];
    });

    // Black & White is free, so owned from the start; Sunny Sky is the one worn.
    expect(within(row('Sunny Sky')).getByText('On')).toBeInTheDocument();
    expect(within(row('Sunny Sky')).queryByRole('button')).not.toBeInTheDocument();
    expect(row('Sunny Sky')).toHaveClass('outline-2', 'outline-text');
    expect(
      within(row('Black & White')).getByRole('button', { name: 'Use Black & White' }),
    ).toBeEnabled();
    expect(within(row('Lemon Mint')).getByRole('button', { name: 'Use Lemon Mint' })).toBeEnabled();
    expect(within(row('Pastel')).getByRole('button', { name: 'Buy Pastel' })).toBeEnabled();
    // Only the worn one is outlined.
    expect(row('Lemon Mint')).not.toHaveClass('outline-2');
    expect(row('Pastel')).not.toHaveClass('outline-2');
  });

  it('shows an owned theme as Use, not Buy', () => {
    renderShop((d) => {
      d.tables.ledger = [earned(1_000), bought('theme-peach')];
    });
    const peach = row('Peach Sorbet');
    expect(within(peach).getByRole('button', { name: 'Use Peach Sorbet' })).toHaveTextContent(
      'Use',
    );
    expect(within(peach).queryByRole('button', { name: /^Buy/ })).not.toBeInTheDocument();
    // An owned theme has no reason not to be bought: it is not for sale again.
    expect(within(peach).queryByText('Not enough coins.')).not.toBeInTheDocument();
  });

  it('shows a 0.11 Ocean purchase as an owned Powder Blue, worn as it was', () => {
    renderShop((d) => {
      d.tables.ledger = [earned(1_000), makeLegacyPurchase('theme-ocean', 150)];
      d.tables.settings = [
        makeSettings({
          cosmetics: { theme: 'theme-ocean', avatar: 'avatar-sprout', frame: 'frame-none' },
        }),
      ];
    });

    expect(within(row('Powder Blue')).getByText('On')).toBeInTheDocument();
    expect(within(row('Powder Blue')).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(row('Black & White')).getByRole('button', { name: 'Use Black & White' }),
    ).toBeEnabled();
    // Orchid was never bought, so Pastel is still for sale; the coins are as they were.
    expect(within(row('Pastel')).getByRole('button', { name: 'Buy Pastel' })).toBeEnabled();
    expect(screen.getByText('850 coins')).toBeInTheDocument();
  });

  it('asks the store to wear an owned theme', async () => {
    const put = vi.fn(async () => {});
    renderShop(
      (d) => {
        d.tables.ledger = [bought('theme-sky')];
      },
      { put },
    );

    await userEvent.click(within(row('Sunny Sky')).getByRole('button', { name: 'Use Sunny Sky' }));

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({
        cosmetics: { theme: 'theme-sky', avatar: 'avatar-sprout', frame: 'frame-none' },
      }),
    );
  });

  it('keeps Use off while it is being saved, so a double tap runs it once', async () => {
    let finish!: () => void;
    const put = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderShop(
      (d) => {
        d.tables.ledger = [bought('theme-sky')];
      },
      { put },
    );
    const use = within(row('Sunny Sky')).getByRole('button', { name: 'Use Sunny Sky' });

    await userEvent.dblClick(use);

    expect(put).toHaveBeenCalledTimes(1);
    expect(use).toBeDisabled();
    await act(async () => finish());
    expect(use).toBeEnabled();
  });

  it('says why when wearing fails, and carries on', async () => {
    const put = vi.fn(async () => {
      throw new Error('Disk is full.');
    });
    renderShop(
      (d) => {
        d.tables.ledger = [bought('theme-sky')];
      },
      { put },
    );

    const use = within(row('Sunny Sky')).getByRole('button', { name: 'Use Sunny Sky' });
    await userEvent.click(use);

    expect(await screen.findByText('Disk is full.')).toBeInTheDocument();
    expect(use).toBeEnabled();
  });

  it('keeps every Buy and Use a 44px tap, though the pill is 30px', () => {
    renderShop((d) => {
      d.tables.ledger = [earned(1_000), bought('theme-sky')];
    });
    for (const name of ['Buy Pastel', 'Use Sunny Sky']) {
      const button = screen.getByRole('button', { name });
      expect(button, name).toHaveClass('hit-44', 'min-h-[30px]');
    }
  });
});

describe('Shop screen: avatars', () => {
  it('has the avatars as cards, each with Buy, Use or On, and the price', async () => {
    renderShop((d) => {
      d.tables.ledger = [earned(1_000), bought('avatar-cat')];
      d.tables.settings = [
        makeSettings({
          cosmetics: { theme: 'theme-mono', avatar: 'avatar-cat', frame: 'frame-none' },
        }),
      ];
    });
    await showing('Avatars');

    expect(screen.queryByText('Sunny Sky')).not.toBeInTheDocument();
    const cards = within(group('Avatars')).getAllByRole('listitem');
    expect(cards).toHaveLength(7);
    expect(row('Cat').querySelector('svg.lucide-cat')).toBeInTheDocument();
    expect(row('Gem').querySelector('svg.lucide-gem')).toBeInTheDocument();
    expect(within(row('Cat')).getByText('On')).toBeInTheDocument();
    expect(within(row('Sprout')).getByText('Free')).toBeInTheDocument();
    expect(within(row('Sprout')).getByRole('button', { name: 'Use Sprout' })).toBeEnabled();
    expect(within(row('Rocket')).getByText('80')).toBeInTheDocument();
    expect(within(row('Rocket')).getByRole('button', { name: 'Buy Rocket' })).toBeEnabled();
    expect(within(row('Crown')).getByText('120')).toBeInTheDocument();
  });

  it('asks the store to wear an owned avatar', async () => {
    const put = vi.fn(async () => {});
    renderShop(
      (d) => {
        d.tables.ledger = [bought('avatar-cat')];
      },
      { put },
    );
    await showing('Avatars');

    await userEvent.click(within(row('Cat')).getByRole('button', { name: 'Use Cat' }));

    expect(put).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({
        cosmetics: { theme: 'theme-mono', avatar: 'avatar-cat', frame: 'frame-none' },
      }),
    );
  });

  it('turns Buy off with the reason when coins are short', async () => {
    renderShop((d) => {
      d.tables.ledger = [earned(70)];
    });
    await showing('Avatars');

    const rocket = row('Rocket');
    expect(within(rocket).getByRole('button', { name: 'Buy Rocket' })).toBeDisabled();
    expect(within(rocket).getByText('Not enough coins.')).toBeInTheDocument();
  });
});

describe('Shop screen: freezes', () => {
  it('shows how many are held, and a freeze can be bought again', async () => {
    renderShop((d) => {
      d.tables.ledger = [earned(300), bought('freeze-logging')];
    });
    await showing('Freezes');

    const logging = row('Logging streak freeze');
    expect(within(logging).getByText('Held: 1 of 2')).toBeInTheDocument();
    expect(
      within(logging).getByRole('button', { name: 'Buy Logging streak freeze' }),
    ).toBeEnabled();
    expect(within(logging).getByText('50')).toBeInTheDocument();

    const checkin = row('Check-in streak freeze');
    expect(within(checkin).getByText('Held: 0 of 2')).toBeInTheDocument();
    expect(within(checkin).getByText('80')).toBeInTheDocument();
    expect(
      within(checkin).getByRole('button', { name: 'Buy Check-in streak freeze' }),
    ).toBeEnabled();
  });

  it('turns Buy off with the reason at the limit', async () => {
    renderShop((d) => {
      d.tables.ledger = [earned(300), bought('freeze-logging'), bought('freeze-logging', 'p2')];
    });
    await showing('Freezes');

    const logging = row('Logging streak freeze');
    expect(within(logging).getByText('Held: 2 of 2')).toBeInTheDocument();
    expect(within(logging).getByText('You can hold 2 at a time.')).toBeInTheDocument();
    expect(
      within(logging).getByRole('button', { name: 'Buy Logging streak freeze' }),
    ).toBeDisabled();
  });

  it('lists them as plain rows with hairlines, not cards', async () => {
    renderShop();
    await showing('Freezes');
    const list = group('Streak freezes').querySelector('ul')!;
    expect(list).toHaveClass('divide-y');
    expect(row('Logging streak freeze')).not.toHaveClass('glass');
  });
});

describe('Shop screen: buying', () => {
  it('buys Sunny Sky with 400 coins and turns it on', async () => {
    const { store } = await freshRealStore();
    await store.getState().put('ledger', earned(400));
    renderWithStore(shopIn(['/shop']), store);

    await userEvent.click(screen.getByRole('button', { name: 'Buy Sunny Sky' }));
    const dialog = screen.getByRole('dialog', { name: 'Buy Sunny Sky for 400 coins?' });
    expect(dialog).toHaveAccessibleDescription('It turns on as soon as it is yours.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Buy' }));

    // The toast moves out of the dialog as it closes, so look for it once the dialog is gone.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Sunny Sky is yours.')).toBeInTheDocument();
    expect(screen.getByText('0 coins')).toBeInTheDocument();

    await waitFor(() => expect(within(row('Sunny Sky')).getByText('On')).toBeInTheDocument());
    expect(store.getState().data.tables.settings[0]?.cosmetics.theme).toBe('theme-sky');
    expect(
      within(row('Black & White')).getByRole('button', { name: 'Use Black & White' }),
    ).toBeInTheDocument();
  });

  it('buys an avatar after confirming, and leaves it to Use', async () => {
    const { store } = await freshRealStore();
    await store.getState().put('ledger', earned(200));
    renderWithStore(shopIn(['/shop']), store);
    await showing('Avatars');

    await userEvent.click(screen.getByRole('button', { name: 'Buy Rocket' }));
    const dialog = screen.getByRole('dialog', { name: 'Buy Rocket for 80 coins?' });
    expect(dialog).not.toHaveAccessibleDescription();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Buy' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Rocket is yours.')).toBeInTheDocument();
    expect(screen.getByText('120 coins')).toBeInTheDocument();
    expect(within(row('Rocket')).getByRole('button', { name: 'Use Rocket' })).toBeInTheDocument();
    expect(store.getState().data.tables.settings[0]?.cosmetics.avatar).toBe('avatar-sprout');
  });

  it('puts the purchase in the ledger as the price in coins', async () => {
    const put = vi.fn(async () => {});
    renderShop(
      (d) => {
        d.tables.ledger = [earned(200)];
      },
      { put },
    );
    await showing('Avatars');

    await userEvent.click(screen.getByRole('button', { name: 'Buy Rocket' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Buy Rocket for 80 coins?' })).getByRole('button', {
        name: 'Buy',
      }),
    );

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      'ledger',
      expect.objectContaining({ kind: 'purchase', coins: -80, label: 'Bought: Rocket' }),
    );
  });

  it('buys nothing on Cancel', async () => {
    const put = vi.fn(async () => {});
    renderShop(
      (d) => {
        d.tables.ledger = [earned(500)];
      },
      { put },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Buy Sunny Sky' }));
    const dialog = screen.getByRole('dialog', { name: 'Buy Sunny Sky for 400 coins?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
    expect(screen.queryByText('Sunny Sky is yours.')).not.toBeInTheDocument();
  });

  it('keeps Buy off while the purchase is pending, so a double tap buys once', async () => {
    let finish!: () => void;
    const put = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderShop(
      (d) => {
        d.tables.ledger = [earned(500)];
      },
      { put },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Buy Sunny Sky' }));
    const dialog = screen.getByRole('dialog', { name: 'Buy Sunny Sky for 400 coins?' });
    const buy = within(dialog).getByRole('button', { name: 'Buy' });
    await userEvent.dblClick(buy);

    expect(put).toHaveBeenCalledTimes(1);
    expect(buy).toBeDisabled();
    expect(screen.queryByText('Sunny Sky is yours.')).not.toBeInTheDocument();

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Sunny Sky is yours.')).toBeInTheDocument();
  });

  it('says why when the purchase is refused, and leaves the dialog open', async () => {
    const { store } = renderShop((d) => {
      d.tables.ledger = [earned(500)];
    });

    await userEvent.click(screen.getByRole('button', { name: 'Buy Sunny Sky' }));
    const dialog = screen.getByRole('dialog', { name: 'Buy Sunny Sky for 400 coins?' });
    // The coins are spent elsewhere while the dialog is open.
    act(() => {
      const data = emptySnapshot();
      data.tables.ledger = [earned(10)];
      store.setState({ data });
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Buy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough coins.');
    expect(store.getState().put).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Buy' })).toBeEnabled();
    expect(screen.queryByText('Sunny Sky is yours.')).not.toBeInTheDocument();
  });
});
