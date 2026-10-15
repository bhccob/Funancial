import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderSettings } from '@/domain/entities';
import { EXAMPLES } from '@/domain/examples';
import { computeGameView } from '@/domain/game/engine';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { applyRecords, dueGenerated } from '@/domain/sync';
import { formatDay, formatMonth } from '@/lib/format';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeNotifier, onPhone, type FakeNotifier } from '@/test/fakeNotifier';
import { makeCheckIn, makeLimit, makeProfile, makeSettings } from '@/test/fixtures';
import { DashboardScreen } from './DashboardScreen';

const actions = vi.hoisted(() => ({
  confirmIncome: vi.fn(async () => {}),
  skipIncome: vi.fn(async () => {}),
  updateSettings: vi.fn(async () => {}),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => actions,
}));
// The real game view, counted.
vi.mock('@/domain/game/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/game/engine')>();
  return { ...actual, computeGameView: vi.fn(actual.computeGameView) };
});

beforeEach(() => Object.values(actions).forEach((a) => a.mockClear()));

function example(id: string) {
  const found = EXAMPLES.find((e) => e.id === id);
  if (!found) throw new Error(`No worked example ${id}`);
  return found;
}

function renderDashboard(data: DataSnapshot, today: string) {
  return renderWithStore(
    <MemoryRouter>
      <DashboardScreen />
    </MemoryRouter>,
    createStubStore({ data, today }),
  );
}

const region = (name: string) => screen.getByRole('region', { name });
// Expected text is built with the app's formatters: the test machine's locale decides "$" vs "US$".
const usd = (minor: number) => formatMoney(minor, 'USD');
const october = formatMonth('2026-10');

describe('DashboardScreen with AVL-1', () => {
  const avl = example('AVL-1');
  beforeEach(() => renderDashboard(avl.data, avl.today));

  it('leads with what is available to spend', () => {
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    const kpi = region('Available to spend');
    expect(within(kpi).getByText(usd(2_654_01))).toBeInTheDocument();
    expect(
      within(kpi).getByText('Cash + savings − upcoming bills − reserved limits'),
    ).toBeInTheDocument();
    expect(within(kpi).getByRole('link', { name: 'Add expense' })).toHaveAttribute('href', '/add');
    expect(within(kpi).getByRole('link', { name: 'Income' })).toHaveAttribute(
      'href',
      '/add?type=income',
    );
  });

  it('shows net worth with its parts and this month’s spending', () => {
    const worth = region('Net worth');
    // 1,100 cash + 3,000 savings − 230 card
    expect(within(worth).getByText(usd(3_870_00))).toBeInTheDocument();
    expect(
      within(worth).getByText(
        `Cash ${usd(1_100_00)} · Savings ${usd(3_000_00)} · Debts ${usd(230_00)}`,
      ),
    ).toBeInTheDocument();
    const spent = region(`Spent in ${october}`);
    expect(within(spent).getByText(usd(100_00))).toBeInTheDocument();
    expect(within(spent).getByText(`This year ${usd(100_00)}`)).toBeInTheDocument();
  });

  it('shows the food limit at 83%', () => {
    const bar = screen.getByRole('progressbar', { name: 'Food · this week' });
    expect(bar).toHaveAttribute('aria-valuenow', '83');
    expect(bar).toHaveAttribute('aria-valuetext', '83% used');
    expect(within(region('Limits')).getByRole('link', { name: 'See all' })).toHaveAttribute(
      'href',
      '/budget',
    );
  });

  it('lists the bills still due this month with their total', () => {
    const bills = region('Upcoming bills');
    expect(within(bills).getByText('Streamflix')).toBeInTheDocument();
    expect(within(bills).getByText('Visa')).toBeInTheDocument();
    expect(within(bills).queryByText('FitHub Gym')).not.toBeInTheDocument();
    expect(within(bills).getByText(`${usd(245_99)} this month`)).toBeInTheDocument();
  });
});

describe('DashboardScreen salary and freeze', () => {
  const sal = example('SAL-1');

  it('asks whether an expected salary arrived and confirms the amount', async () => {
    const today = '2026-10-25';
    renderDashboard(applyRecords(sal.data, dueGenerated(sal.data, today)), today);
    expect(
      screen.getByText(`Your ${october} salary is expected: ${usd(2_709_68)}. Did it arrive?`),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `Confirm ${october} salary` }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm salary' });
    expect(within(dialog).getByLabelText('Amount received')).toHaveValue('2,709.68');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(actions.confirmIncome).toHaveBeenCalledWith('salary-2026-10', 270968);
  });

  it('lets a salary that never came be marked as not arrived', async () => {
    const today = '2026-10-25';
    renderDashboard(applyRecords(sal.data, dueGenerated(sal.data, today)), today);
    await userEvent.click(
      screen.getByRole('button', { name: `Didn't arrive (${october} salary)` }),
    );
    expect(actions.skipIncome).toHaveBeenCalledWith('salary-2026-10');
  });

  it('explains an active freeze', () => {
    renderDashboard(sal.data, '2026-10-02');
    expect(
      screen.getByText(
        `Salary freeze until ${formatDay('2026-10-03')}. Bills and subscriptions still apply.`,
      ),
    ).toBeInTheDocument();
  });
});

describe('DashboardScreen with nothing set up', () => {
  it('invites the first limit and says nothing is due', () => {
    renderDashboard(emptySnapshot(), '2026-10-14');
    expect(within(region('Limits')).getByText('No limits yet')).toBeInTheDocument();
    expect(within(region('Limits')).getByRole('link', { name: 'Set a limit' })).toHaveAttribute(
      'href',
      '/budget',
    );
    expect(
      within(region('Upcoming bills')).getByText('Nothing due this month'),
    ).toBeInTheDocument();
    expect(within(region('Available to spend')).getByText(usd(0))).toBeInTheDocument();
  });
});

