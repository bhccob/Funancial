import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { formatMoney } from '@/domain/money';
import { formatDay } from '@/lib/format';
import type { BuyDecision } from '@/domain/entities';
import { toastStore } from '@/lib/toast';
import { MarketError, market } from '@/services/market';
import { BUY_MESSAGES } from '@/store/buyActions';
import { renderWithStore } from '@/test/appStoreStub';
import { makeBuyAsk, makeBuyDecision, makeDebt, makeProfile } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { AnswerScreen } from './AnswerScreen';
import { BuyScreen } from './BuyScreen';

const usd = (minor: number) => formatMoney(minor, 'USD');
const LINK = 'Paste a link (fills name and price)';
const COULDNT_READ = "Couldn't read that link. Fill it in yourself.";
const SHOP = 'https://shop.test/trail-shoes';

beforeEach(() => {
  toastStore.setState({ toasts: [] });
  // The Ask form's own checks never need the network; a test that does turns the price service on.
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** A real store (USD, a Visa, today Oct 14, 2026) behind the list and the answer, so Ask really answers. */
async function renderBuy(decisions: BuyDecision[] = []) {
  const { store } = await freshRealStore();
  await store.getState().put('profile', makeProfile({ currency: 'USD' }));
  await store.getState().put('debt', makeDebt({ id: 'card-1', name: 'Visa', kind: 'credit_card' }));
  for (const d of decisions) await store.getState().put('buyDecision', d);
  const router = createMemoryRouter(
    [
      { path: '/buy', element: <BuyScreen /> },
      { path: '/buy/:id', element: <AnswerScreen /> },
    ],
    { initialEntries: ['/buy'] },
  );
  renderWithStore(
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>,
    store,
  );
  return { store, router, decisions: () => store.getState().data.tables.buyDecision };
}

async function enter(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await userEvent.clear(field);
  if (text) await userEvent.type(field, text);
}

/** A long text goes in at once instead of key by key. */
async function pasteInto(label: string, text: string) {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.paste(text);
}

const ask = () => userEvent.click(screen.getByRole('button', { name: 'Ask' }));

describe('the Ask form', () => {
  it('is a form on line fields, ready for the usual ask', async () => {
    await renderBuy();
    expect(screen.getByRole('heading', { level: 1, name: 'Should I buy it?' })).toBeInTheDocument();

    for (const label of [LINK, 'What is it?', 'Price', 'Why do you want it? (optional)']) {
      expect(screen.getByLabelText(label)).toHaveClass('border-b', 'font-extrabold');
    }
    expect(screen.getByLabelText('Quantity')).toHaveValue('1');
    expect(screen.getByLabelText('Category')).toHaveValue('shopping');
    expect(screen.getByLabelText('Pay with')).toHaveValue('cash');
    expect(
      within(screen.getByLabelText('Pay with'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Cash', 'Debit card', 'Visa', 'Other']);
    expect(screen.getByRole('radio', { name: 'Want' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'This month' })).toBeChecked();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual([
      'need',
      'want',
      'treat',
      'today',
      'month',
      'norush',
    ]);
    expect(screen.getByRole('group', { name: 'How soon?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
    expect(screen.getByText('Your numbers stay on your phone.')).toBeInTheDocument();
  });

  it('steps the quantity with a - and a +', async () => {
    await renderBuy();
    const fewer = screen.getByRole('button', { name: 'Fewer items' });
    const more = screen.getByRole('button', { name: 'More items' });
    expect(fewer).toBeDisabled();
    await userEvent.click(more);
    await userEvent.click(more);
    expect(screen.getByLabelText('Quantity')).toHaveValue('3');
    await userEvent.click(fewer);
    expect(screen.getByLabelText('Quantity')).toHaveValue('2');
  });

  it('asks, and opens the answer', async () => {
    const { router, decisions } = await renderBuy();
    await enter('What is it?', '  Noise-cancelling headphones ');
    await enter('Price', '249');
    await userEvent.click(screen.getByRole('button', { name: 'More items' }));
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Fun');
    await userEvent.selectOptions(screen.getByLabelText('Pay with'), 'Visa');
    await enter('Why do you want it? (optional)', ' My old pair broke ');
    await userEvent.click(screen.getByRole('radio', { name: 'Treat' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Today' }));
    await ask();

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/buy\/.+/));
    expect(decisions()).toHaveLength(1);
    const [decision] = decisions();
    expect(decision!.ask).toEqual({
      item: 'Noise-cancelling headphones',
      price: 249_00,
      quantity: 2,
      category: 'entertainment',
      urgency: 'treat',
      howSoon: 'today',
      payWith: 'credit_card',
      cardId: 'card-1',
      link: null,
      why: 'My old pair broke',
    });
    expect(router.state.location.pathname).toBe(`/buy/${decision!.id}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Noise-cancelling headphones' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('meter')).toBeInTheDocument();
    expect(screen.getByText('You said: My old pair broke')).toBeInTheDocument();
  });

  it('says what is missing under each field, and asks nothing', async () => {
    const { decisions } = await renderBuy();
    await ask();

    expect(screen.getByLabelText('What is it?')).toHaveAccessibleDescription(BUY_MESSAGES.item);
    expect(screen.getByLabelText('Price')).toHaveAccessibleDescription(BUY_MESSAGES.price);
    expect(screen.getByLabelText('Quantity')).not.toBeInvalid();
    expect(decisions()).toHaveLength(0);
  });

  it('clears a message once the field is changed', async () => {
    await renderBuy();
    await ask();
    await enter('What is it?', 'Shoes');
    expect(screen.queryByText(BUY_MESSAGES.item)).not.toBeInTheDocument();
    expect(screen.getByText(BUY_MESSAGES.price)).toBeInTheDocument();
  });

  it.each([
    ['0', BUY_MESSAGES.price],
    ['10000001', BUY_MESSAGES.priceTooHigh('USD')],
  ])('refuses a price of %s', async (text, message) => {
    const { decisions } = await renderBuy();
    await enter('What is it?', 'Yacht');
    await enter('Price', text);
    await ask();
    expect(screen.getByLabelText('Price')).toHaveAccessibleDescription(message);
    expect(decisions()).toHaveLength(0);
  });

  it('takes the highest price it allows', async () => {
    const { decisions } = await renderBuy();
    await enter('What is it?', 'Yacht');
    await enter('Price', '10000000');
    await ask();
    await waitFor(() => expect(decisions()).toHaveLength(1));
    expect(decisions()[0]!.ask.price).toBe(1_000_000_000);
  });

  it.each(['0', '100', '1.5', 'abc', ''])('refuses a quantity of "%s"', async (text) => {
    const { decisions } = await renderBuy();
    await enter('What is it?', 'Mug');
    await enter('Price', '5');
    await enter('Quantity', text);
    await ask();
    expect(screen.getByLabelText('Quantity')).toHaveAccessibleDescription(BUY_MESSAGES.quantity);
    expect(decisions()).toHaveLength(0);
  });

  it('refuses a name or a reason that is too long, and a link', async () => {
    const { decisions } = await renderBuy();
    await pasteInto('What is it?', 'x'.repeat(81));
    await enter('Price', '5');
    await pasteInto('Why do you want it? (optional)', 'y'.repeat(201));
    await pasteInto(LINK, `https://shop.test/${'z'.repeat(2040)}`);
    await ask();

    expect(screen.getByLabelText('What is it?')).toHaveAccessibleDescription(BUY_MESSAGES.item);
    expect(screen.getByLabelText('Why do you want it? (optional)')).toHaveAccessibleDescription(
      BUY_MESSAGES.why,
    );
    expect(screen.getByLabelText(LINK)).toHaveAccessibleDescription(BUY_MESSAGES.link);
    expect(decisions()).toHaveLength(0);
  });

  it('accepts a name and a reason at their limits', async () => {
    const { decisions } = await renderBuy();
    await pasteInto('What is it?', 'x'.repeat(80));
    await enter('Price', '5');
    await pasteInto('Why do you want it? (optional)', 'y'.repeat(200));
    await ask();
    await waitFor(() => expect(decisions()).toHaveLength(1));
  });
});

describe('the link fill', () => {
  const found = { name: 'Trail shoes', price: 89.5, currency: 'USD' };

  beforeEach(() => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'test-token');
  });

  it('fills the name and the price from a pasted link', async () => {
    const fetchExtract = vi.spyOn(market, 'fetchExtract').mockResolvedValue(found);
    const { decisions } = await renderBuy();
    await pasteInto(LINK, SHOP);

    await waitFor(() => expect(screen.getByLabelText('What is it?')).toHaveValue('Trail shoes'));
    expect(screen.getByLabelText('Price')).toHaveValue('89.50');
    expect(fetchExtract).toHaveBeenCalledTimes(1);
    expect(fetchExtract).toHaveBeenCalledWith(SHOP);
    expect(screen.queryByText(COULDNT_READ)).not.toBeInTheDocument();

    // What was filled is what is asked, with the link kept.
    await ask();
    await waitFor(() => expect(decisions()).toHaveLength(1));
    expect(decisions()[0]!.ask).toMatchObject({
      item: 'Trail shoes',
      price: 89_50,
      link: SHOP,
    });
  });

  it('reads a link on leaving the field, and only once when it was pasted', async () => {
    const fetchExtract = vi.spyOn(market, 'fetchExtract').mockResolvedValue(found);
    await renderBuy();
    await userEvent.type(screen.getByLabelText(LINK), SHOP);
    expect(fetchExtract).not.toHaveBeenCalled();
    await userEvent.tab();
    await waitFor(() => expect(screen.getByLabelText('What is it?')).toHaveValue('Trail shoes'));

    // Leaving it again, unchanged, asks nothing more.
    await userEvent.click(screen.getByLabelText(LINK));
    await userEvent.tab();
    expect(fetchExtract).toHaveBeenCalledTimes(1);
  });

  it('keeps what the person already wrote', async () => {
    vi.spyOn(market, 'fetchExtract').mockResolvedValue(found);
    await renderBuy();
    await enter('What is it?', 'My shoes');
    await pasteInto(LINK, SHOP);
    await waitFor(() => expect(screen.getByLabelText('Price')).toHaveValue('89.50'));
    expect(screen.getByLabelText('What is it?')).toHaveValue('My shoes');
  });

  it('keeps a price already entered, and fills the name', async () => {
    vi.spyOn(market, 'fetchExtract').mockResolvedValue(found);
    await renderBuy();
    await enter('Price', '70');
    await pasteInto(LINK, SHOP);
    await waitFor(() => expect(screen.getByLabelText('What is it?')).toHaveValue('Trail shoes'));
    expect(screen.getByLabelText('Price')).toHaveValue('70.00');
  });

  it('fills the one the page gave when it gave only one', async () => {
    vi.spyOn(market, 'fetchExtract').mockResolvedValue({ name: null, price: 12, currency: null });
    await renderBuy();
    await pasteInto(LINK, SHOP);
    await waitFor(() => expect(screen.getByLabelText('Price')).toHaveValue('12.00'));
    expect(screen.getByLabelText('What is it?')).toHaveValue('');
  });

  it('cuts a page title that is longer than a name can be', async () => {
    vi.spyOn(market, 'fetchExtract').mockResolvedValue({
      name: 'Trail '.repeat(30),
      price: null,
      currency: null,
    });
    await renderBuy();
    await pasteInto(LINK, SHOP);
    await waitFor(() =>
      expect(screen.getByLabelText('What is it?')).toHaveValue(
        'Trail '.repeat(30).slice(0, 80).trim(),
      ),
    );
  });

  it('leaves a price in another currency for the person to enter', async () => {
    vi.spyOn(market, 'fetchExtract').mockResolvedValue({
      name: 'Boots',
      price: 80,
      currency: 'EUR',
    });
    await renderBuy();
    await pasteInto(LINK, SHOP);
    await waitFor(() => expect(screen.getByLabelText('What is it?')).toHaveValue('Boots'));
    expect(screen.getByLabelText('Price')).toHaveValue('');
    expect(screen.getByLabelText('Price')).toHaveAccessibleDescription(
      'The page lists EUR. Enter the price in USD.',
    );
  });

  it("says it couldn't read the link, quietly, and the form still works", async () => {
    vi.spyOn(market, 'fetchExtract').mockRejectedValue(new MarketError());
    const { decisions } = await renderBuy();
    await pasteInto(LINK, SHOP);

    expect(await screen.findByText(COULDNT_READ)).toBeInTheDocument();
    expect(screen.getByLabelText(LINK)).toBeValid();
    expect(screen.getByLabelText('What is it?')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await enter('What is it?', 'Trail shoes');
    await enter('Price', '89.50');
    await ask();
    await waitFor(() => expect(decisions()).toHaveLength(1));
    expect(decisions()[0]!.ask).toMatchObject({ item: 'Trail shoes', price: 89_50, link: SHOP });
  });

  it('says so for a page with nothing to read', async () => {
    vi.spyOn(market, 'fetchExtract').mockResolvedValue({ name: null, price: null, currency: null });
    await renderBuy();
    await pasteInto(LINK, SHOP);
    expect(await screen.findByText(COULDNT_READ)).toBeInTheDocument();
  });

  it('says so without asking when there is no price service', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
    const fetchExtract = vi.spyOn(market, 'fetchExtract');
    await renderBuy();
    await pasteInto(LINK, SHOP);
    expect(await screen.findByText(COULDNT_READ)).toBeInTheDocument();
    expect(fetchExtract).not.toHaveBeenCalled();
  });

  it('forgets the message when the link is read again, and when it is cleared', async () => {
    const fetchExtract = vi
      .spyOn(market, 'fetchExtract')
      .mockRejectedValueOnce(new MarketError())
      .mockResolvedValue(found);
    await renderBuy();
    await pasteInto(LINK, SHOP);
    expect(await screen.findByText(COULDNT_READ)).toBeInTheDocument();

    await enter(LINK, 'https://shop.test/other');
    await userEvent.tab();
    await waitFor(() => expect(screen.getByLabelText('What is it?')).toHaveValue('Trail shoes'));
    expect(screen.queryByText(COULDNT_READ)).not.toBeInTheDocument();
    expect(fetchExtract).toHaveBeenCalledTimes(2);
  });

  it('ignores the answer for a link that was replaced while it was out', async () => {
    let first!: (r: typeof found) => void;
    vi.spyOn(market, 'fetchExtract')
      .mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
      .mockResolvedValue({ name: 'Second', price: 20, currency: 'USD' });
    await renderBuy();
    await pasteInto(LINK, SHOP);
    await enter(LINK, 'https://shop.test/second');
    await userEvent.tab();
    await waitFor(() => expect(screen.getByLabelText('What is it?')).toHaveValue('Second'));

    first(found);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByLabelText('What is it?')).toHaveValue('Second');
    expect(screen.getByLabelText('Price')).toHaveValue('20.00');
  });
});

describe('with no network', () => {
  it('still asks: the link fails quietly and the rest completes, sending only the link', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'test-token');
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { router, decisions } = await renderBuy();
    await pasteInto(LINK, SHOP);
    expect(await screen.findByText(COULDNT_READ)).toBeInTheDocument();

    await enter('What is it?', 'Trail shoes');
    await enter('Price', '89.50');
    await enter('Why do you want it? (optional)', 'For the hike');
    await ask();

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/buy\/.+/));
    expect(decisions()).toHaveLength(1);
    expect(await screen.findByRole('meter')).toBeInTheDocument();
    // The one request carried the link alone: nothing else about the person went out, and
    // the ask itself made none.
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = fetch.mock.calls[0]!;
    expect(String(url)).toContain('/api/extract?url=');
    expect(String(url)).not.toMatch(/Trail%20shoes|89|hike/);
  });

  it('asks without a link at all, and makes no request', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'test-token');
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const { decisions } = await renderBuy();
    await enter('What is it?', 'Mug');
    await enter('Price', '9');
    await ask();
    await waitFor(() => expect(decisions()).toHaveLength(1));
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('past asks', () => {
  const headphones = makeBuyDecision({
    id: 'a',
    createdAt: '2026-10-10T09:00:00.000Z',
    ask: makeBuyAsk({ item: 'Headphones', price: 100_00, quantity: 2 }),
    facts: { ...makeBuyDecision().facts, total: 200_00 },
    meter: 38,
    verdict: 'wait',
    status: 'waiting',
    remindOn: '2026-11-01',
  });
  const mug = makeBuyDecision({
    id: 'b',
    createdAt: '2026-10-12T09:00:00.000Z',
    ask: makeBuyAsk({ item: 'Mug', price: 9_00 }),
    facts: { ...makeBuyDecision().facts, total: 9_00 },
    meter: 81,
    verdict: 'buy',
    status: 'bought',
    boughtOn: '2026-10-13',
  });
  const watch = makeBuyDecision({
    id: 'c',
    createdAt: '2026-10-08T09:00:00.000Z',
    ask: makeBuyAsk({ item: 'Watch', price: 500_00 }),
    facts: { ...makeBuyDecision().facts, total: 500_00 },
    meter: 12,
    verdict: 'skip',
    status: 'skipped',
  });
  const lamp = makeBuyDecision({
    id: 'd',
    createdAt: '2026-10-01T09:00:00.000Z',
    ask: makeBuyAsk({ item: 'Lamp', price: 30_00 }),
    facts: { ...makeBuyDecision().facts, total: 30_00 },
    meter: 50,
    verdict: 'cheaper',
    status: 'open',
  });

  it('lists them newest first with what, how much, the meter, the verdict and where it stands', async () => {
    await renderBuy([headphones, watch, lamp, mug]);
    const list = screen.getByRole('list', { name: 'Past asks' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('a')!.getAttribute('href'))).toEqual([
      '/buy/b',
      '/buy/a',
      '/buy/c',
      '/buy/d',
    ]);
    expect(rows[0]).toHaveTextContent('Mug');
    expect(rows[0]).toHaveTextContent(`${usd(9_00)} · Buy it · Bought ${formatDay('2026-10-13')}`);
    expect(rows[0]).toHaveTextContent('81%');
    expect(rows[1]).toHaveTextContent('Headphones');
    expect(rows[1]).toHaveTextContent(
      `${usd(200_00)} · Wait a few days · Waiting until ${formatDay('2026-11-01')}`,
    );
    expect(rows[1]).toHaveTextContent('38%');
    expect(rows[2]).toHaveTextContent(`${usd(500_00)} · Skip it · Skipped`);
    expect(rows[3]).toHaveTextContent(`${usd(30_00)} · Look for a cheaper one · Not decided`);
  });

  it('shows no list before anything is asked', async () => {
    await renderBuy();
    expect(screen.queryByRole('list', { name: 'Past asks' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Past asks' })).not.toBeInTheDocument();
  });

  it('opens the answer for one', async () => {
    const { router } = await renderBuy([mug]);
    await userEvent.click(screen.getByRole('link', { name: /Mug/ }));
    expect(router.state.location.pathname).toBe('/buy/b');
    expect(await screen.findByRole('heading', { level: 1, name: 'Mug' })).toBeInTheDocument();
  });

  it('shows a new ask in the list once back from the answer', async () => {
    const { router } = await renderBuy([mug]);
    await enter('What is it?', 'Lamp');
    await enter('Price', '30');
    await ask();
    await screen.findByRole('meter');
    await userEvent.click(screen.getByRole('link', { name: 'Back to Buy it?' }));
    expect(router.state.location.pathname).toBe('/buy');
    const rows = within(screen.getByRole('list', { name: 'Past asks' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Lamp');
  });

  it('deletes one after asking first', async () => {
    const { decisions } = await renderBuy([mug, watch]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Mug' }));

    const dialog = screen.getByRole('dialog', { name: 'Delete this check?' });
    expect(dialog).toHaveTextContent('Mug will be removed from your list.');
    expect(decisions()).toHaveLength(2);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(decisions().map((d) => d.id)).toEqual(['c']));
    expect(await screen.findByText('Deleted.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Mug/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Watch/ })).toBeInTheDocument();
  });

  it('keeps it when the delete is cancelled', async () => {
    const { decisions } = await renderBuy([mug]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Mug' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete this check?' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(decisions()).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Mug/ })).toBeInTheDocument();
  });
});
