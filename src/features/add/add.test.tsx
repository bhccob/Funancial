import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { periodRange } from '@/domain/periods';
import type { LimitStatus } from '@/domain/budget';
import type { Settings } from '@/domain/entities';
import { emptySnapshot } from '@/domain/snapshot';
import { toastStore } from '@/lib/toast';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeDebt, makeLimit, makeSettings } from '@/test/fixtures';
import { AddScreen } from './AddScreen';

const actions = vi.hoisted(() => ({
  addExpense: vi.fn(),
  wouldCrossOver: vi.fn(),
  addIncome: vi.fn(),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => actions,
}));

const TODAY = '2026-10-14';
const foodLimit = makeLimit({ id: 'lim-food', category: 'food', period: 'weekly', amount: 120_00 });

function status(level: LimitStatus['level'], pct: number): LimitStatus {
  const spent = (foodLimit.amount * pct) / 100;
  return {
    limit: foodLimit,
    range: periodRange('weekly', TODAY, 1),
    spent,
    remaining: foodLimit.amount - spent,
    pct,
    level,
  };
}

beforeEach(() => {
  toastStore.setState({ toasts: [] });
  actions.addExpense.mockReset().mockResolvedValue({ expense: {}, alerts: [] });
  actions.wouldCrossOver.mockReset().mockReturnValue([]);
  actions.addIncome.mockReset().mockResolvedValue({});
});

function renderAdd(path = '/add', tone: Settings['warningTone'] = 'motivational') {
  const data = emptySnapshot();
  data.tables.settings.push(makeSettings({ warningTone: tone }));
  data.tables.debt.push(makeDebt({ id: 'card-1', name: 'Visa', kind: 'credit_card' }));
  return renderWithStore(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/add" element={<AddScreen />} />
        <Route path="/" element={<p>Home page</p>} />
      </Routes>
      <Toaster />
    </MemoryRouter>,
    createStubStore({ data, today: TODAY }),
  );
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('Add expense', () => {
  it('saves a cash expense with exactly what was entered, then goes back', async () => {
    renderAdd();
    expect(screen.getByRole('heading', { level: 1, name: 'Add' })).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Amount'), '12.50');
    await userEvent.click(screen.getByRole('radio', { name: 'Food' }));
    expect(screen.getByLabelText('Date')).toHaveValue(TODAY);
    await save();

    expect(actions.addExpense).toHaveBeenCalledWith({
      amount: 1250,
      category: 'food',
      date: TODAY,
      note: '',
      paymentMethod: 'cash',
      cardId: null,
      repeat: null,
    });
    expect(await screen.findByText('Expense saved.')).toBeInTheDocument();
    expect(screen.getByText('Home page')).toBeInTheDocument();
  });

  it('records a credit card purchase against that card', async () => {
    renderAdd();
    await userEvent.type(screen.getByLabelText('Amount'), '40');
    await userEvent.click(screen.getByRole('radio', { name: 'Fun' }));
    await userEvent.selectOptions(screen.getByLabelText('Paid with'), 'Visa');
    await userEvent.selectOptions(screen.getByLabelText('Repeats'), 'Monthly');
    await save();
    expect(actions.addExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 40_00,
        category: 'entertainment',
        paymentMethod: 'credit_card',
        cardId: 'card-1',
        repeat: 'monthly',
      }),
    );
  });

  it('refuses a future date', async () => {
    renderAdd();
    await userEvent.type(screen.getByLabelText('Amount'), '5');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-15' } });
    await save();
    expect(screen.getByText('Use today or an earlier date.')).toBeInTheDocument();
    expect(actions.addExpense).not.toHaveBeenCalled();
  });

  it('warns in the chosen tone when a limit level rises', async () => {
    actions.addExpense.mockResolvedValue({ expense: {}, alerts: [status('warn', 83)] });
    renderAdd();
    await userEvent.type(screen.getByLabelText('Amount'), '100');
    await save();
    expect(
      await screen.findByText("Food is at 83%. A few careful days and you've got this!"),
    ).toBeInTheDocument();
  });

  it('asks before going over a limit in strict mode, and Cancel saves nothing', async () => {
    actions.wouldCrossOver.mockReturnValue([status('over', 108)]);
    renderAdd('/add', 'strict');
    await userEvent.type(screen.getByLabelText('Amount'), '130');
    await save();
    const dialog = screen.getByRole('dialog', { name: 'Over your limit?' });
    expect(dialog).toHaveAccessibleDescription('Food limit reached.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(actions.addExpense).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Add' })).toBeInTheDocument();
  });

  it('saves anyway in strict mode when confirmed', async () => {
    actions.wouldCrossOver.mockReturnValue([status('over', 108)]);
    renderAdd('/add', 'strict');
    await userEvent.type(screen.getByLabelText('Amount'), '130');
    await save();
    await userEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    expect(actions.addExpense).toHaveBeenCalledTimes(1);
  });
});

describe('Add income', () => {
  it('opens on income from the link and saves a salary', async () => {
    renderAdd('/add?type=income');
    expect(screen.getByRole('radio', { name: 'Income' })).toBeChecked();
    await userEvent.type(screen.getByLabelText('Amount'), '4200');
    await userEvent.click(screen.getByRole('radio', { name: 'Salary' }));
    expect(screen.getByLabelText('Label')).toHaveValue('Salary');
    await save();
    expect(actions.addIncome).toHaveBeenCalledWith({
      amount: 4200_00,
      source: 'salary',
      label: 'Salary',
      date: TODAY,
      bucket: 'cash',
      note: '',
    });
    expect(await screen.findByText('Income saved.')).toBeInTheDocument();
  });

  it('labels extra income and can send it to savings', async () => {
    renderAdd('/add?type=income');
    await userEvent.type(screen.getByLabelText('Amount'), '50');
    await userEvent.click(screen.getByRole('radio', { name: 'Extra' }));
    expect(screen.getByLabelText('Label')).toHaveValue('Extra income');
    await userEvent.selectOptions(screen.getByLabelText('Goes to'), 'Savings');
    await save();
    expect(actions.addIncome).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'extra', label: 'Extra income', bucket: 'savings' }),
    );
  });
});