describe('DashboardScreen reminders invitation', () => {
  const INVITE = 'Get reminders for bills, renewals and a daily nudge to log spending.';
  const BLOCKED =
    'Notifications are blocked for Funancial. Turn them on in Android Settings → Apps → Funancial → Notifications.';
  /** Nobody has been asked yet: off, and not prompted. */
  const fresh = makeSettings().reminders;

  function dataWith(reminders: ReminderSettings) {
    const data = emptySnapshot();
    data.tables.settings = [makeSettings({ reminders })];
    return data;
  }

  function renderOnPhone(
    notifier: FakeNotifier | null,
    reminders = fresh,
    namespace: 'real' | 'demo' = 'real',
  ) {
    return renderWithStore(
      onPhone(
        notifier,
        <MemoryRouter>
          <DashboardScreen />
        </MemoryRouter>,
      ),
      createStubStore({ data: dataWith(reminders), namespace, today: '2026-10-14' }),
    );
  }

  it('offers reminders once and remembers Not now', async () => {
    const notifier = fakeNotifier();
    const { store } = renderOnPhone(notifier);
    expect(screen.getByText(INVITE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(actions.updateSettings).toHaveBeenCalledExactlyOnceWith({
      reminders: { ...fresh, prompted: true },
    });
    expect(notifier.request).not.toHaveBeenCalled();

    // Saved, so it is not offered again.
    act(() => store.setState({ data: dataWith({ ...fresh, prompted: true }) }));
    expect(screen.queryByText(INVITE)).not.toBeInTheDocument();
  });

  it('does not offer reminders on the web, in the demo, or once they are on or answered', () => {
    const web = renderWithStore(
      <MemoryRouter>
        <DashboardScreen />
      </MemoryRouter>,
      createStubStore({ data: dataWith(fresh), today: '2026-10-14' }),
    );
    expect(screen.queryByText(INVITE)).not.toBeInTheDocument();
    web.unmount();

    const cases: Array<[ReminderSettings, 'real' | 'demo']> = [
      [fresh, 'demo'],
      [{ ...fresh, enabled: true }, 'real'],
      [{ ...fresh, prompted: true }, 'real'],
      [{ ...fresh, enabled: true, prompted: true }, 'real'],
    ];
    for (const [reminders, namespace] of cases) {
      const view = renderOnPhone(fakeNotifier(), reminders, namespace);
      expect(screen.queryByText(INVITE)).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('asks Android on Turn on, then saves reminders as on', async () => {
    const notifier = fakeNotifier();
    renderOnPhone(notifier);

    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(notifier.request).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(actions.updateSettings).toHaveBeenCalledExactlyOnceWith({
        reminders: { ...fresh, enabled: true, prompted: true },
      }),
    );
  });

  it('explains how to unblock notifications when Android refuses, and saves nothing', async () => {
    const notifier = fakeNotifier({ request: async () => false });
    renderOnPhone(notifier);

    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();
    expect(actions.updateSettings).not.toHaveBeenCalled();
    // Still on offer: they can fix it in Android's settings and try again, or dismiss it.
    expect(screen.getByText(INVITE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });
});

describe('DashboardScreen game layer', () => {
  it('shows the HUD and up to three quests on Home', () => {
    renderDashboard(emptySnapshot(), '2026-10-14');

    // Directly under the page header.
    const hud = screen.getByRole('link', { name: /Open quests$/ });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Home' }).closest('header'),
    ).toHaveProperty('nextElementSibling', hud);
    expect(hud).toHaveAttribute('href', '/quests');
    expect(within(hud).getByText('LV 1')).toBeInTheDocument();

    const quests = region('Quests');
    expect(within(quests).getByRole('link', { name: 'See all' })).toHaveAttribute(
      'href',
      '/quests',
    );
    expect(
      within(quests)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('p')?.textContent),
    ).toEqual(["Log today's spending", 'Do your weekly check-in', 'Back up your data']);
  });

  it('puts the quests still to do first, daily before weekly before monthly', () => {
    const data = emptySnapshot();
    data.tables.profile = [makeProfile()];
    data.tables.budgetLimit = [makeLimit()];
    data.tables.checkIn = [makeCheckIn({ kind: 'no-spend', date: '2026-10-14' })];
    renderDashboard(data, '2026-10-14');

    // Five quests apply and today's is done: it drops out of the three shown.
    const rows = within(region('Quests')).getAllByRole('listitem');
    expect(rows.map((li) => li.querySelector('p')?.textContent)).toEqual([
      'Stay within your limits this week',
      'Do your weekly check-in',
      "Reconcile this month's salary",
    ]);
  });

  it('works out the game once for the HUD and the quests together', () => {
    vi.mocked(computeGameView).mockClear();
    renderDashboard(emptySnapshot(), '2026-10-14');
    expect(computeGameView).toHaveBeenCalledTimes(1);
  });

  it('records Nothing spent from Home', async () => {
    const { store } = renderDashboard(emptySnapshot(), '2026-10-14');
    await userEvent.click(within(region('Quests')).getByRole('button', { name: 'Nothing spent' }));
    expect(store.getState().put).toHaveBeenCalledExactlyOnceWith(
      'checkIn',
      expect.objectContaining({ id: 'checkin:no-spend:2026-10-14', kind: 'no-spend' }),
    );
  });
});
