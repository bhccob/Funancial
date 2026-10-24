import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Subscription } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { emptySnapshot } from '@/domain/snapshot';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { formatDay, formatMonthShort } from '@/lib/format';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { localIso, makeAccount, makeSubscription } from '@/test/fixtures';
import { SubscriptionsScreen } from './SubscriptionsScreen';

const actions = vi.hoisted(() => ({
  saveSubscription: vi.fn(async () => ({})),
  setSubscriptionStatus: vi.fn(async () => {}),
  setSubscriptionAudit: vi.fn(async () => {}),
  deleteSubscription: vi.fn(async () => {}),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => actions,
}));

const TODAY = '2026-10-14';
const usd = (minor: number) => formatMoney(minor, 'USD');

beforeEach(() => Object.values(actions).forEach((a) => a.mockClear()));

const MAIN = makeAccount({ id: 'acct-main', name: 'Main account', order: 0 });
const SAVINGS = makeAccount({
  id: 'acct-savings',
  name: 'Savings',
  kind: 'savings',
  skin: 'mint',
  inAvailable: false,
  order: 1,
});
/** A credit card, paid in full on the 21st unless the terms say otherwise. */
const visa = (terms: Partial<NonNullable<Account['credit']>> = {}) =>
  makeAccount({
    id: 'card-1',
    name: 'Visa',
    kind: 'credit',
    skin: 'violet',
    inAvailable: false,
    openingBalance: 230_00,
    openingDate: '2026-09-01',
    order: 2,
    credit: {
      limit: 3_000_00,
      statementDay: 1,
      dueDay: 21,
      payInFull: true,
      minimumPayment: 25_00,
      interestRate: 22.9,
      ...terms,
    },
  });

/** The Visa owes 230.00, due on the 21st; the month's other bill is Streamflix (15.99, 10-17). */
function monthData() {
  const data = emptySnapshot();
  data.tables.account.push(MAIN, SAVINGS, visa());
  data.tables.subscription.push(
    makeSubscription({
      id: 'sub-tv',
      name: 'Streamflix',
      amount: 15_99,
      nextRenewal: '2026-10-17',
    }),
    makeSubscription({
      id: 'sub-cloud',
      name: 'Cloud Drive',
      amount: 120_00,
      cycle: 'yearly',
      nextRenewal: '2027-03-01',
      accountId: 'card-1',
    }),
    makeSubscription({ id: 'sub-mag', name: 'Old Magazine', status: 'cancelled' }),
  );
  return data;
}

function renderSubs() {
  renderWithStore(
    <MemoryRouter>
      <SubscriptionsScreen />
    </MemoryRouter>,
    createStubStore({ data: monthData(), today: TODAY }),
  );
}

const row = (name: string) => {
  const item = screen.getByText(name).closest('li');
  if (!item) throw new Error(`no row for ${name}`);
  return within(item);
};

