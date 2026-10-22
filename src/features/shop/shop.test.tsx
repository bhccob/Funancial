import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { SHOP_ITEMS, purchaseEntry } from '@/domain/game/shop';
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

function renderShop(
  patch: (data: DataSnapshot) => void = () => {},
  overrides: Parameters<typeof createStubStore>[0] = {},
) {
  const data = emptySnapshot();
  patch(data);
  return renderWithStore(
    <>
      <ShopScreen />
      <Toaster />
    </>,
    createStubStore({ data, today: TODAY, ...overrides }),
  );
}

const region = (name: string) => screen.getByRole('region', { name });
/** The row of an item, found by its name. */
const row = (name: string) => screen.getByText(name, { selector: 'p' }).closest('li')!;

describe('Shop screen: balance', () => {
  it('shows the balance and the no-money-value line', () => {
    renderShop((d) => {
      d.tables.ledger = [earned(90)];
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Shop' })).toBeInTheDocument();
    expect(screen.getByText('90 coins')).toBeInTheDocument();
    expect(
      screen.getByText("Coins are for fun. They can't be bought and have no money value."),
    ).toBeInTheDocument();
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
});

describe('Shop screen: items', () => {
  it('has a section per kind, a row per item in catalogue order, and its price', () => {
    renderShop();

    const sections: [string, string][] = [
      ['Themes', 'theme'],
      ['Avatars', 'avatar'],
      ['Streak freezes', 'freeze'],
    ];
    for (const [title, slot] of sections) {
      const expected = SHOP_ITEMS.filter((i) => i.slot === slot);
      const rows = within(region(title)).getAllByRole('listitem');
      expect(rows).toHaveLength(expected.length);
      expected.forEach((item, i) => {
        expect(within(rows[i]!).getByText(item.name)).toBeInTheDocument();
        expect(
          within(rows[i]!).getByText(item.price === 0 ? 'Free' : `${item.price} coins`),
        ).toBeInTheDocument();
      });
    }
  });

  it('previews each theme as a dot in its own top block, and avatars', () => {
    const { container } = renderShop();

    const dot = (name: string) => row(name).querySelector('span.size-6.rounded-full');
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
      expect(dot(name)).toHaveAttribute('data-theme-preview', id);
      expect(dot(name)).toHaveClass('bg-head');
      expect(dot(name)).toHaveAttribute('aria-hidden', 'true');
    }

    expect(row('Cat').querySelector('svg.lucide-cat')).toBeInTheDocument();
    expect(row('Gem').querySelector('svg.lucide-gem')).toBeInTheDocument();
    expect(container.querySelector('svg.lucide-snowflake')).toBeInTheDocument();
  });

  it('sells no frames: borders come with the level', () => {
    renderShop();
    expect(screen.queryByRole('region', { name: 'Frames' })).not.toBeInTheDocument();
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

    // 100 coins is enough for the 80-coin Rocket: no reason, Buy is on.
    const rocket = row('Rocket');
    expect(within(rocket).getByRole('button', { name: 'Buy Rocket' })).toBeEnabled();
    expect(within(rocket).queryByText('Not enough coins.')).not.toBeInTheDocument();
  });

  it('shows In use for what is worn, Use for what is owned, and Buy for the rest', () => {
    renderShop((d) => {
      d.tables.ledger = [earned(1_000), bought('avatar-cat'), bought('theme-sky', 'p2')];
      d.tables.settings = [
        makeSettings({
          cosmetics: { theme: 'theme-mono', avatar: 'avatar-cat', frame: 'frame-none' },
        }),
      ];
    });

    // The free items are owned from the start.
    expect(within(row('Black & White')).getByText('In use')).toBeInTheDocument();
    expect(within(row('Black & White')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row('Cat')).getByText('In use')).toBeInTheDocument();
    expect(within(row('Sprout')).getByRole('button', { name: 'Use Sprout' })).toBeEnabled();
    expect(within(row('Sunny Sky')).getByRole('button', { name: 'Use Sunny Sky' })).toBeEnabled();
    expect(within(row('Sunny Sky')).queryByText('In use')).not.toBeInTheDocument();
    expect(within(row('Lemon Mint')).getByRole('button', { name: 'Buy Lemon Mint' })).toBeEnabled();
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

    expect(within(row('Powder Blue')).getByText('In use')).toBeInTheDocument();
    expect(within(row('Powder Blue')).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(row('Black & White')).getByRole('button', { name: 'Use Black & White' }),
    ).toBeEnabled();
    // Orchid was never bought, so Pastel is still for sale; the coins are as they were.
    expect(within(row('Pastel')).getByRole('button', { name: 'Buy Pastel' })).toBeEnabled();
    expect(screen.getByText('850 coins')).toBeInTheDocument();
  });

  it('asks the store to wear an owned item', async () => {
    const put = vi.fn(async () => {});
    renderShop(
      (d) => {
        d.tables.ledger = [bought('avatar-cat')];
      },
      { put },
    );

    await userEvent.click(within(row('Cat')).getByRole('button', { name: 'Use Cat' }));

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({
        cosmetics: { theme: 'theme-mono', avatar: 'avatar-cat', frame: 'frame-none' },
      }),
    );
  });

  it('keeps Use off while it is being saved, so a double tap runs it once', async () => {
    let finish!: () => void;
    const put = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderShop(
      (d) => {
        d.tables.ledger = [bought('avatar-cat')];
      },
      { put },
    );
    const use = within(row('Cat')).getByRole('button', { name: 'Use Cat' });

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
        d.tables.ledger = [bought('avatar-cat')];
      },
      { put },
    );

    const use = within(row('Cat')).getByRole('button', { name: 'Use Cat' });
    await userEvent.click(use);

    expect(await screen.findByText('Disk is full.')).toBeInTheDocument();
    expect(use).toBeEnabled();
  });
});

