import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATEGORY_OPTIONS } from '@/features/shared/categories';
import { Toaster } from '@/components/ui/Toaster';
import { currencySymbol } from '@/domain/money';
import { periodRange } from '@/domain/periods';
import type { LimitStatus } from '@/domain/budget';
import type { Account, Settings } from '@/domain/entities';
import { emptySnapshot } from '@/domain/snapshot';
import { toastStore } from '@/lib/toast';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeAccount, makeExpense, makeLimit, makeSettings } from '@/test/fixtures';
import { AddScreen } from './AddScreen';
import { ExpenseForm } from './ExpenseForm';

const actions = vi.hoisted(() => ({
  addExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  wouldCrossOver: vi.fn(),
  addIncome: vi.fn(),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => actions,
}));

const TODAY = '2026-10-14';
const MAIN = makeAccount({ id: 'acct-main', name: 'Main account', order: 0 });
const SAVINGS = makeAccount({
  id: 'acct-savings',
  name: 'Savings',
  kind: 'savings',
  skin: 'mint',
  inAvailable: false,
  order: 1,
});
const VISA = makeAccount({
  id: 'card-1',
  name: 'Visa',
  kind: 'credit',
  skin: 'violet',
  inAvailable: false,
  openingBalance: 0,
  order: 2,
  credit: {
    limit: 3_000_00,
    statementDay: 1,
    dueDay: 21,
    payInFull: true,
    minimumPayment: 25_00,
    interestRate: 22.9,
  },
});
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
  actions.updateExpense.mockReset().mockResolvedValue(undefined);
  actions.deleteExpense.mockReset().mockResolvedValue(undefined);
  actions.wouldCrossOver.mockReset().mockReturnValue([]);
  actions.addIncome.mockReset().mockResolvedValue({});
});

function dataWith(accounts: Account[], settings: Partial<Settings> = {}) {
  const data = emptySnapshot();
  data.tables.settings.push(makeSettings(settings));
  data.tables.account.push(...accounts);
  return data;
}

function renderAdd(
  path: InitialEntry = '/add',
  tone: Settings['warningTone'] = 'motivational',
  accounts: Account[] = [MAIN, SAVINGS, VISA],
  settings: Partial<Settings> = {},
) {
  const data = dataWith(accounts, { ...settings, warningTone: tone });
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
/** The option labels of a select, in the order they are offered. */
const optionsOf = (label: string) =>
  within(screen.getByLabelText(label))
    .queryAllByRole('option')
    .map((o) => o.textContent);

describe('Add expense', () => {
  it('saves an expense with exactly what was entered, on the default account, then goes back', async () => {
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
      accountId: 'acct-main',
      repeat: null,
    });
    expect(await screen.findByText('Expense saved.')).toBeInTheDocument();
    expect(screen.getByText('Home page')).toBeInTheDocument();
  });

  it('records a credit card purchase against that card', async () => {
    renderAdd();
    await userEvent.type(screen.getByLabelText('Amount'), '40');
    await userEvent.click(screen.getByRole('radio', { name: 'Fun' }));
    await userEvent.selectOptions(screen.getByLabelText('Paid with'), 'Visa (credit card)');
    await userEvent.selectOptions(screen.getByLabelText('Repeats'), 'Monthly');
    await save();
    expect(actions.addExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 40_00,
        category: 'entertainment',
        accountId: 'card-1',
        repeat: 'monthly',
      }),
    );
  });

  it('saves the account that was picked', async () => {
    renderAdd();
    await userEvent.type(screen.getByLabelText('Amount'), '9');
    await userEvent.selectOptions(screen.getByLabelText('Paid with'), 'Savings');
    await save();
    expect(actions.addExpense).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 9_00, accountId: 'acct-savings' }),
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

