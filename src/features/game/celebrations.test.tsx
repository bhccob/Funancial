import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import type { GameGain } from '@/domain/game/engine';
import { BORDERS } from '@/domain/game/levels';
import { toastStore } from '@/lib/toast';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { freshRealStore } from '@/test/realStore';
import { Celebrations } from './Celebrations';

type Reward = GameGain['rewards'][number];

const reward = (kind: Reward['kind'], title: string, xp: number, coins: number): Reward => ({
  kind,
  title,
  xp,
  coins,
});

function gain(over: Partial<GameGain> = {}): GameGain {
  return {
    xp: 0,
    coins: 0,
    levelBefore: 1,
    levelAfter: 1,
    tierChanged: false,
    rewards: [],
    ...over,
  };
}

/** The mounted celebrations over a stub store; `publish` hands the store a gain with a new id. */
function setup(initial: GameGain | null = null, ui = (node: ReactElement) => node) {
  let id = 0;
  const store = createStubStore({ gameGain: initial ? { id: ++id, gain: initial } : null });
  renderWithStore(
    ui(
      <>
        <Celebrations />
        <Toaster />
      </>,
    ),
    store,
  );
  const publish = (g: GameGain, withId = ++id) =>
    act(() => store.setState({ gameGain: { id: withId, gain: g } }));
  return { store, publish };
}

const messages = () => toastStore.getState().toasts.map((t) => t.message);

afterEach(() => toastStore.setState({ toasts: [] }));

describe('Celebrations: reward toasts', () => {
  it('toasts one quest reward', () => {
    const { publish } = setup();
    publish(gain({ xp: 30, coins: 5, rewards: [reward('quest', "Log today's spending", 20, 5)] }));
    expect(messages()).toEqual(["Quest complete: Log today's spending · +20 XP · +5 coins"]);
  });

  it('leaves out the coins when the reward pays none', () => {
    const { publish } = setup();
    publish(gain({ rewards: [reward('quest', 'Review your week', 20, 0)] }));
    expect(messages()).toEqual(['Quest complete: Review your week · +20 XP']);
  });

  it('words a streak and a challenge reward', () => {
    const { publish } = setup();
    publish(gain({ rewards: [reward('streak', 'Daily logging: 7-day streak', 50, 10)] }));
    publish(gain({ rewards: [reward('challenge', 'No-Spend Weekend', 100, 0)] }));
    expect(messages()).toEqual([
      'Daily logging: 7-day streak · +50 XP · +10 coins',
      'Challenge won: No-Spend Weekend · +100 XP',
    ]);
  });

  it('shows the reward toast in the violet, polite status style', () => {
    const { publish } = setup();
    publish(gain({ rewards: [reward('quest', 'Review your week', 20, 5)] }));
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Quest complete: Review your week · +20 XP · +5 coins');
    expect(toast.querySelector('svg.lucide-sparkles')).toHaveClass('text-xp-text');
  });

  it('summarizes many rewards in one toast', () => {
    const { publish } = setup();
    publish(
      gain({
        rewards: [
          reward('quest', 'Log today’s spending', 20, 5),
          reward('quest', 'Check your limits', 40, 10),
          reward('streak', 'Daily logging: 7-day streak', 70, 15),
          reward('quest', 'Review your week', 100, 25),
        ],
      }),
    );
    expect(messages()).toEqual(['+230 XP · +55 coins from 4 rewards']);
  });

  it('counts a challenge among many rewards', () => {
    const { publish } = setup();
    publish(
      gain({
        rewards: [
          reward('quest', 'Review your week', 20, 0),
          reward('challenge', 'No-Spend Weekend', 100, 0),
        ],
      }),
    );
    expect(messages()).toEqual(['+120 XP · +0 coins from 2 rewards']);
  });
});