describe('SubscriptionsScreen', () => {
  it('is Bills & cards, with what is due this month and what the subscriptions cost', () => {
    renderSubs();
    expect(screen.getByRole('heading', { level: 1, name: 'Bills & cards' })).toBeInTheDocument();
    // Streamflix 15.99 and the Visa 230.00.
    expect(screen.getByText(`${usd(245_99)} due this month`)).toBeInTheDocument();
    // 15.99 monthly + 120.00 yearly (10.00 a month)
    expect(
      within(screen.getByRole('region', { name: 'Active' })).getByText(`${usd(25_99)} a month`),
    ).toBeInTheDocument();
  });

  it('adds up the bills Home shows coming up, as both come from the same bills', () => {
    const store = createStubStore({ data: monthData(), today: TODAY });
    const home = renderWithStore(
      <MemoryRouter>
        <DashboardScreen />
      </MemoryRouter>,
      store,
    );
    const comingUp = screen.getByRole('list', { name: 'Coming up' });
    expect(
      within(comingUp)
        .getAllByRole('link')
        .map((bill) => bill.getAttribute('aria-label')),
    ).toEqual(['Streamflix, due in 3 days', 'Visa card payment, due in 7 days']);
    home.unmount();

    renderWithStore(
      <MemoryRouter>
        <SubscriptionsScreen />
      </MemoryRouter>,
      store,
    );
    // 15.99 + 230.00: the two Home showed.
    expect(screen.getByText(`${usd(245_99)} due this month`)).toBeInTheDocument();
  });

  it('lists each card payment above the subscriptions, like Home does', () => {
    renderSubs();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Card payments',
      'Active',
      'Cancelled',
    ]);
    const visa = within(screen.getByRole('region', { name: 'Card payments' })).getByRole('button', {
      name: /Visa/,
    });
    expect(visa).toHaveTextContent(
      `DUE21${formatMonthShort('2026-10-21')}VisaFull balance · in 7 days${usd(230_00)}`,
    );
  });

  it('says "Minimum payment" for a card paid by its minimum', () => {
    const data = monthData();
    data.tables.account = [MAIN, SAVINGS, visa({ payInFull: false, minimumPayment: 25_00 })];
    renderWithStore(
      <MemoryRouter>
        <SubscriptionsScreen />
      </MemoryRouter>,
      createStubStore({ data, today: TODAY }),
    );
    expect(screen.getByRole('button', { name: /Visa/ })).toHaveTextContent(
      `VisaMinimum payment · in 7 days${usd(25_00)}`,
    );
  });

  it('has no Card payments section when no card has a payment coming', () => {
    const data = monthData();
    data.tables.account = [MAIN, SAVINGS];
    renderWithStore(
      <MemoryRouter>
        <SubscriptionsScreen />
      </MemoryRouter>,
      createStubStore({ data, today: TODAY }),
    );
    expect(screen.queryByRole('region', { name: 'Card payments' })).not.toBeInTheDocument();
  });

  it('opens the card sheet from a card payment', async () => {
    renderSubs();
    await userEvent.click(screen.getByRole('button', { name: /Visa/ }));
    const sheet = screen.getByRole('dialog', { name: 'Visa credit card' });
    expect(within(sheet).getByRole('button', { name: 'Pay card' })).toBeEnabled();
    expect(within(sheet).getByRole('button', { name: 'Edit card' })).toBeEnabled();
  });

  it('says when a renewal is close and how each is paid', () => {
    renderSubs();
    expect(
      row('Streamflix').getByText(`${usd(15_99)} / month · Renews in 3 days · Main account`),
    ).toBeInTheDocument();
    expect(
      row('Cloud Drive').getByText(
        `${usd(120_00)} / year · Renews ${formatDay('2027-03-01')} · Visa`,
      ),
    ).toBeInTheDocument();
  });

  it('marks a subscription for review', async () => {
    renderSubs();
    const audit = row('Streamflix').getByRole('group', { name: 'Audit Streamflix' });
    await userEvent.click(within(audit).getByRole('button', { name: 'Review' }));
    expect(actions.setSubscriptionAudit).toHaveBeenCalledWith('sub-tv', 'review');
  });

  describe('a mark that is already set', () => {
    function renderMarked(...subs: Subscription[]) {
      const data = emptySnapshot();
      data.tables.subscription.push(...subs);
      renderWithStore(
        <MemoryRouter>
          <SubscriptionsScreen />
        </MemoryRouter>,
        createStubStore({ data, today: TODAY }),
      );
    }
    const marked = (name: string, audit: Subscription['audit'], auditedAt: string | null) =>
      makeSubscription({ id: name, name, audit, auditedAt, nextRenewal: '2026-10-20' });
    const chip = (name: string, label: string) =>
      within(row(name).getByRole('group', { name: `Audit ${name}` })).getByRole('button', {
        name: label,
      });

    it('stamps a mark from last month again when it is tapped, keeping it', async () => {
      renderMarked(marked('Streamflix', 'keep', localIso('2026-09-20')));
      expect(chip('Streamflix', 'Keep')).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(chip('Streamflix', 'Keep'));
      expect(actions.setSubscriptionAudit).toHaveBeenCalledWith('Streamflix', 'keep');
    });

    it('stamps a mark made before review dates were kept when it is tapped', async () => {
      renderMarked(marked('Streamflix', 'cancel', null));
      await userEvent.click(chip('Streamflix', 'Cancel'));
      expect(actions.setSubscriptionAudit).toHaveBeenCalledWith('Streamflix', 'cancel');
    });

    it('clears a mark stamped this month when it is tapped again', async () => {
      renderMarked(marked('Streamflix', 'review', localIso('2026-10-03')));
      await userEvent.click(chip('Streamflix', 'Review'));
      expect(actions.setSubscriptionAudit).toHaveBeenCalledWith('Streamflix', null);
    });

    it('says when a subscription was reviewed, for a review this month only', () => {
      renderMarked(
        marked('Streamflix', 'keep', localIso('2026-10-03')),
        marked('Cloud Drive', 'keep', localIso('2026-09-30')),
        marked('Gym', 'cancel', null),
      );
      expect(
        row('Streamflix').getByText(`Reviewed ${formatDay('2026-10-03')}`),
      ).toBeInTheDocument();
      expect(row('Cloud Drive').queryByText(/Reviewed/)).not.toBeInTheDocument();
      expect(row('Gym').queryByText(/Reviewed/)).not.toBeInTheDocument();
    });
  });

  it('cancels from the menu, and lists cancelled ones with Resume', async () => {
    renderSubs();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Streamflix' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cancel subscription' }));
    expect(actions.setSubscriptionStatus).toHaveBeenCalledWith('sub-tv', 'cancelled');

    const cancelled = screen.getByRole('region', { name: 'Cancelled' });
    await userEvent.click(within(cancelled).getByRole('button', { name: 'Resume Old Magazine' }));
    expect(actions.setSubscriptionStatus).toHaveBeenCalledWith('sub-mag', 'active');
  });

  it('creates a subscription with exactly what was entered', async () => {
    renderSubs();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a subscription' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'FitHub Gym');
    await userEvent.type(within(dialog).getByLabelText('Amount'), '39');
    fireEvent.change(within(dialog).getByLabelText('Next renewal'), {
      target: { value: '2026-11-02' },
    });
    await userEvent.selectOptions(within(dialog).getByLabelText('Category'), 'Health');
    await userEvent.selectOptions(within(dialog).getByLabelText('Paid with'), 'Visa (credit card)');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.saveSubscription).toHaveBeenCalledWith({
      name: 'FitHub Gym',
      amount: 39_00,
      cycle: 'monthly',
      nextRenewal: '2026-11-02',
      category: 'health',
      accountId: 'card-1',
    });
  });

  it('edits and deletes, keeping past charges', async () => {
    renderSubs();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Cloud Drive' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit subscription' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Cloud Drive');
    expect(within(dialog).getByLabelText('Paid with')).toHaveValue('card-1');
    expect(within(dialog).getByText('Past charges stay in your history.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(actions.deleteSubscription).toHaveBeenCalledWith('sub-cloud');
  });
});