describe('Paid with on the expense form', () => {
  it('lists the accounts in use by their order, a credit card as one', () => {
    // Handed over out of order: the carousel order decides.
    renderAdd('/add', 'motivational', [VISA, SAVINGS, MAIN]);
    expect(optionsOf('Paid with')).toEqual(['Main account', 'Savings', 'Visa (credit card)']);
  });

  it('lists no archived account', () => {
    const view = renderAdd('/add', 'motivational', [
      MAIN,
      SAVINGS,
      VISA,
      makeAccount({ id: 'acct-old', name: 'Old account', order: 3 }),
    ]);
    expect(optionsOf('Paid with')).toEqual([
      'Main account',
      'Savings',
      'Visa (credit card)',
      'Old account',
    ]);
    act(() =>
      view.store.setState((s) => {
        const tables = { ...s.data.tables };
        tables.account = tables.account.map((a) =>
          a.id === 'acct-old' ? { ...a, archivedOn: TODAY } : a,
        );
        return { data: { ...s.data, tables } };
      }),
    );
    expect(optionsOf('Paid with')).toEqual(['Main account', 'Savings', 'Visa (credit card)']);
  });

  it('lists no frozen account, and does not start on one, the default included', () => {
    renderAdd(
      '/add',
      'motivational',
      [{ ...MAIN, frozen: true }, SAVINGS, { ...VISA, frozen: true }],
      {
        defaultAccountId: 'acct-main',
      },
    );
    expect(optionsOf('Paid with')).toEqual(['Savings']);
    expect(screen.getByLabelText('Paid with')).toHaveValue('acct-savings');
  });

  it('offers a frozen account again once it is unfrozen', () => {
    const view = renderAdd('/add', 'motivational', [MAIN, SAVINGS, { ...VISA, frozen: true }]);
    expect(optionsOf('Paid with')).toEqual(['Main account', 'Savings']);
    act(() =>
      view.store.setState((s) => {
        const tables = { ...s.data.tables };
        tables.account = tables.account.map((a) => ({ ...a, frozen: false }));
        return { data: { ...s.data, tables } };
      }),
    );
    expect(optionsOf('Paid with')).toEqual(['Main account', 'Savings', 'Visa (credit card)']);
  });

  it('starts on the default account from the settings', async () => {
    renderAdd('/add', 'motivational', [MAIN, SAVINGS, VISA], { defaultAccountId: 'acct-savings' });
    expect(screen.getByLabelText('Paid with')).toHaveValue('acct-savings');
    await userEvent.type(screen.getByLabelText('Amount'), '3');
    await save();
    expect(actions.addExpense).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acct-savings' }),
    );
  });

  it('starts on the first bank account when the default is archived', () => {
    const gone = makeAccount({ id: 'acct-gone', name: 'Gone', order: 5, archivedOn: '2026-10-01' });
    renderAdd('/add', 'motivational', [SAVINGS, MAIN, gone], { defaultAccountId: 'acct-gone' });
    expect(screen.getByLabelText('Paid with')).toHaveValue('acct-main');
  });

  it('starts on the first option when no bank account or cash is left', () => {
    renderAdd('/add', 'motivational', [SAVINGS, VISA]);
    expect(screen.getByLabelText('Paid with')).toHaveValue('acct-savings');
  });

  it('still renders with no account at all, and refuses to save', async () => {
    renderAdd('/add', 'motivational', []);
    const select = screen.getByLabelText('Paid with');
    expect(optionsOf('Paid with')).toEqual([]);
    await userEvent.type(screen.getByLabelText('Amount'), '5');
    await save();
    expect(screen.getByText('Pick an account.')).toBeInTheDocument();
    expect(select).toBeInvalid();
    expect(select).toHaveAccessibleDescription('Pick an account.');
    expect(actions.addExpense).not.toHaveBeenCalled();
  });

  it('says what paying with a card does, under the select', async () => {
    renderAdd();
    const hint = 'Adds to the card balance. Paying the card later moves the cash.';
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Paid with'), 'Visa (credit card)');
    expect(screen.getByLabelText('Paid with')).toHaveAccessibleDescription(hint);
    await userEvent.selectOptions(screen.getByLabelText('Paid with'), 'Savings');
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });
});

