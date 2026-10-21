import type { StoreApi } from 'zustand/vanilla';
import { crossesOver, limitAlerts } from '@/domain/alerts';
import { bucketBalances } from '@/domain/balances';
import type { LimitStatus } from '@/domain/budget';
import { categoryLabel } from '@/domain/budget';
import type { LocalDate } from '@/domain/dates';
import { debtRemoval } from '@/domain/debts';
import {
  defaultSettings,
  type Bucket,
  type BudgetLimit,
  type Category,
  type Cycle,
  type Debt,
  type Expense,
  type Goal,
  type Income,
  type PaymentMethod,
  type Profile,
  type Settings,
  type Subscription,
  type Transaction,
} from '@/domain/entities';
import { newId, nowIso } from '@/domain/ids';
import { minorDigits } from '@/domain/money';
import { dayOfMonth, monthKey } from '@/domain/periods';
import { nextOccurrence } from '@/domain/recurrence';
import type { EntityOf, TableName, TableRecord } from '@/domain/snapshot';
import type { AppState } from './appStore';

export interface ExpenseInput {
  amount: number;
  category: Category;
  date: LocalDate;
  note: string;
  paymentMethod: PaymentMethod;
  cardId: string | null;
  repeat: Cycle | null;
}
export interface IncomeInput {
  amount: number;
  source: 'salary' | 'extra';
  label: string;
  date: LocalDate;
  bucket: 'cash' | 'savings';
  note: string;
}
export interface SubscriptionInput {
  id?: string;
  name: string;
  amount: number;
  cycle: Cycle;
  nextRenewal: LocalDate;
  category: Category;
  paymentMethod: PaymentMethod;
  cardId: string | null;
}
export interface LimitInput {
  id?: string;
  scope: 'category' | 'overall';
  category: Category | null;
  period: 'weekly' | 'monthly';
  amount: number;
  reserve: boolean;
}
export interface GoalInput {
  id?: string;
  name: string;
  kind: Goal['kind'];
  target: number;
  current: number;
  deadline: LocalDate | null;
}
export interface DebtInput {
  id?: string;
  name: string;
  kind: Debt['kind'];
  openingBalance: number;
  interestRate: number;
  minimumPayment: number;
  creditLimit: number | null;
  statementDay: number | null;
  dueDay: number | null;
  payInFull: boolean;
}
export interface CardInput {
  name: string;
  balance: number;
  creditLimit: number | null;
  dueDay: number | null;
  payInFull: boolean;
}
export interface OnboardingInput {
  name: string;
  currency: string;
  openingCash: number;
  openingSavings: number;
  salary: { monthlyAmount: number; payDay: number } | null;
  cards: CardInput[];
}

export const FUTURE = 'Use today or an earlier date.';

export type FinanceActions = ReturnType<typeof createFinanceActions>;