describe('Paid with in the subscription dialog', () => {
  const optionsOf = (dialog: HTMLElement) =>
    within(within(dialog).getByLabelText('Paid with'))
      .queryAllByRole('option')
      .map((o) => o.textContent);

  async function openNew() {
    renderSubs();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    return screen.getByRole('dialog', { name: 'Add a subscription' });
  }

  async function fillIn(dialog: HTMLElement) {
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Newsletter');
    await userEvent.type(within(dialog).getByLabelText('Amount'), '5');
    fireEvent.change(within(dialog).getByLabelText('Next renewal'), {
      target: { value: '2026-11-02' },
    });
  }

  it('lists the accounts in use, a credit card as one, and starts on the default account', async () => {
    const dialog = await openNew();
    expect(optionsOf(dialog)).toEqual(['Main account', 'Savings', 'Visa (credit card)']);
    expect(within(dialog).getByLabelText('Paid with')).toHaveValue('acct-main');
  });

  it('lists no archived account', async () => {
    const data = monthData();
    data.tables.account.push(
      makeAccount({ id: 'acct-old', name: 'Old account', order: 3, archivedOn: '2026-10-01' }),
    );
    renderWithStore(
      <MemoryRouter>
        <SubscriptionsScreen />
      </MemoryRouter>,
      createStubStore({ data, today: TODAY }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a subscription' });
    expect(optionsOf(dialog)).toEqual(['Main account', 'Savings', 'Visa (credit card)']);
  });

  it('lists no frozen account, and does not start on one', async () => {
    const data = monthData();
    data.tables.account = data.tables.account.map((a) =>
      a.id === 'acct-main' || a.id === 'card-1' ? { ...a, frozen: true } : a,
    );
    renderWithStore(
      <MemoryRouter>
        <SubscriptionsScreen />
      </MemoryRouter>,
      createStubStore({ data, today: TODAY }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a subscription' });
    expect(optionsOf(dialog)).toEqual(['Savings']);
    expect(within(dialog).getByLabelText('Paid with')).toHaveValue('acct-savings');
  });

  it('still offers the frozen account a subscription is paid with when it is edited, and keeps it', async () => {
    const data = monthData();
    data.tables.account = data.tables.account.map((a) =>
      a.id === 'card-1' ? { ...a, frozen: true } : a,
    );
    renderWithStore(
      <MemoryRouter>
        <SubscriptionsScreen />
      </MemoryRouter>,
      createStubStore({ data, today: TODAY }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Cloud Drive' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit subscription' });
    expect(within(dialog).getByLabelText('Paid with')).toHaveValue('card-1');
    expect(optionsOf(dialog)).toEqual(['Main account', 'Savings', 'Visa (credit card)']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub-cloud', accountId: 'card-1' }),
    );
  });

  it('saves the account that was picked', async () => {
    const dialog = await openNew();
    await fillIn(dialog);
    await userEvent.selectOptions(within(dialog).getByLabelText('Paid with'), 'Savings');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Newsletter', accountId: 'acct-savings' }),
    );
  });

  it('saves the default account when none was picked', async () => {
    const dialog = await openNew();
    await fillIn(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acct-main' }),
    );
  });

  it('refuses to save with no account to pay from', async () => {
    const data = monthData();
    data.tables.account = [];
    renderWithStore(
      <MemoryRouter>
        <SubscriptionsScreen />
      </MemoryRouter>,
      createStubStore({ data, today: TODAY }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a subscription' });
    await fillIn(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByLabelText('Paid with')).toHaveAccessibleDescription(
      'Pick an account.',
    );
    expect(actions.saveSubscription).not.toHaveBeenCalled();
  });

  it('moves a subscription to the account that was picked when it is edited', async () => {
    renderSubs();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Cloud Drive' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit subscription' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Paid with'), 'Main account');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub-cloud', accountId: 'acct-main' }),
    );
  });
});

describe('Bills & cards header', () => {
  /** The screen inside a router that has the places Back can go to. */
  function renderRouted(entries: string[], index?: number) {
    renderWithStore(
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <Routes>
          <Route path="/subscriptions" element={<SubscriptionsScreen />} />
          <Route path="/cards" element={<p>The Cards page</p>} />
          <Route path="/" element={<p>The Home page</p>} />
        </Routes>
      </MemoryRouter>,
      createStubStore({ data: monthData(), today: TODAY }),
    );
  }

  it('has a round Back button before the title, and Add as a glass pill after it', () => {
    renderSubs();
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveClass('glass', 'rounded-full', 'size-11');
    const heading = screen.getByRole('heading', { level: 1, name: 'Bills & cards' });
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Add is not the page's main button: a glass pill, as Add goal is.
    expect(screen.getByRole('button', { name: 'Add' })).toHaveClass('glass', 'rounded-full');
    expect(screen.getByRole('button', { name: 'Add' })).not.toHaveClass('bg-primary');
  });

  it('goes back to the screen it was opened from', async () => {
    renderRouted(['/', '/subscriptions'], 1);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('The Home page')).toBeInTheDocument();
  });

  it('goes to Cards, which lists the bills, when it was the first screen', async () => {
    renderRouted(['/subscriptions']);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('The Cards page')).toBeInTheDocument();
  });
});