describe('Edit expense', () => {
  const OLD = makeAccount({
    id: 'acct-old',
    name: 'Old account',
    order: 3,
    archivedOn: '2026-10-01',
  });
  const expense = makeExpense({ id: 'exp-1', amount: 8_00, date: TODAY, accountId: 'acct-old' });

  function renderEdit() {
    return renderWithStore(
      <ExpenseForm expense={expense} onDone={() => {}} />,
      createStubStore({ data: dataWith([MAIN, SAVINGS, VISA, OLD]), today: TODAY }),
    );
  }

  it('still offers the archived account the expense was paid with, and keeps it', async () => {
    renderEdit();
    expect(screen.getByLabelText('Paid with')).toHaveValue('acct-old');
    expect(optionsOf('Paid with')).toEqual([
      'Main account',
      'Savings',
      'Visa (credit card)',
      'Old account',
    ]);
    await save();
    expect(actions.updateExpense).toHaveBeenCalledWith(
      'exp-1',
      expect.objectContaining({ accountId: 'acct-old' }),
    );
  });

  it('still offers the frozen account the expense was paid with, and keeps it', async () => {
    renderWithStore(
      <ExpenseForm
        expense={makeExpense({ id: 'exp-2', amount: 8_00, date: TODAY, accountId: 'card-1' })}
        onDone={() => {}}
      />,
      createStubStore({ data: dataWith([MAIN, SAVINGS, { ...VISA, frozen: true }]), today: TODAY }),
    );
    expect(screen.getByLabelText('Paid with')).toHaveValue('card-1');
    expect(optionsOf('Paid with')).toEqual(['Main account', 'Savings', 'Visa (credit card)']);
    await save();
    expect(actions.updateExpense).toHaveBeenCalledWith(
      'exp-2',
      expect.objectContaining({ accountId: 'card-1' }),
    );
  });

  it('moves the expense to the account that was picked', async () => {
    renderEdit();
    await userEvent.selectOptions(screen.getByLabelText('Paid with'), 'Main account');
    await save();
    expect(actions.updateExpense).toHaveBeenCalledWith(
      'exp-1',
      expect.objectContaining({ accountId: 'acct-main' }),
    );
  });
});