describe('Celebrations: badges', () => {
  it('announces badges', () => {
    const { publish } = setup();
    publish(gain({ rewards: [reward('badge', 'First Expense Logged', 50, 10)] }));
    expect(messages()).toEqual(['Badge unlocked: First Expense Logged']);
  });

  it('gives one or two badges a toast each and three or more a single toast', () => {
    const { publish } = setup();
    publish(
      gain({
        rewards: [
          reward('badge', 'First Expense Logged', 50, 10),
          reward('badge', 'Budget Starter', 50, 10),
        ],
      }),
    );
    expect(messages()).toEqual([
      'Badge unlocked: First Expense Logged',
      'Badge unlocked: Budget Starter',
    ]);

    toastStore.setState({ toasts: [] });
    publish(
      gain({
        rewards: [
          reward('badge', 'First Expense Logged', 50, 10),
          reward('badge', 'Budget Starter', 50, 10),
          reward('badge', 'Goal Setter', 50, 10),
        ],
      }),
    );
    expect(messages()).toEqual(['3 badges unlocked']);
  });

  it('keeps badges out of the reward toast', () => {
    const { publish } = setup();
    publish(
      gain({
        rewards: [
          reward('badge', 'First Expense Logged', 50, 10),
          reward('quest', "Log today's spending", 20, 5),
          reward('badge', 'Budget Starter', 50, 10),
        ],
      }),
    );
    expect(messages()).toEqual([
      "Quest complete: Log today's spending · +20 XP · +5 coins",
      'Badge unlocked: First Expense Logged',
      'Badge unlocked: Budget Starter',
    ]);
  });
});