describe('Bills & cards in glass', () => {
  const expectPlainList = (list: Element | null) => {
    expect(list).toHaveClass('divide-y', 'divide-black/7', 'dark:divide-white/8');
    expect(list).not.toHaveClass('divide-border');
  };
  const listOf = (name: string) => within(screen.getByRole('region', { name })).getByRole('list');

  it('draws the three sections as plain rows with hairlines', () => {
    renderSubs();
    for (const name of ['Card payments', 'Active', 'Cancelled']) expectPlainList(listOf(name));
  });

  it('gives a subscription a glass chip with its category icon, and its menu after it', () => {
    renderSubs();
    const item = screen.getByText('Streamflix').closest('li')!;
    // Entertainment is drawn with the clapperboard, as Home draws it.
    expect(item.querySelector('.glass.size-\\[38px\\] svg.lucide-clapperboard')).toBeTruthy();
    expect(within(item).getByRole('button', { name: 'Actions for Streamflix' })).toBeEnabled();
  });

  it('draws the audit marks as glass pills, the chosen one solid, still toggles', () => {
    const data = emptySnapshot();
    data.tables.subscription.push(
      makeSubscription({
        id: 'Streamflix',
        name: 'Streamflix',
        audit: 'review',
        auditedAt: localIso('2026-10-03'),
        nextRenewal: '2026-10-20',
      }),
    );
    renderWithStore(
      <MemoryRouter>
        <SubscriptionsScreen />
      </MemoryRouter>,
      createStubStore({ data, today: TODAY }),
    );
    const group = row('Streamflix').getByRole('group', { name: 'Audit Streamflix' });
    const keep = within(group).getByRole('button', { name: 'Keep' });
    const review = within(group).getByRole('button', { name: 'Review' });
    expect(keep).toHaveClass('glass', 'rounded-full', 'h-8', 'text-text');
    expect(keep).not.toHaveClass('bg-primary');
    expect(keep).toHaveAttribute('aria-pressed', 'false');
    expect(review).toHaveClass('bg-primary', 'text-primary-contrast', 'rounded-full', 'h-8');
    expect(review).toHaveAttribute('aria-pressed', 'true');
    // A 32px pill with a 44px tap area, as the add forms' pills have.
    expect(keep).toHaveClass('hit-44');
    expect(review).toHaveClass('hit-44');
  });

  it('draws Resume as a glass pill on a cancelled subscription, in a chip row', () => {
    renderSubs();
    const old = screen.getByText('Old Magazine').closest('li')!;
    expect(within(old).getByRole('button', { name: 'Resume Old Magazine' })).toHaveClass(
      'glass',
      'rounded-full',
    );
    expect(old.querySelector('.glass.size-\\[38px\\]')).toBeTruthy();
  });

  it('says the month’s subscription total on the right of Active in muted words', () => {
    renderSubs();
    expect(
      within(screen.getByRole('region', { name: 'Active' })).getByText(`${usd(25_99)} a month`),
    ).toHaveClass('text-muted');
  });
});