describe('Shop screen: freezes', () => {
  it('shows how many are held, and a freeze can be bought again', () => {
    renderShop((d) => {
      d.tables.ledger = [earned(300), bought('freeze-logging')];
    });

    const logging = row('Logging streak freeze');
    expect(within(logging).getByText('Held: 1 of 2')).toBeInTheDocument();
    expect(
      within(logging).getByRole('button', { name: 'Buy Logging streak freeze' }),
    ).toBeEnabled();
    expect(within(logging).getByText('50 coins')).toBeInTheDocument();

    const checkin = row('Check-in streak freeze');
    expect(within(checkin).getByText('Held: 0 of 2')).toBeInTheDocument();
    expect(within(checkin).getByText('80 coins')).toBeInTheDocument();
    expect(
      within(checkin).getByRole('button', { name: 'Buy Check-in streak freeze' }),
    ).toBeEnabled();
  });

  it('turns Buy off with the reason at the limit', () => {
    renderShop((d) => {
      d.tables.ledger = [earned(300), bought('freeze-logging'), bought('freeze-logging', 'p2')];
    });

    const logging = row('Logging streak freeze');
    expect(within(logging).getByText('Held: 2 of 2')).toBeInTheDocument();
    expect(within(logging).getByText('You can hold 2 at a time.')).toBeInTheDocument();
    expect(
      within(logging).getByRole('button', { name: 'Buy Logging streak freeze' }),
    ).toBeDisabled();
  });
});

describe('Shop screen: buying', () => {
  it('buys after confirming, then uses the item', async () => {
    const { store } = await freshRealStore();
    await store.getState().put('ledger', earned(510));
    renderWithStore(
      <>
        <ShopScreen />
        <Toaster />
      </>,
      store,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Buy Sunny Sky' }));
    const dialog = screen.getByRole('dialog', { name: 'Buy Sunny Sky for 400 coins?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Buy' }));

    // The toast moves out of the dialog as it closes, so look for it once the dialog is gone.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Sunny Sky is yours.')).toBeInTheDocument();
    expect(screen.getByText('110 coins')).toBeInTheDocument();

    await userEvent.click(within(row('Sunny Sky')).getByRole('button', { name: 'Use Sunny Sky' }));

    expect(await within(row('Sunny Sky')).findByText('In use')).toBeInTheDocument();
    expect(
      within(row('Black & White')).getByRole('button', { name: 'Use Black & White' }),
    ).toBeInTheDocument();
    expect(store.getState().data.tables.settings[0]?.cosmetics.theme).toBe('theme-sky');
  });

  it('puts the purchase in the ledger as the price in coins', async () => {
    const put = vi.fn(async () => {});
    renderShop(
      (d) => {
        d.tables.ledger = [earned(200)];
      },
      { put },
    );

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
        d.tables.ledger = [earned(200)];
      },
      { put },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Buy Rocket' }));
    const dialog = screen.getByRole('dialog', { name: 'Buy Rocket for 80 coins?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
    expect(screen.queryByText('Rocket is yours.')).not.toBeInTheDocument();
  });

  it('keeps Buy off while the purchase is pending, so a double tap buys once', async () => {
    let finish!: () => void;
    const put = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderShop(
      (d) => {
        d.tables.ledger = [earned(200)];
      },
      { put },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Buy Rocket' }));
    const dialog = screen.getByRole('dialog', { name: 'Buy Rocket for 80 coins?' });
    const buy = within(dialog).getByRole('button', { name: 'Buy' });
    await userEvent.dblClick(buy);

    expect(put).toHaveBeenCalledTimes(1);
    expect(buy).toBeDisabled();
    expect(screen.queryByText('Rocket is yours.')).not.toBeInTheDocument();

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Rocket is yours.')).toBeInTheDocument();
  });

  it('says why when the purchase is refused, and leaves the dialog open', async () => {
    const { store } = renderShop((d) => {
      d.tables.ledger = [earned(200)];
    });

    await userEvent.click(screen.getByRole('button', { name: 'Buy Rocket' }));
    const dialog = screen.getByRole('dialog', { name: 'Buy Rocket for 80 coins?' });
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
    expect(screen.queryByText('Rocket is yours.')).not.toBeInTheDocument();
  });
});