describe('Celebrations: level-up', () => {
  it('opens one level-up dialog at the final level', () => {
    const { publish } = setup();
    publish(gain({ xp: 900, levelBefore: 1, levelAfter: 6 }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const dialog = screen.getByRole('dialog', { name: 'Level 6' });
    expect(dialog).toHaveAccessibleDescription('Bronze Saver · keep it up.');
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
  });

  it('names a new tier', () => {
    const { publish } = setup();
    publish(gain({ levelBefore: 10, levelAfter: 11, tierChanged: true }));
    expect(screen.getByRole('dialog', { name: 'Level 11' })).toHaveAccessibleDescription(
      "You're now a Silver Budgeter.",
    );
  });

  it('names the border that level unlocks, and where to pick it', () => {
    const { publish } = setup();
    publish(gain({ levelBefore: 10, levelAfter: 11, tierChanged: true }));
    const dialog = screen.getByRole('dialog', { name: 'Level 11' });
    expect(
      within(dialog).getByText('New border: Silver. Pick it on your Profile.'),
    ).toBeInTheDocument();
    // The tier line is still there beside it.
    expect(dialog).toHaveAccessibleDescription("You're now a Silver Budgeter.");
  });

  it('names no border at a level that unlocks none', () => {
    const { publish } = setup();
    publish(gain({ levelBefore: 11, levelAfter: 12 }));
    const dialog = screen.getByRole('dialog', { name: 'Level 12' });
    expect(within(dialog).queryByText(/New border/)).not.toBeInTheDocument();
  });

  it('names the border passed on the way when the gain jumps past its level', () => {
    const { publish } = setup();
    publish(gain({ levelBefore: 10, levelAfter: 12 }));
    expect(
      within(screen.getByRole('dialog', { name: 'Level 12' })).getByText(
        'New border: Silver. Pick it on your Profile.',
      ),
    ).toBeInTheDocument();
  });

  it('names every border passed on the way, lowest first', () => {
    const { publish } = setup();
    publish(gain({ levelBefore: 4, levelAfter: 12 }));
    const dialog = screen.getByRole('dialog', { name: 'Level 12' });
    expect(
      within(dialog).getByText('New borders: Bronze, Silver. Pick them on your Profile.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/New border:/)).not.toBeInTheDocument();
  });

  it.each(BORDERS)('names $name at level $level', ({ name, level }) => {
    const { publish } = setup();
    publish(gain({ levelBefore: level - 1, levelAfter: level }));
    expect(
      within(screen.getByRole('dialog', { name: `Level ${level}` })).getByText(
        `New border: ${name}. Pick it on your Profile.`,
      ),
    ).toBeInTheDocument();
  });

  it('shows the newest level, and the border it unlocks, when another level-up arrives', () => {
    const { publish } = setup();
    publish(gain({ levelBefore: 10, levelAfter: 11 }));
    publish(gain({ levelBefore: 11, levelAfter: 12 }));
    const dialog = screen.getByRole('dialog', { name: 'Level 12' });
    expect(within(dialog).queryByText(/New border/)).not.toBeInTheDocument();
  });

  it('pops the level chip, only where motion is allowed', () => {
    const { publish } = setup();
    publish(gain({ levelBefore: 1, levelAfter: 2 }));
    const chip = within(screen.getByRole('dialog', { name: 'Level 2' })).getByText('LV 2');
    expect(chip).toHaveClass('motion-safe:animate-pop');
    expect(chip.className).not.toMatch(/(^|\s)animate-pop/);
  });

  it('closes with Nice', async () => {
    const { publish } = setup();
    publish(gain({ levelBefore: 1, levelAfter: 2 }));
    await userEvent.click(screen.getByRole('button', { name: 'Nice' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the newest level when another level-up arrives while it is open', () => {
    const { publish } = setup();
    publish(gain({ levelBefore: 1, levelAfter: 2 }));
    publish(gain({ levelBefore: 2, levelAfter: 3 }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Level 3' })).toBeInTheDocument();
  });

  it('keeps an open dialog when a later gain has no level-up', () => {
    const { publish } = setup();
    publish(gain({ levelBefore: 1, levelAfter: 2 }));
    publish(gain({ xp: 10 }));
    expect(screen.getByRole('dialog', { name: 'Level 2' })).toBeInTheDocument();
  });

  it('does not open for a gain that stays on its level', () => {
    const { publish } = setup();
    publish(gain({ xp: 40, levelBefore: 3, levelAfter: 3 }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Celebrations: once per gain', () => {
  it('stays quiet for logging XP alone', () => {
    const { publish } = setup();
    publish(gain({ xp: 10 }));
    expect(messages()).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('celebrates a gain once', () => {
    const { publish } = setup();
    const g = gain({ rewards: [reward('quest', "Log today's spending", 20, 5)] });
    publish(g, 7);
    // The store hands over a new object with the same id: not a new gain.
    publish({ ...g }, 7);
    expect(messages()).toHaveLength(1);
  });

  it('celebrates a gain once under StrictMode, which runs effects twice on mount', () => {
    setup(
      gain({
        levelBefore: 1,
        levelAfter: 2,
        rewards: [reward('quest', 'Review your week', 20, 5)],
      }),
      (node) => <StrictMode>{node}</StrictMode>,
    );
    expect(messages()).toHaveLength(1);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('celebrates each new gain', () => {
    const { publish } = setup();
    publish(gain({ rewards: [reward('quest', "Log today's spending", 20, 5)] }));
    publish(gain({ rewards: [reward('badge', 'First Expense Logged', 50, 10)] }));
    expect(messages()).toEqual([
      "Quest complete: Log today's spending · +20 XP · +5 coins",
      'Badge unlocked: First Expense Logged',
    ]);
  });

  it('celebrates a gain already published when it mounts', () => {
    setup(
      gain({
        levelBefore: 1,
        levelAfter: 2,
        rewards: [reward('quest', 'Review your week', 20, 5)],
      }),
    );
    expect(messages()).toEqual(['Quest complete: Review your week · +20 XP · +5 coins']);
    expect(screen.getByRole('dialog', { name: 'Level 2' })).toBeInTheDocument();
  });

  it('does not celebrate again when a lock clears the gain', () => {
    const { store, publish } = setup();
    publish(gain({ rewards: [reward('quest', 'Review your week', 20, 5)] }));
    act(() => store.setState({ gameGain: null }));
    expect(messages()).toHaveLength(1);
  });
});

describe('Celebrations: entering the demo', () => {
  it('shows nothing for the seeded history of the demo', async () => {
    const { store } = await freshRealStore();
    renderWithStore(
      <>
        <Celebrations />
        <Toaster />
      </>,
      store,
    );

    await act(() => store.getState().startDemo());

    expect(messages()).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
