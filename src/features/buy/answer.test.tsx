import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuyDecision, ReminderSettings } from '@/domain/entities';
import type { Notifier } from '@/platform/types';
import { Toaster } from '@/components/ui/Toaster';
import { formatMoney } from '@/domain/money';
import { formatDay } from '@/lib/format';
import { renderWithStore } from '@/test/appStoreStub';
import { expectHelpTip } from '@/test/helpTip';
import { fakeNotifier, onPhone } from '@/test/fakeNotifier';
import { makeBuyAsk, makeBuyDecision, makeLimit, makeProfile, makeSettings } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { AnswerScreen } from './AnswerScreen';

const usd = (minor: number) => formatMoney(minor, 'USD');
const months = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Shows what Add Expense is handed. */
function AddProbe() {
  return <p>Add expense: {JSON.stringify(useLocation().state)}</p>;
}

/**
 * A real store (today is Oct 14, 2026), so each button really changes the decision. It runs as
 * the web does unless a `notifier` is given: the phone, which can schedule reminders.
 */
async function renderAnswer(
  decision: BuyDecision,
  path = `/buy/${decision.id}`,
  notifier: Notifier | null = null,
) {
  const { store } = await freshRealStore();
  await store.getState().put('profile', makeProfile({ currency: 'USD' }));
  await store.getState().put('buyDecision', decision);
  const router = createMemoryRouter(
    [
      { path: '/buy', element: <p>Buy list</p> },
      { path: '/buy/:id', element: <AnswerScreen /> },
      { path: '/add', element: <AddProbe /> },
    ],
    { initialEntries: [path] },
  );
  renderWithStore(
    onPhone(
      notifier,
      <>
        <RouterProvider router={router} />
        <Toaster />
      </>,
    ),
    store,
  );
  const saved = () => store.getState().data.tables.buyDecision.find((d) => d.id === decision.id)!;
  return { store, router, saved };
}

/** $396 of a $300 Fun limit, $3,233 left, a 2.1 → 2.0 month fund and a Bike goal 9 days later. */
const full = (overrides: Partial<BuyDecision> = {}) =>
  makeBuyDecision({
    id: 'a',
    ask: makeBuyAsk({
      item: 'Noise-cancelling headphones',
      price: 249_00,
      category: 'entertainment',
    }),
    facts: {
      total: 249_00,
      categoryAfter: { limit: 300_00, spentAfter: 396_00, pct: 132 },
      overallAfter: null,
      overBy: 96_00,
      availableAfter: 3233_00,
      emergencyBefore: 2.06,
      emergencyAfter: 2.04,
      goalDelay: { name: 'Bike', days: 9 },
      requiresDebt: false,
      resetsOn: '2026-11-01',
    },
    meter: 38,
    rulesMeter: 38,
    verdict: 'wait',
    rulesVerdict: 'wait',
    confidence: 'medium',
    ...overrides,
  });