describe('Add expense without Buy it?', () => {
  it('has no link to ask first, on an expense or on income', async () => {
    renderAdd();
    expect(screen.queryByRole('link', { name: /ask first/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.queryByRole('link', { name: /ask first/i })).not.toBeInTheDocument();
  });

  it('starts empty even when the router state carries a purchase', () => {
    renderAdd({
      pathname: '/add',
      state: {
        prefill: {
          item: 'Headphones',
          amount: 249_00,
          category: 'entertainment',
          accountId: 'acct-savings',
        },
      },
    });
    expect(screen.getByLabelText('Amount')).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Food' })).toBeChecked();
    expect(screen.getByLabelText('Note')).toHaveValue('');
    expect(screen.getByLabelText('Paid with')).toHaveValue('acct-main');
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
      accountId: 'acct-main',
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
      expect.objectContaining({
        source: 'extra',
        label: 'Extra income',
        accountId: 'acct-savings',
      }),
    );
  });

  it('does not offer a credit card under Goes to', () => {
    renderAdd('/add?type=income', 'motivational', [VISA, SAVINGS, MAIN]);
    expect(optionsOf('Goes to')).toEqual(['Main account', 'Savings']);
  });

  it('starts on the default account from the settings', async () => {
    renderAdd('/add?type=income', 'motivational', [MAIN, SAVINGS, VISA], {
      defaultAccountId: 'acct-savings',
    });
    expect(screen.getByLabelText('Goes to')).toHaveValue('acct-savings');
  });

  it('refuses to save when only a credit card is left', async () => {
    renderAdd('/add?type=income', 'motivational', [VISA]);
    expect(optionsOf('Goes to')).toEqual([]);
    await userEvent.type(screen.getByLabelText('Amount'), '50');
    await save();
    expect(screen.getByLabelText('Goes to')).toHaveAccessibleDescription('Pick an account.');
    expect(actions.addIncome).not.toHaveBeenCalled();
  });
});

describe('the Add forms in glass', () => {
  const pill = (name: string) => screen.getByText(name);
  const pillsOf = (legend: string) =>
    within(screen.getByRole('group', { name: legend }))
      .getAllByRole('radio')
      .map((r) => r.closest('label')?.textContent);
  /** The hairline of the row a field sits in. */
  const rowOf = (label: string) => screen.getByLabelText(label).closest('.border-b');

  it('has a hero amount, category pills and plain rows for an expense', () => {
    renderAdd();
    // The amount: 40px, bold, the currency dimmed beside it, and it has the focus on open.
    expect(screen.getByLabelText('Amount')).toHaveClass('text-[40px]', 'font-bold');
    expect(screen.getByLabelText('Amount')).toHaveFocus();
    expect(screen.getByText(currencySymbol('USD'))).toHaveClass('text-muted');
    // The four rows: a label and a value, a hairline, no box and no line field.
    for (const label of ['Paid with', 'Date', 'Note', 'Repeats']) {
      const field = screen.getByLabelText(label);
      expect(field, label).toHaveClass('text-right', 'h-11');
      expect(field, label).not.toHaveClass('rounded-md', 'border', 'border-b', 'font-extrabold');
      expect(rowOf(label), label).toHaveClass('border-black/7', 'dark:border-white/8');
    }
    // The type switch stays underline tabs, still radios; Paid with stays a select.
    expect(pill('Expense')).toHaveClass('border-b-2', 'border-text');
    expect(pill('Income')).toHaveClass('border-transparent');
    expect(screen.queryByRole('group', { name: 'Paid with' })).not.toBeInTheDocument();
  });

  it('lists the rows in the order of the mockup: Paid with, Date, Note, Repeats', () => {
    renderAdd();
    const after = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const order = ['Paid with', 'Date', 'Note', 'Repeats'].map((l) => screen.getByLabelText(l));
    expect(after(order[0]!, order[1]!)).toBe(true);
    expect(after(order[1]!, order[2]!)).toBe(true);
    expect(after(order[2]!, order[3]!)).toBe(true);
    // They come after the category pills and before the buttons.
    expect(after(screen.getByRole('radio', { name: 'Food' }), order[0]!)).toBe(true);
    expect(after(order[3]!, screen.getByRole('button', { name: 'Save' }))).toBe(true);
  });

  it('has Category as one-tap pills, not a select and not underline tabs', async () => {
    renderAdd();
    // All eight at once, as before: one tap, nothing to open.
    expect(pillsOf('Category')).toEqual(CATEGORY_OPTIONS.map((o) => o.label));
    expect(screen.queryByLabelText('Category')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Food' })).toBeChecked();
    // The chosen pill is solid; the others are glass; each is 32px with a 44px tap area.
    expect(pill('Food')).toHaveClass('bg-primary', 'text-primary-contrast', 'h-8');
    expect(pill('Food')).not.toHaveClass('border-b-2', 'bg-overlay', 'glass');
    expect(pill('Fun')).toHaveClass('glass', 'h-8', 'rounded-full');
    expect(screen.getByRole('radio', { name: 'Fun' })).toHaveClass('h-11');
    expect(pill('Fun')).not.toHaveClass('bg-primary');

    await userEvent.click(screen.getByRole('radio', { name: 'Fun' }));
    expect(pill('Fun')).toHaveClass('bg-primary', 'text-primary-contrast');
    expect(pill('Food')).toHaveClass('glass');
    expect(pill('Food')).not.toHaveClass('bg-primary');
  });

  it('draws each category with its icon, for the eye only', () => {
    renderAdd();
    const radios = within(screen.getByRole('group', { name: 'Category' })).getAllByRole('radio');
    expect(radios).toHaveLength(CATEGORY_OPTIONS.length);
    for (const radio of radios) {
      expect(radio.closest('label')!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('has a solid Save, the glass Cancel and no Delete on a new expense', async () => {
    renderAdd();
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toHaveClass('bg-primary', 'text-primary-contrast');
    expect(saveButton).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('glass');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Home page')).toBeInTheDocument();
    expect(actions.addExpense).not.toHaveBeenCalled();
  });

  it('has Save, Cancel and Delete on an expense being edited, Delete in danger', async () => {
    const expense = makeExpense({ id: 'exp-1', amount: 8_00, date: TODAY, accountId: 'acct-main' });
    const onDone = vi.fn();
    renderWithStore(
      <ExpenseForm expense={expense} onDone={onDone} />,
      createStubStore({ data: dataWith([MAIN, SAVINGS, VISA]), today: TODAY }),
    );
    // The amount is the hero here too, but only a new expense starts with the focus.
    expect(screen.getByLabelText('Amount')).toHaveClass('text-[40px]');
    expect(screen.getByLabelText('Amount')).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('bg-primary');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('glass');
    const remove = screen.getByRole('button', { name: 'Delete' });
    expect(remove).toHaveClass('text-danger');
    // An edit has no Repeats row.
    expect(screen.queryByLabelText('Repeats')).not.toBeInTheDocument();
    await userEvent.click(remove);
    expect(actions.deleteExpense).toHaveBeenCalledWith('exp-1');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('has a hero amount, source pills and plain rows for income', () => {
    renderAdd('/add?type=income');
    expect(screen.getByLabelText('Amount')).toHaveClass('text-[40px]', 'font-bold');
    expect(screen.getByLabelText('Amount')).toHaveFocus();
    for (const label of ['Label', 'Goes to', 'Date', 'Note']) {
      const field = screen.getByLabelText(label);
      expect(field, label).toHaveClass('text-right', 'h-11');
      expect(field, label).not.toHaveClass('border-b', 'font-extrabold');
      expect(rowOf(label), label).toHaveClass('border-black/7', 'dark:border-white/8');
    }
    expect(pillsOf('Source')).toEqual(['Salary', 'Extra']);
    expect(screen.queryByRole('group', { name: 'Goes to' })).not.toBeInTheDocument();
    expect(pill('Salary')).toHaveClass('bg-primary', 'text-primary-contrast');
    expect(pill('Extra')).toHaveClass('glass');
    // The type switch is still underline tabs.
    expect(pill('Income')).toHaveClass('border-b-2', 'border-text');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('bg-primary');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('glass');
  });

  it('shows an error under its row', async () => {
    renderAdd();
    await userEvent.type(screen.getByLabelText('Amount'), '5');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-15' } });
    await save();
    const error = screen.getByText('Use today or an earlier date.');
    expect(error).toHaveClass('text-danger');
    expect(rowOf('Date')).toContainElement(error);
    expect(rowOf('Date')).toHaveClass('border-danger');
    expect(screen.getByLabelText('Date')).toHaveAccessibleDescription(
      'Use today or an earlier date.',
    );
  });

  it('shows the amount error under the hero amount', async () => {
    renderAdd();
    await save();
    expect(screen.getByLabelText('Amount')).toHaveAccessibleDescription(
      'Enter an amount like 12.50',
    );
    expect(screen.getByLabelText('Amount').parentElement).toHaveClass('border-danger');
  });
});

describe('the Add screen header', () => {
  it('has a round Back button before a plain page title', () => {
    renderAdd();
    const back = screen.getByRole('button', { name: 'Back' });
    const title = screen.getByRole('heading', { level: 1, name: 'Add' });
    expect(back).toHaveClass('glass', 'size-11', 'rounded-full');
    expect(title).toHaveClass('text-page');
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('goes Home from Back when the screen was opened first', async () => {
    renderAdd();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Home page')).toBeInTheDocument();
    expect(actions.addExpense).not.toHaveBeenCalled();
  });

  it('goes back in history from Back when the screen was opened from another', async () => {
    const data = dataWith([MAIN, SAVINGS, VISA]);
    renderWithStore(
      <MemoryRouter initialEntries={['/other', '/add']} initialIndex={1}>
        <Routes>
          <Route path="/add" element={<AddScreen />} />
          <Route path="/other" element={<p>Other page</p>} />
        </Routes>
      </MemoryRouter>,
      createStubStore({ data, today: TODAY }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Other page')).toBeInTheDocument();
  });
});