/** Builds entities from form input and saves them. All dates are checked against the store's today. */
export function createFinanceActions(store: StoreApi<AppState>) {
  const state = () => store.getState();
  const today = () => state().today;
  const weekStartsOn = () => state().data.tables.settings[0]?.weekStartsOn ?? 1;
  const stamp = () => {
    const t = nowIso();
    return { createdAt: t, updatedAt: t };
  };
  function find<T extends TableName>(table: T, id: string): EntityOf<T> {
    const row = (state().data.tables[table] as Array<EntityOf<T>>).find((r) => r.id === id);
    if (!row) throw new Error('That item no longer exists.');
    return row;
  }
  const notFuture = (d: LocalDate) => {
    if (d > today()) throw new Error(FUTURE);
  };
  const cardFor = (method: PaymentMethod, cardId: string | null) =>
    method === 'credit_card' ? cardId : null;

  return {
    async addExpense(input: ExpenseInput): Promise<{ expense: Expense; alerts: LimitStatus[] }> {
      notFuture(input.date);
      const expense: Expense = {
        id: newId(),
        ...stamp(),
        amount: input.amount,
        category: input.category,
        date: input.date,
        note: input.note,
        paymentMethod: input.paymentMethod,
        cardId: cardFor(input.paymentMethod, input.cardId),
        recurrence: input.repeat ? { cycle: input.repeat } : null,
        subscriptionId: null,
      };
      const items: TableRecord[] = [];
      if (input.repeat) {
        const anchorDay = dayOfMonth(input.date);
        const sub: Subscription = {
          id: newId(),
          ...stamp(),
          name: input.note.trim() || categoryLabel(input.category),
          amount: input.amount,
          cycle: input.repeat,
          nextRenewal: nextOccurrence(input.date, input.repeat, anchorDay),
          anchorDay,
          category: input.category,
          paymentMethod: input.paymentMethod,
          cardId: expense.cardId,
          status: 'active',
          audit: null,
          auditedAt: null,
          note: '',
        };
        expense.subscriptionId = sub.id;
        items.push({ table: 'subscription', record: sub });
      }
      items.push({ table: 'expense', record: expense });
      const before = state().data;
      await state().putMany(items);
      const alerts = limitAlerts(before, state().data, today(), weekStartsOn());
      if (input.repeat) await state().sync(); // a backdated repeat may already have renewals due
      return { expense, alerts };
    },

    /** Limits this expense would push past 100% (for strict-tone confirmation). */
    wouldCrossOver(input: ExpenseInput): LimitStatus[] {
      const probe: Expense = {
        id: '__probe__',
        ...stamp(),
        amount: input.amount,
        category: input.category,
        date: input.date,
        note: '',
        paymentMethod: input.paymentMethod,
        cardId: cardFor(input.paymentMethod, input.cardId),
        recurrence: null,
        subscriptionId: null,
      };
      return crossesOver(state().data, probe, today(), weekStartsOn());
    },

    async updateExpense(id: string, patch: Partial<Omit<ExpenseInput, 'repeat'>>) {
      const current = find('expense', id);
      const next: Expense = { ...current, ...patch, updatedAt: nowIso() };
      next.cardId = cardFor(next.paymentMethod, next.cardId);
      notFuture(next.date);
      await state().put('expense', next);
    },

    deleteExpense: (id: string) => state().remove('expense', id),

    async addIncome(input: IncomeInput): Promise<Income> {
      notFuture(input.date);
      const period = input.source === 'salary' ? monthKey(input.date) : null;
      const expected = state().data.tables.income.find(
        (i) =>
          i.source === 'salary' &&
          (i.status === 'expected' || i.status === 'skipped') &&
          period &&
          i.period === period,
      );
      const income: Income = expected
        ? { ...expected, ...input, period, status: 'confirmed', updatedAt: nowIso() }
        : { id: newId(), ...stamp(), ...input, status: 'confirmed', recurrence: null, period };
      await state().put('income', income);
      return income;
    },

    async confirmIncome(id: string, amount: number) {
      await state().put('income', {
        ...find('income', id),
        amount,
        status: 'confirmed',
        updatedAt: nowIso(),
      });
    },

    /** Marks an expected salary as never arrived: it stops counting and sync won't bring it back. */
    async skipIncome(id: string) {
      await state().put('income', {
        ...find('income', id),
        status: 'skipped',
        updatedAt: nowIso(),
      });
    },

    async deleteIncome(id: string) {
      const income = find('income', id);
      // Removing an expected salary would let sync recreate it, so it becomes a skip.
      if (income.source === 'salary' && income.status === 'expected' && income.period) {
        return state().put('income', { ...income, status: 'skipped', updatedAt: nowIso() });
      }
      await state().remove('income', id);
    },

    async saveSubscription(input: SubscriptionInput) {
      const existing = input.id ? find('subscription', input.id) : null;
      const sub: Subscription = {
        ...(existing ?? {
          id: newId(),
          ...stamp(),
          status: 'active' as const,
          audit: null,
          auditedAt: null,
          note: '',
        }),
        name: input.name,
        amount: input.amount,
        cycle: input.cycle,
        nextRenewal: input.nextRenewal,
        anchorDay:
          existing && existing.nextRenewal === input.nextRenewal
            ? existing.anchorDay
            : dayOfMonth(input.nextRenewal),
        category: input.category,
        paymentMethod: input.paymentMethod,
        cardId: cardFor(input.paymentMethod, input.cardId),
        updatedAt: nowIso(),
      };
      await state().put('subscription', sub);
      await state().sync();
      return sub;
    },

    async setSubscriptionStatus(id: string, status: Subscription['status']) {
      const sub = find('subscription', id);
      let nextRenewal = sub.nextRenewal;
      // Resuming: renewals missed while cancelled were never paid, so don't charge them now.
      if (status === 'active') {
        while (nextRenewal < today())
          nextRenewal = nextOccurrence(nextRenewal, sub.cycle, sub.anchorDay);
      }
      await state().put('subscription', { ...sub, status, nextRenewal, updatedAt: nowIso() });
    },

    /** Marking stamps `auditedAt`; removing the mark clears it. */
    async setSubscriptionAudit(id: string, audit: Subscription['audit']) {
      const at = nowIso();
      await state().put('subscription', {
        ...find('subscription', id),
        audit,
        auditedAt: audit === null ? null : at,
        updatedAt: at,
      });
    },

    /** Past charges stay as ordinary expenses. */
    deleteSubscription: (id: string) => state().remove('subscription', id),

    async saveLimit(input: LimitInput) {
      const existing = input.id ? find('budgetLimit', input.id) : null;
      const limit: BudgetLimit = {
        ...(existing ?? { id: newId(), ...stamp() }),
        scope: input.scope,
        category: input.scope === 'overall' ? null : input.category,
        period: input.period,
        amount: input.amount,
        warnAt: [80, 100, 120],
        reserve: input.reserve,
        includeInvestments: false,
        updatedAt: nowIso(),
      };
      await state().put('budgetLimit', limit);
      return limit;
    },

    deleteLimit: (id: string) => state().remove('budgetLimit', id),

    async saveGoal(input: GoalInput) {
      const existing = input.id ? find('goal', input.id) : null;
      const goal: Goal = {
        ...(existing ?? { id: newId(), ...stamp() }),
        name: input.name,
        kind: input.kind,
        target: input.target,
        current: input.current,
        deadline: input.deadline,
        updatedAt: nowIso(),
      };
      await state().put('goal', goal);
      return goal;
    },

    deleteGoal: (id: string) => state().remove('goal', id),

    /** Moves money from cash to savings and counts it toward the goal, together. */
    async contributeToGoal(goalId: string, amount: number, date: LocalDate) {
      notFuture(date);
      const goal = find('goal', goalId);
      const transfer: Transaction = {
        id: newId(),
        ...stamp(),
        type: 'transfer',
        amount,
        date,
        from: 'cash',
        to: 'savings',
        debtId: null,
        note: `Goal: ${goal.name}`,
      };
      await state().putMany([
        { table: 'transaction', record: transfer },
        { table: 'goal', record: { ...goal, current: goal.current + amount, updatedAt: nowIso() } },
      ]);
    },

    async saveDebt(input: DebtInput) {
      const existing = input.id ? find('debt', input.id) : null;
      const debt: Debt = {
        ...(existing ?? { id: newId(), ...stamp(), openingDate: today() }),
        name: input.name,
        kind: input.kind,
        openingBalance: input.openingBalance,
        interestRate: input.interestRate,
        minimumPayment: input.minimumPayment,
        creditLimit: input.creditLimit,
        statementDay: input.statementDay,
        dueDay: input.dueDay,
        payInFull: input.payInFull,
        updatedAt: nowIso(),
      };
      await state().put('debt', debt);
      return debt;
    },

    /** Deletes a card or loan, or archives one with history; `debtRemoval` says which, in one write. */
    async deleteDebt(id: string) {
      const debt = find('debt', id);
      const { subscriptions, archive } = debtRemoval(state().data, id);
      const at = nowIso();
      const moved = subscriptions.map((s): TableRecord => ({
        table: 'subscription',
        record: { ...s, paymentMethod: 'debit', cardId: null, updatedAt: at },
      }));
      if (archive) {
        await state().putMany([
          ...moved,
          { table: 'debt', record: { ...debt, archivedOn: today(), updatedAt: at } },
        ]);
      } else {
        await state().putMany(moved, [{ table: 'debt', id }]);
      }
    },

    async payDebt(debtId: string, amount: number, from: 'cash' | 'savings', date: LocalDate) {
      notFuture(date);
      const debt = find('debt', debtId);
      const payment: Transaction = {
        id: newId(),
        ...stamp(),
        type: debt.kind === 'credit_card' ? 'card_payment' : 'debt_payment',
        amount,
        date,
        from,
        to: null,
        debtId,
        note: `Paid ${debt.name}`,
      };
      await state().put('transaction', payment);
      return payment;
    },

    deleteTransaction: (id: string) => state().remove('transaction', id),

    /** Corrects drift: records the difference between what you have and what Funcial thinks. */
    async setActualBalance(
      bucket: Extract<Bucket, 'cash' | 'savings'>,
      actual: number,
      date: LocalDate,
    ) {
      notFuture(date);
      const delta = actual - bucketBalances(state().data, date)[bucket];
      if (delta === 0) return null;
      const adjustment: Transaction = {
        id: newId(),
        ...stamp(),
        type: 'adjustment',
        amount: delta,
        date,
        from: null,
        to: bucket,
        debtId: null,
        note: 'Balance correction',
      };
      await state().put('transaction', adjustment);
      return adjustment;
    },

    /** The currency is not here: `changeCurrency` is the one way to change it, with its holdings. */
    async updateProfile(patch: Partial<Omit<Profile, 'id' | 'createdAt' | 'currency'>>) {
      const profile = state().data.tables.profile[0];
      if (!profile) throw new Error('Finish setting up first.');
      const next = { ...profile, ...patch, updatedAt: nowIso() };
      const was = profile.salary;
      const now = next.salary;
      // A new or changed salary only expects pay days after today.
      if (now && (!was || was.monthlyAmount !== now.monthlyAmount || was.payDay !== now.payDay)) {
        next.salary = { monthlyAmount: now.monthlyAmount, payDay: now.payDay, since: today() };
      } else if (now && was) {
        next.salary = { ...now, ...(was.since ? { since: was.since } : {}) };
      }
      await state().put('profile', next);
    },

    /**
     * Relabels every amount in a currency with the same decimals: the numbers stay, and nothing is
     * converted. Stored exchange rates were for the old currency, so each holding loses its own and
     * keeps the rest of its quote; the next Invest refresh fetches rates for the new one. A holding
     * with no quote, priced by hand in the old currency, is relabelled too: nothing else would say
     * what it trades in, and it would drop out of the totals. The rate Invest is shown at was for the
     * old currency too, so it goes, and Invest shown in the new currency is just the default. One write.
     */
    async changeCurrency(currency: string) {
      const profile = state().data.tables.profile[0];
      if (!profile) throw new Error('Finish setting up first.');
      if (currency === profile.currency) return;
      // Amounts are minor units: another decimal count would misread every one of them.
      if (minorDigits(currency) !== minorDigits(profile.currency)) {
        throw new Error(`${currency} has different decimals from ${profile.currency}.`);
      }
      const at = nowIso();
      const holdings: TableRecord[] = state().data.tables.holding.flatMap((h) => {
        const quote = h.quote?.fxRate == null ? h.quote : { ...h.quote, fxRate: null };
        const held = h.quote === null && h.currency === profile.currency ? currency : h.currency;
        if (quote === h.quote && held === h.currency) return [];
        return [
          { table: 'holding' as const, record: { ...h, currency: held, quote, updatedAt: at } },
        ];
      });
      const settings = state().data.tables.settings[0];
      const invest: TableRecord[] =
        settings && (settings.investFx || settings.investCurrency === currency)
          ? [
              {
                table: 'settings',
                record: {
                  ...settings,
                  investCurrency:
                    settings.investCurrency === currency ? null : settings.investCurrency,
                  investFx: null,
                  updatedAt: at,
                },
              },
            ]
          : [];
      await state().putMany([
        { table: 'profile', record: { ...profile, currency, updatedAt: at } },
        ...holdings,
        ...invest,
      ]);
    },

    async updateSettings(patch: Partial<Omit<Settings, 'id' | 'createdAt'>>) {
      const settings = state().data.tables.settings[0] ?? defaultSettings(nowIso());
      await state().put('settings', { ...settings, ...patch, updatedAt: nowIso() });
    },

    async completeOnboarding(input: OnboardingInput) {
      const at = nowIso();
      const profile: Profile = {
        id: 'profile',
        createdAt: at,
        updatedAt: at,
        name: input.name.trim(),
        currency: input.currency,
        openingDate: today(),
        openingCash: input.openingCash,
        openingSavings: input.openingSavings,
        salary: input.salary,
        onboardedAt: at,
      };
      const cards: TableRecord[] = input.cards.map((c) => ({
        table: 'debt',
        record: {
          id: newId(),
          createdAt: at,
          updatedAt: at,
          name: c.name.trim(),
          kind: 'credit_card',
          openingBalance: c.balance,
          openingDate: today(),
          interestRate: 0,
          minimumPayment: 0,
          creditLimit: c.creditLimit,
          statementDay: null,
          dueDay: c.dueDay,
          payInFull: c.payInFull,
        },
      }));
      await state().putMany([{ table: 'profile', record: profile }, ...cards]);
      await state().sync();
    },
  };
}
