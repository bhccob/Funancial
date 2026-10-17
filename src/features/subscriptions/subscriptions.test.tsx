import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { emptySnapshot } from '@/domain/snapshot';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { formatDay, formatMonthShort } from '@/lib/format';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { localIso, makeDebt, makeSubscription } from '@/test/fixtures';
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

/** The Visa owes 230.00, due on the 21st; the month's other bill is Streamflix (15.99, 10-17). */
function monthData() {
  const data = emptySnapshot();
  data.tables.debt.push(
    makeDebt({
      id: 'card-1',
      name: 'Visa',
      kind: 'credit_card',
      openingBalance: 230_00,
      openingDate: '2026-09-01',
      dueDay: 21,
      payInFull: true,
    }),
  );
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
      paymentMethod: 'credit_card',
      cardId: 'card-1',
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

  it('shows the same month total as Home, as both come from the same bills', () => {
    const store = createStubStore({ data: monthData(), today: TODAY });
    const home = renderWithStore(
      <MemoryRouter>
        <DashboardScreen />
      </MemoryRouter>,
      store,
    );
    const comingUp = within(screen.getByRole('region', { name: 'Coming up' }));
    expect(comingUp.getByRole('link', { name: `${usd(245_99)} this month` })).toBeInTheDocument();
    home.unmount();

    renderWithStore(
      <MemoryRouter>
        <SubscriptionsScreen />
      </MemoryRouter>,
      store,
    );
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
    data.tables.debt = [
      makeDebt({
        id: 'card-1',
        name: 'Visa',
        openingBalance: 230_00,
        openingDate: '2026-09-01',
        dueDay: 21,
        payInFull: false,
        minimumPayment: 25_00,
      }),
    ];
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
    data.tables.debt = [];
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
      row('Streamflix').getByText(`${usd(15_99)} / month · Renews in 3 days · Debit card`),
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
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Visa' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.saveSubscription).toHaveBeenCalledWith({
      name: 'FitHub Gym',
      amount: 39_00,
      cycle: 'monthly',
      nextRenewal: '2026-11-02',
      category: 'health',
      paymentMethod: 'credit_card',
      cardId: 'card-1',
    });
  });

  it('edits and deletes, keeping past charges', async () => {
    renderSubs();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Cloud Drive' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit subscription' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Cloud Drive');
    expect(within(dialog).getByRole('radio', { name: 'Visa' })).toBeChecked();
    expect(within(dialog).getByText('Past charges stay in your history.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(actions.deleteSubscription).toHaveBeenCalledWith('sub-cloud');
  });
});

describe('the subscription dialog in the line style', () => {
  it('has line fields, underline tabs for the cycle and for paid with', async () => {
    renderSubs();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a subscription' });
    for (const label of ['Name', 'Amount', 'Next renewal', 'Category']) {
      expect(within(dialog).getByLabelText(label), label).toHaveClass('border-b', 'font-extrabold');
      expect(within(dialog).getByLabelText(label), label).not.toHaveClass('rounded-md');
    }
    const tabs = (legend: string) =>
      within(within(dialog).getByRole('group', { name: legend }))
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent);
    expect(tabs('Cycle')).toEqual(['Weekly', 'Monthly', 'Quarterly', 'Yearly']);
    expect(within(dialog).getByText('Monthly')).toHaveClass('border-b-2', 'border-text');
    expect(tabs('Paid with')).toEqual(['Cash', 'Debit card', 'Visa', 'Other']);
    expect(within(dialog).getByText('Debit card')).toHaveClass('border-b-2', 'border-text');
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