describe('the answer', () => {
  it('names the item and what it costs, and links back to the list', async () => {
    await renderAnswer(full());
    expect(
      screen.getByRole('heading', { level: 1, name: 'Noise-cancelling headphones' }),
    ).toBeInTheDocument();
    expect(screen.getByText(usd(249_00))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Buy it?' })).toHaveAttribute('href', '/buy');
  });

  it('shows several of them as a sum', async () => {
    await renderAnswer(
      full({
        ask: makeBuyAsk({ item: 'Mugs', price: 12_50, quantity: 3 }),
        facts: { ...full().facts, total: 37_50 },
      }),
    );
    expect(screen.getByText(`3 × ${usd(12_50)} = ${usd(37_50)}`)).toBeInTheDocument();
  });

  it('shows the buy meter, the verdict and how sure it is', async () => {
    await renderAnswer(full());
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', '38% a buy, Wait zone');
    expect(screen.getByText('Wait a few days')).toBeInTheDocument();
    expect(screen.getByText('· confidence medium')).toBeInTheDocument();
  });

  it('explains the buy meter, beside its label', async () => {
    await renderAnswer(full());
    await expectHelpTip(document.body, 'the buy meter', 'buy-it');
  });

  it('names the meter once: the caption above it is for the eye, and sits 4px from the "?"', async () => {
    await renderAnswer(full());
    // The meter and the "?" already carry the name, so a screen reader skips the drawn caption.
    const caption = screen.getByText('Buy meter');
    expect(caption).toHaveAttribute('aria-hidden', 'true');
    expect(caption.parentElement).toHaveClass('gap-1');
    expect(screen.getByRole('meter', { name: 'Buy meter' })).toBeInTheDocument();
    expect(screen.getAllByText('Buy meter')).toHaveLength(1);
  });

  it.each([
    ['buy', 'Buy it'],
    ['wait', 'Wait a few days'],
    ['cheaper', 'Look for a cheaper one'],
    ['skip', 'Skip it'],
  ] as const)('says %s as "%s"', async (verdict, words) => {
    await renderAnswer(full({ verdict }));
    // The decide button below says "Skip it" too: the verdict is the span.
    expect(screen.getByText(words, { selector: 'span' })).toBeInTheDocument();
  });

  it('lays out the facts, with how far over the limit', async () => {
    await renderAnswer(full());
    const facts = screen.getByRole('list', { name: 'The facts' });
    const row = (key: string) => within(facts).getByText(key).parentElement!;
    expect(row('Fun limit after')).toHaveTextContent(`132% · over by ${usd(96_00)}`);
    expect(row('Available after')).toHaveTextContent(usd(3233_00));
    expect(row('Emergency fund')).toHaveTextContent(
      `${months.format(2.1)} → ${months.format(2)} months`,
    );
    expect(row('Bike goal')).toHaveTextContent('+9 days later');
  });

  it('says nothing is over when the limit still holds, and counts one day as a day', async () => {
    await renderAnswer(
      full({
        facts: {
          ...full().facts,
          categoryAfter: { limit: 300_00, spentAfter: 270_00, pct: 90 },
          overallAfter: { limit: 2000_00, spentAfter: 2000_00, pct: 100 },
          overBy: 0,
          goalDelay: { name: 'Bike', days: 1 },
        },
      }),
    );
    const facts = screen.getByRole('list', { name: 'The facts' });
    expect(within(facts).getByText('Fun limit after').parentElement).toHaveTextContent('90%');
    expect(within(facts).getByText('Overall limit after').parentElement).toHaveTextContent('100%');
    expect(facts).not.toHaveTextContent('over by');
    expect(within(facts).getByText('Bike goal').parentElement).toHaveTextContent('+1 day later');
  });

  it('shows the overall limit when that is the one the purchase goes over', async () => {
    await renderAnswer(
      full({
        facts: {
          ...full().facts,
          categoryAfter: null,
          overallAfter: { limit: 1000_00, spentAfter: 1100_00, pct: 110 },
        },
      }),
    );
    const facts = screen.getByRole('list', { name: 'The facts' });
    expect(within(facts).getByText('Overall limit after').parentElement).toHaveTextContent(
      `110% · over by ${usd(100_00)}`,
    );
    expect(within(facts).queryByText('Fun limit after')).not.toBeInTheDocument();
  });

  it('leaves out each fact it does not have', async () => {
    await renderAnswer(makeBuyDecision({ id: 'a' }));
    const facts = screen.getByRole('list', { name: 'The facts' });
    expect(within(facts).getAllByRole('listitem')).toHaveLength(1);
    expect(within(facts).getByText('Available after').parentElement).toHaveTextContent(usd(400_00));
    expect(facts).not.toHaveTextContent(/limit after|Emergency fund|goal/);
  });

  it('shows why the meter was held at Wait', async () => {
    await renderAnswer(
      full({
        guards: {
          capAtWait: true,
          reasons: ["Needs money you don't have", 'Leaves your available balance below zero'],
        },
      }),
    );
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent("Needs money you don't have");
    expect(banner).toHaveTextContent('Leaves your available balance below zero');
    expect(banner).toHaveClass('from-warning-from');
  });

  it('shows no warning when nothing held the meter', async () => {
    await renderAnswer(full());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the notes as muted lines', async () => {
    await renderAnswer(
      full({
        notes: [
          'You said you tend to overspend on Fun.',
          'You said: a house deposit by 2028',
          'You said: my old pair broke',
        ],
      }),
    );
    for (const note of [
      'You said you tend to overspend on Fun.',
      'You said: a house deposit by 2028',
      'You said: my old pair broke',
    ]) {
      expect(screen.getByText(note)).toHaveClass('text-muted');
    }
  });

  it('always ends with the disclaimer', async () => {
    await renderAnswer(full());
    expect(screen.getByText('Not financial advice')).toBeInTheDocument();
  });

  it('sends a decision that is gone back to the list', async () => {
    await renderAnswer(full(), '/buy/nope');
    expect(await screen.findByText('Buy list')).toBeInTheDocument();
  });
});

describe('deciding', () => {
  it('offers the three buttons on a new answer, and no status yet', async () => {
    await renderAnswer(full());
    expect(
      screen.getByRole('button', { name: `Remind me ${formatDay('2026-11-01')}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I bought it' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip it' })).toBeInTheDocument();
    expect(screen.queryByText(/^Waiting until|^Bought|^Skipped/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Was it worth it?' })).not.toBeInTheDocument();
  });

  it('reminds in two days when no limit starts afresh sooner', async () => {
    await renderAnswer(full({ facts: { ...full().facts, resetsOn: null } }));
    expect(
      screen.getByRole('button', { name: `Remind me ${formatDay('2026-10-16')}` }),
    ).toBeInTheDocument();
  });

  it('waits until the limit starts afresh, and says so, keeping the buttons', async () => {
    const { saved } = await renderAnswer(full());
    await userEvent.click(
      screen.getByRole('button', { name: `Remind me ${formatDay('2026-11-01')}` }),
    );

    expect(await screen.findByText(`Waiting until ${formatDay('2026-11-01')}`)).toBeInTheDocument();
    expect(saved()).toMatchObject({ status: 'waiting', remindOn: '2026-11-01' });
    // A decision to wait can still become a purchase or a skip.
    expect(screen.getByRole('button', { name: 'I bought it' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip it' })).toBeInTheDocument();
  });

  it('skips it, says so, and takes the buttons away', async () => {
    const { saved } = await renderAnswer(full());
    await userEvent.click(screen.getByRole('button', { name: 'Skip it' }));

    expect(await screen.findByText('Skipped')).toBeInTheDocument();
    expect(saved().status).toBe('skipped');
    expect(screen.queryByRole('button', { name: 'I bought it' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remind me/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip it' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Was it worth it?' })).not.toBeInTheDocument();
  });

  it('opens Add Expense filled in when it was bought', async () => {
    const { router, saved } = await renderAnswer(
      full({
        ask: makeBuyAsk({
          item: 'Mugs',
          price: 12_50,
          quantity: 3,
          category: 'shopping',
          payWith: 'credit_card',
          cardId: 'card-1',
        }),
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'I bought it' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/add'));
    expect(router.state.location.state).toEqual({
      prefill: {
        item: 'Mugs',
        amount: 37_50,
        category: 'shopping',
        paymentMethod: 'credit_card',
        cardId: 'card-1',
      },
    });
    expect(saved()).toMatchObject({ status: 'bought', boughtOn: '2026-10-14' });
  });

  it('shows a bought decision as bought, with the rating and no buttons', async () => {
    await renderAnswer(full({ status: 'bought', boughtOn: '2026-10-10' }));
    expect(screen.getByText(`Bought ${formatDay('2026-10-10')}`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I bought it' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remind me/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip it' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Was it worth it?' })).toBeInTheDocument();
  });

  it('shows a skipped decision as skipped', async () => {
    await renderAnswer(full({ status: 'skipped' }));
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I bought it' })).not.toBeInTheDocument();
  });

  it('shows a waiting decision with its day and the buttons', async () => {
    await renderAnswer(full({ status: 'waiting', remindOn: '2026-11-01' }));
    expect(screen.getByText(`Waiting until ${formatDay('2026-11-01')}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I bought it' })).toBeInTheDocument();
  });
});

describe('asking again', () => {
  const waiting = () => full({ status: 'waiting', remindOn: '2026-11-01' });
  const CHECK = { name: 'Check again' };

  it('says the day it was asked, under the heading', async () => {
    await renderAnswer(full({ createdAt: '2026-10-12T12:00:00.000Z' }));
    expect(screen.getByText(`Asked ${formatDay('2026-10-12')}`)).toBeInTheDocument();
  });

  it.each([
    ['open', full()],
    ['waiting', waiting()],
  ])('offers to check a %s decision again', async (_, decision) => {
    await renderAnswer(decision);
    expect(screen.getByRole('button', CHECK)).toBeInTheDocument();
  });

  it.each(['bought', 'skipped'] as const)(
    'does not offer it for one that is %s',
    async (status) => {
      await renderAnswer(full({ status, boughtOn: status === 'bought' ? '2026-10-10' : null }));
      expect(screen.queryByRole('button', CHECK)).not.toBeInTheDocument();
    },
  );

  it('asks the same thing again with the money as it is now, and opens the new answer in its place', async () => {
    const { store, router } = await renderAnswer(waiting());
    // The list is where a person lands if the old answer goes first: it must never show.
    const visited: string[] = [];
    router.subscribe((s) => visited.push(s.location.pathname));
    // Since the first ask a limit has been set for it.
    await store
      .getState()
      .put('budgetLimit', makeLimit({ category: 'entertainment', amount: 100_00 }));

    await userEvent.click(screen.getByRole('button', CHECK));

    await waitFor(() => expect(router.state.location.pathname).not.toBe('/buy/a'));
    const [again, ...rest] = store.getState().data.tables.buyDecision;
    expect(rest).toEqual([]);
    expect(again!.id).not.toBe('a');
    expect(router.state.location.pathname).toBe(`/buy/${again!.id}`);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(visited).not.toContain('/buy');
    expect(again).toMatchObject({
      ask: waiting().ask,
      status: 'open',
      remindOn: null,
      facts: { categoryAfter: { limit: 100_00 } },
    });
    // The new answer is the one on screen: open, so not waiting, and checkable again.
    expect(await screen.findByRole('button', CHECK)).toBeEnabled();
    expect(screen.queryByText(/^Waiting until/)).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'The facts' })).toHaveTextContent('Fun limit after');
  });

  it('keeps the old answer, and says why, when the new one cannot be saved', async () => {
    const { store, router, saved } = await renderAnswer(waiting());
    vi.spyOn(store.getState(), 'putMany').mockRejectedValue(new Error('Storage is full'));
    vi.spyOn(store.getState(), 'put').mockRejectedValue(new Error('Storage is full'));

    await userEvent.click(screen.getByRole('button', CHECK));

    expect(await screen.findByText('Storage is full')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/buy/a');
    expect(store.getState().data.tables.buyDecision).toHaveLength(1);
    expect(saved()).toMatchObject({ status: 'waiting', remindOn: '2026-11-01' });
    expect(screen.getByRole('button', CHECK)).toBeEnabled();
    expect(screen.getByText(`Waiting until ${formatDay('2026-11-01')}`)).toBeInTheDocument();
  });
});

describe('when reminders will not come', () => {
  const OFF = /Reminders are off/;
  const waiting = () => full({ status: 'waiting', remindOn: '2026-11-01' });
  /** A waiting decision on the phone, with the reminder settings the person saved. */
  async function renderWaiting(
    reminders: Partial<ReminderSettings>,
    notifier: Notifier | null = fakeNotifier(),
  ) {
    const view = await renderAnswer(waiting(), undefined, notifier);
    const { reminders: saved } = makeSettings();
    await view.store
      .getState()
      .put('settings', makeSettings({ reminders: { ...saved, ...reminders } }));
    return view;
  }

  it('says so under the status when reminders are off, with a way to Settings', async () => {
    await renderWaiting({ enabled: false, buyIt: true });
    const settings = await screen.findByRole('link', { name: 'Settings' });
    expect(settings).toHaveAttribute('href', '/settings');
    expect(settings.parentElement).toHaveTextContent(
      'Reminders are off. Turn them on in Settings.',
    );
    expect(screen.getByText(`Waiting until ${formatDay('2026-11-01')}`)).toBeInTheDocument();
  });

  it('says so when the Buy it? switch is off', async () => {
    await renderWaiting({ enabled: true, buyIt: false });
    expect(await screen.findByText(OFF)).toBeInTheDocument();
  });

  it('says nothing when reminders and the Buy it? switch are both on', async () => {
    await renderWaiting({ enabled: true, buyIt: true });
    expect(screen.getByText(`Waiting until ${formatDay('2026-11-01')}`)).toBeInTheDocument();
    expect(screen.queryByText(OFF)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('says they only come on the phone where the device cannot schedule them, with no Settings link', async () => {
    await renderWaiting({ enabled: true, buyIt: true }, null);
    expect(await screen.findByText('Reminders only come on the phone.')).toBeInTheDocument();
    expect(screen.queryByText(OFF)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it("says they don't come on demo money, with no Settings link", async () => {
    const { store } = await renderWaiting({ enabled: true, buyIt: true });
    store.setState({ namespace: 'demo' });
    expect(await screen.findByText("Reminders don't come on demo money.")).toBeInTheDocument();
    expect(screen.queryByText(OFF)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('says nothing on a decision that is not waiting', async () => {
    const view = await renderAnswer(full(), undefined, fakeNotifier());
    await view.store.getState().put('settings', makeSettings());
    expect(screen.queryByText(OFF)).not.toBeInTheDocument();
  });

  it('shows up once "Remind me" is pressed with reminders off', async () => {
    await renderAnswer(full(), undefined, fakeNotifier());
    expect(screen.queryByText(OFF)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Remind me/ }));
    expect(await screen.findByText(OFF)).toBeInTheDocument();
  });
});

describe('rating what was bought', () => {
  it('asks "Was it worth it?" from 1 to 5, and keeps the choice', async () => {
    const { saved } = await renderAnswer(full({ status: 'bought', boughtOn: '2026-10-10' }));
    const rating = screen.getByRole('group', { name: 'Was it worth it?' });
    expect(
      within(rating)
        .getAllByRole('radio')
        .map((r) => r.getAttribute('value')),
    ).toEqual(['1', '2', '3', '4', '5']);
    expect(within(rating).queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(screen.getByText('Rate it from 1 (not at all) to 5 (a lot).')).toBeInTheDocument();

    await userEvent.click(within(rating).getByRole('radio', { name: '4' }));
    await waitFor(() => expect(saved().usage).toBe(4));
    expect(within(rating).getByRole('radio', { name: '4' })).toBeChecked();

    await userEvent.click(within(rating).getByRole('radio', { name: '2' }));
    await waitFor(() => expect(saved().usage).toBe(2));
    expect(within(rating).getByRole('radio', { name: '2' })).toBeChecked();
  });

  it('makes each rating a touch target at least 44px wide, its number centred', async () => {
    await renderAnswer(full({ status: 'bought', boughtOn: '2026-10-10' }));
    const rating = screen.getByRole('group', { name: 'Was it worth it?' });
    const options = within(rating).getAllByRole('radio');
    expect(options).toHaveLength(5);
    for (const option of options) {
      expect(option.parentElement).toHaveClass('min-w-11', 'min-h-11', 'justify-center');
    }
  });

  it('starts on the rating already given', async () => {
    await renderAnswer(full({ status: 'bought', boughtOn: '2026-10-10', usage: 5 }));
    expect(screen.getByRole('radio', { name: '5' })).toBeChecked();
  });
});

describe('with no network', () => {
  beforeEach(() => {
    // The price service is on, and the network is down: only the link fill could ever reach for it.
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'test-token');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('lets a decision be reminded, bought and rated, without a request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const { router, saved } = await renderAnswer(full());

    await userEvent.click(screen.getByRole('button', { name: /^Remind me/ }));
    await waitFor(() => expect(saved().status).toBe('waiting'));
    await userEvent.click(screen.getByRole('button', { name: 'I bought it' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/add'));
    expect(saved().status).toBe('bought');

    await router.navigate(-1);
    await userEvent.click(await screen.findByRole('radio', { name: '3' }));
    await waitFor(() => expect(saved().usage).toBe(3));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets a decision be skipped, without a request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const { saved } = await renderAnswer(full());
    await userEvent.click(screen.getByRole('button', { name: 'Skip it' }));
    await waitFor(() => expect(saved().status).toBe('skipped'));
    expect(fetch).not.toHaveBeenCalled();
  });
});
