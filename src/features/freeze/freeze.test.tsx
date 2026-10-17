import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '@/domain/examples';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { formatMonth } from '@/lib/format';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeProfile } from '@/test/fixtures';
import { FreezeScreen } from './FreezeScreen';

const actions = vi.hoisted(() => ({
  addFreeze: vi.fn(async () => ({})),
  deleteFreeze: vi.fn(async () => {}),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => actions,
}));

const TODAY = '2026-10-14';
const usd = (minor: number) => formatMoney(minor, 'USD');

beforeEach(() => Object.values(actions).forEach((a) => a.mockClear()));

function salData({ withFreeze = false } = {}): DataSnapshot {
  const sal = EXAMPLES.find((e) => e.id === 'SAL-1');
  if (!sal) throw new Error('SAL-1 missing');
  const data = structuredClone(sal.data);
  if (!withFreeze) data.tables.salaryFreeze = [];
  return data;
}

function renderFreeze(data: DataSnapshot) {
  renderWithStore(
    <MemoryRouter>
      <FreezeScreen />
    </MemoryRouter>,
    createStubStore({ data, today: TODAY }),
  );
}

function setDates(from: string, to: string) {
  fireEvent.change(screen.getByLabelText('From'), { target: { value: from } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: to } });
}

describe('FreezeScreen', () => {
  it('previews expected pay per affected month (SAL-1)', () => {
    renderFreeze(salData());
    expect(screen.getByRole('heading', { level: 1, name: 'Salary Freeze' })).toBeInTheDocument();
    setDates('2026-09-28', '2026-10-03');
    expect(
      screen.getByText(`${formatMonth('2026-09')}: ${usd(3_000_00)} → ${usd(2_700_00)}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${formatMonth('2026-10')}: ${usd(3_000_00)} → ${usd(2_709_68)}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Bills and subscriptions still apply during a freeze.'),
    ).toBeInTheDocument();
  });

  it('adds a freeze with an entered amount', async () => {
    renderFreeze(salData());
    setDates('2026-09-28', '2026-10-03');
    await userEvent.click(screen.getByRole('radio', { name: "I'll enter the amount" }));
    await userEvent.type(screen.getByLabelText('Amount lost'), '500');
    await userEvent.click(screen.getByRole('button', { name: 'Add freeze' }));
    expect(actions.addFreeze).toHaveBeenCalledWith({
      start: '2026-09-28',
      end: '2026-10-03',
      mode: 'manual',
      lostAmount: 500_00,
      note: '',
    });
  });

  it('refuses an end before the start', async () => {
    renderFreeze(salData());
    setDates('2026-10-05', '2026-10-01');
    await userEvent.click(screen.getByRole('button', { name: 'Add freeze' }));
    expect(
      screen.getByText('The end date must be on or after the start date.'),
    ).toBeInTheDocument();
    expect(actions.addFreeze).not.toHaveBeenCalled();
  });

  it('lists freezes with Delete', async () => {
    const data = salData({ withFreeze: true });
    renderFreeze(data);
    const list = screen.getByRole('region', { name: 'Your freezes' });
    await userEvent.click(within(list).getByRole('button', { name: /^Delete freeze/ }));
    expect(actions.deleteFreeze).toHaveBeenCalledWith(data.tables.salaryFreeze[0]?.id);
  });

  it('asks for a salary first', () => {
    const data = emptySnapshot();
    data.tables.profile.push(makeProfile({ salary: null }));
    renderFreeze(data);
    expect(screen.getByText('Add your salary first')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });
});

describe('the freeze form in the line style', () => {
  it('has line date fields, an underline choice for lost pay and a line amount', async () => {
    renderFreeze(salData());
    for (const label of ['From', 'To']) {
      expect(screen.getByLabelText(label), label).toHaveClass('border-b', 'font-extrabold');
      expect(screen.getByLabelText(label), label).not.toHaveClass('rounded-md');
    }
    expect(screen.getByText('Calculate from my salary')).toHaveClass('border-b-2', 'border-text');
    expect(screen.getByText("I'll enter the amount")).toHaveClass('border-transparent');
    await userEvent.click(screen.getByRole('radio', { name: "I'll enter the amount" }));
    expect(screen.getByLabelText('Amount lost')).toHaveClass('border-b', 'font-extrabold');
    expect(screen.getByLabelText('Amount lost')).not.toHaveClass('rounded-md');
  });
});
