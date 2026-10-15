import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@/domain/money';
import { emptySnapshot } from '@/domain/snapshot';
import { formatDay } from '@/lib/format';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeDebt, makeSubscription } from '@/test/fixtures';
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

function renderSubs() {
  const data = emptySnapshot();
  data.tables.debt.push(makeDebt({ id: 'card-1', name: 'Visa', kind: 'credit_card' }));
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
  renderWithStore(
    <MemoryRouter>
      <SubscriptionsScreen />
    </MemoryRouter>,
    createStubStore({ data, today: TODAY }),
  );
}

const row = (name: string) => {
  const item = screen.getByText(name).closest('li');
  if (!item) throw new Error(`no row for ${name}`);
  return within(item);
};

describe('SubscriptionsScreen', () => {
  it('sums the active subscriptions per month', () => {
    renderSubs();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Subscriptions & bills' }),
    ).toBeInTheDocument();
    // 15.99 monthly + 120.00 yearly (10.00 a month)
    expect(screen.getByText(`${usd(25_99)} a month · 2 active`)).toBeInTheDocument();
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
    await userEvent.selectOptions(within(dialog).getByLabelText('Paid with'), 'Visa');
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
    expect(within(dialog).getByLabelText('Paid with')).toHaveValue('card:card-1');
    expect(within(dialog).getByText('Past charges stay in your history.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(actions.deleteSubscription).toHaveBeenCalledWith('sub-cloud');
  });
});