describe('the subscription dialog in glass', () => {
  /** A `row` field: the label on the left, the value on the right, a hairline under it. */
  const rowFields = (dialog: HTMLElement, labels: string[]) => {
    for (const label of labels) {
      const field = within(dialog).getByLabelText(label);
      expect(field, label).toHaveClass('text-right', 'h-11');
      expect(field, label).not.toHaveClass('rounded-md', 'border', 'border-b', 'font-extrabold');
      expect(field.closest('.border-b'), label).toHaveClass(
        'border-black/7',
        'dark:border-white/8',
      );
    }
  };

  it('has row fields, a hero amount and pills for the cycle', async () => {
    renderSubs();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a subscription' });
    rowFields(dialog, ['Name', 'Next renewal', 'Category', 'Paid with']);
    // The dialog is about one amount: the big figure, no box.
    expect(within(dialog).getByLabelText('Amount')).toHaveClass('text-[40px]', 'font-bold');
    const tabs = (legend: string) =>
      within(within(dialog).getByRole('group', { name: legend }))
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent);
    expect(tabs('Cycle')).toEqual(['Weekly', 'Monthly', 'Quarterly', 'Yearly']);
    // The cycle is four short choices: pills, the chosen one solid, still radios.
    expect(within(dialog).getByText('Monthly')).toHaveClass(
      'bg-primary',
      'text-primary-contrast',
      'h-8',
    );
    expect(within(dialog).getByText('Weekly')).toHaveClass('glass', 'rounded-full');
    expect(within(dialog).getByText('Weekly')).not.toHaveClass('bg-primary');
    expect(within(dialog).queryByRole('group', { name: 'Paid with' })).not.toBeInTheDocument();
  });

  it('has the same rows when editing, with Delete in danger and Save solid', async () => {
    renderSubs();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Cloud Drive' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit subscription' });
    rowFields(dialog, ['Name', 'Next renewal', 'Category', 'Paid with']);
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveClass('text-danger');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveClass('bg-primary');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveClass('glass');
  });

  it('saves the cycle that was picked', async () => {
    renderSubs();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a subscription' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Newsletter');
    await userEvent.type(within(dialog).getByLabelText('Amount'), '5');
    fireEvent.change(within(dialog).getByLabelText('Next renewal'), {
      target: { value: '2026-11-02' },
    });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Yearly' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Newsletter', cycle: 'yearly' }),
    );
  });
});
