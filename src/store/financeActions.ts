import type { StoreApi } from 'zustand/vanilla';
import {
  accountInUse,
  accountRemoval,
  activeAccounts,
  defaultAccount,
  defaultsFor,
  incomeAccount,
  payingAccount,
  spendingAccount,
} from '@/domain/accounts';
import { crossesOver, limitAlerts } from '@/domain/alerts';
import { accountBalance } from '@/domain/balances';
import type { LimitStatus } from '@/domain/budget';
import { categoryLabel } from '@/domain/budget';
import type { LocalDate } from '@/domain/dates';
import { loanRemoval } from '@/domain/debts';
import {
  defaultSettings,
  type Account,
  type AccountKind,
  type BudgetLimit,
  type Category,
  type CreditTerms,
  type Cycle,
  type Debt,
  type Expense,
  type Goal,
  type Income,
  type Profile,
  type Settings,
  type Subscription,
  type Transaction,
} from '@/domain/entities';
import { newId, nowIso } from '@/domain/ids';
import { minorDigits } from '@/domain/money';
import { dayOfMonth, monthKey } from '@/domain/periods';
import { nextOccurrence } from '@/domain/recurrence';
import type { DataSnapshot, EntityOf, TableName, TableRecord } from '@/domain/snapshot';
import { MAIN_ACCOUNT_ID } from '@/domain/upgrades/v10Accounts';
import type { AppState } from './appStore';

export interface ExpenseInput {
  amount: number;
  category: Category;
  date: LocalDate;
  note: string;
  /** The account it was paid with: on a credit card it raises what is owed. */
  accountId: string;
  repeat: Cycle | null;
}
export interface IncomeInput {
  amount: number;
  source: 'salary' | 'extra';
  label: string;
  date: LocalDate;
  /** The account it is paid into. */
  accountId: string;
  note: string;
}
export interface SubscriptionInput {
  id?: string;
  name: string;
  amount: number;
  cycle: Cycle;
  nextRenewal: LocalDate;
  category: Category;
  /** The account each renewal is paid with. */
  accountId: string;
}
/** A new account takes its kind's look and Available choice (`defaultsFor`) where these leave them out. */
export interface AccountInput {
  id?: string;
  name: string;
  kind: AccountKind;
  skin?: string;
  last4: string | null;
  openingBalance: number;
  inAvailable?: boolean;
  credit: CreditTerms | null;
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
/** A loan. A credit card is an account (`AccountInput`). */
export interface DebtInput {
  id?: string;
  name: string;
  openingBalance: number;
  interestRate: number;
  minimumPayment: number;
  creditLimit: number | null;
  statementDay: number | null;
  dueDay: number | null;
  payInFull: boolean;
}
/** What setup asks: no money. Balances, a salary and cards are added afterwards, where they live. */
export interface OnboardingInput {
  name: string;
  currency: string;
}

export const FUTURE = 'Use today or an earlier date.';
/** Deleting an account that pays subscriptions needs another account in use for them. */
export const PICK_SUBSCRIPTIONS_TARGET = 'Pick where its subscriptions go.';
export const SAME_ACCOUNT = 'Use two different accounts.';
export const NOT_A_CARD = 'Pick a credit card to pay.';
/** Its history would read the other way: spending as money in, or money in as spending. */
export const CREDIT_SWITCH = "A card with history can't switch between credit and debit.";

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
  /** A transfer between two different accounts, neither of them a credit card. */
  function transferBetween(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    date: LocalDate,
    note: string,
  ): Transaction {
    if (fromAccountId === toAccountId) throw new Error(SAME_ACCOUNT);
    payingAccount(state().data, fromAccountId, today());
    payingAccount(state().data, toAccountId, today());
    return {
      id: newId(),
      ...stamp(),
      type: 'transfer',
      amount,
      date,
      fromAccountId,
      toAccountId,
      debtId: null,
      note,
    };
  }

  return {
    /** Adds an expense. A frozen account refuses it (`ACCOUNT_FROZEN`): an unfrozen one takes it. */
    async addExpense(input: ExpenseInput): Promise<{ expense: Expense; alerts: LimitStatus[] }> {
      notFuture(input.date);
      spendingAccount(state().data, input.accountId, today());
      const expense: Expense = {
        id: newId(),
        ...stamp(),
        amount: input.amount,
        category: input.category,
        date: input.date,
        note: input.note,
        accountId: input.accountId,
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
          accountId: input.accountId,
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
        accountId: input.accountId,
        recurrence: null,
        subscriptionId: null,
      };
      return crossesOver(state().data, probe, today(), weekStartsOn());
    },

    /**
     * Edits an expense. Moving it to another account needs one in use that is not frozen; an expense
     * left on an archived or frozen account (its history) can still be edited.
     */
    async updateExpense(id: string, patch: Partial<Omit<ExpenseInput, 'repeat'>>) {
      const current = find('expense', id);
      const next: Expense = { ...current, ...patch, updatedAt: nowIso() };
      notFuture(next.date);
      if (patch.accountId !== undefined && patch.accountId !== current.accountId) {
        spendingAccount(state().data, patch.accountId, today());
      }
      await state().put('expense', next);
    },

    deleteExpense: (id: string) => state().remove('expense', id),

    async addIncome(input: IncomeInput): Promise<Income> {
      notFuture(input.date);
      incomeAccount(state().data, input.accountId, today());
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

    /**
     * Confirms an expected income into `accountId` (the account it names unless another is picked),
     * which must be one income counts in. Picking another is how a salary expected on an account
     * archived since can still be confirmed.
     */
    async confirmIncome(id: string, amount: number, accountId?: string) {
      const income = find('income', id);
      const to = accountId ?? income.accountId;
      incomeAccount(state().data, to, today());
      await state().put('income', {
        ...income,
        amount,
        accountId: to,
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
      // Only an account the subscription moves to has to be in use and not frozen: one kept on an
      // archived or frozen account, as its history, can still be edited (as `updateExpense` does).
      // Its renewals are not checked at all: a frozen account's subscriptions still renew.
      if (!existing || input.accountId !== existing.accountId) {
        spendingAccount(state().data, input.accountId, today());
      }
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
        accountId: input.accountId,
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

    /**
     * Moves money between two accounts (Main account to Savings, say) and counts it toward the
     * goal, together. The accounts follow the rules of `transfer`.
     */
    async contributeToGoal(
      goalId: string,
      amount: number,
      date: LocalDate,
      fromAccountId: string,
      toAccountId: string,
    ) {
      notFuture(date);
      const goal = find('goal', goalId);
      const transfer = transferBetween(
        fromAccountId,
        toAccountId,
        amount,
        date,
        `Goal: ${goal.name}`,
      );
      await state().putMany([
        { table: 'transaction', record: transfer },
        { table: 'goal', record: { ...goal, current: goal.current + amount, updatedAt: nowIso() } },
      ]);
    },

    /**
     * Adds or edits an account. A new one opens today, after every other one in the carousel,
     * unfrozen, with its kind's look and Available choice where the input leaves them out; an edit
     * keeps its own, unless it changes kind, when it takes the new kind's. A credit card never
     * counts toward Available, whatever the input says. One with history can't switch between
     * credit and the other kinds, as its history would then read the other way.
     */
    async saveAccount(input: AccountInput): Promise<Account> {
      const existing = input.id ? find('account', input.id) : null;
      if (
        existing &&
        (existing.kind === 'credit') !== (input.kind === 'credit') &&
        accountRemoval(state().data, existing.id).archive
      ) {
        throw new Error(CREDIT_SWITCH);
      }
      const defaults = defaultsFor(input.kind);
      const kept = existing?.kind === input.kind ? existing : null;
      const orders = state().data.tables.account.map((a) => a.order);
      const account: Account = {
        ...(existing ?? {
          id: newId(),
          ...stamp(),
          openingDate: today(),
          frozen: false,
          order: Math.max(-1, ...orders) + 1,
        }),
        name: input.name,
        kind: input.kind,
        skin: input.skin ?? kept?.skin ?? defaults.skin,
        last4: input.last4,
        openingBalance: input.openingBalance,
        inAvailable:
          input.kind !== 'credit' &&
          (input.inAvailable ?? kept?.inAvailable ?? defaults.inAvailable),
        credit: input.credit,
        updatedAt: nowIso(),
      };
      await state().put('account', account);
      return account;
    },

    /**
     * Freezes an account, or unfreezes it, for the Freeze button on the Cards tab. A frozen account
     * takes no new expense (`addExpense`, an expense or a subscription moved onto it) and is left out
     * of the pickers for one. Everything else goes on: money still arrives on it and leaves it, what
     * is already on it can be edited, and its subscriptions still renew. One already as asked is not
     * written again. Only an account in use can be frozen.
     */
    async setAccountFrozen(id: string, frozen: boolean): Promise<Account> {
      const account = accountInUse(state().data, id, today());
      if (account.frozen === frozen) return account;
      const next: Account = { ...account, frozen, updatedAt: nowIso() };
      await state().put('account', next);
      return next;
    },

    /**
     * Deletes an account, or archives one with history (`accountRemoval` says which), in one write.
     * The subscriptions it pays move to `moveSubscriptionsTo`, another account in use, so no renewal
     * lands on it. The default once it is gone is `defaultAccount` of what is left: it becomes the
     * settings' default when this one was, and the incomes still expected on this one move to it
     * (none moves when there is none). Those have not counted yet, so they are not history that
     * keeps it. One already archived keeps the day it was archived on.
     */
    async deleteAccount(
      id: string,
      opts: { moveSubscriptionsTo: string | null },
    ): Promise<'deleted' | 'archived'> {
      const account = find('account', id);
      const data = state().data;
      const day = today();
      const at = nowIso();
      const changes: TableRecord[] = [];
      const { subscriptions } = accountRemoval(data, id);
      if (subscriptions.length > 0) {
        const to = opts.moveSubscriptionsTo;
        const inUse = activeAccounts(data.tables.account, day).some((a) => a.id === to);
        if (to === null || to === id || !inUse) throw new Error(PICK_SUBSCRIPTIONS_TARGET);
        for (const s of subscriptions) {
          changes.push({ table: 'subscription', record: { ...s, accountId: to, updatedAt: at } });
        }
      }

      // Archived or deleted, it is out of use from today: the default comes from the others.
      const others: DataSnapshot = {
        ...data,
        tables: { ...data.tables, account: data.tables.account.filter((a) => a.id !== id) },
      };
      const nextDefault = defaultAccount(others, day);
      const moved = new Map<string, Income>();
      if (nextDefault) {
        for (const i of data.tables.income) {
          if (i.accountId !== id || i.status !== 'expected') continue;
          moved.set(i.id, { ...i, accountId: nextDefault.id, updatedAt: at });
        }
      }
      for (const record of moved.values()) changes.push({ table: 'income', record });
      const settings = data.tables.settings[0];
      if (settings?.defaultAccountId === id) {
        changes.push({
          table: 'settings',
          record: { ...settings, defaultAccountId: nextDefault?.id ?? null, updatedAt: at },
        });
      }

      const income = data.tables.income.map((i) => moved.get(i.id) ?? i);
      const { archive } = accountRemoval({ ...data, tables: { ...data.tables, income } }, id);
      if (archive) {
        const archived: Account = {
          ...account,
          archivedOn: account.archivedOn ?? day,
          updatedAt: at,
        };
        await state().putMany([...changes, { table: 'account', record: archived }]);
        return 'archived';
      }
      await state().putMany(changes, [{ table: 'account', id }]);
      return 'deleted';
    },

    /** Moves money between two different accounts, neither a credit card (`payCard` pays one). */
    async transfer(
      fromAccountId: string,
      toAccountId: string,
      amount: number,
      date: LocalDate,
      note: string,
    ): Promise<Transaction> {
      notFuture(date);
      const transfer = transferBetween(fromAccountId, toAccountId, amount, date, note);
      await state().put('transaction', transfer);
      return transfer;
    },

    /** Pays a credit card from a bank account, cash or savings: both what it owes and what pays go down. */
    async payCard(
      cardId: string,
      fromAccountId: string,
      amount: number,
      date: LocalDate,
    ): Promise<Transaction> {
      notFuture(date);
      const card = accountInUse(state().data, cardId, today());
      if (card.kind !== 'credit') throw new Error(NOT_A_CARD);
      payingAccount(state().data, fromAccountId, today());
      const payment: Transaction = {
        id: newId(),
        ...stamp(),
        type: 'card_payment',
        amount,
        date,
        fromAccountId,
        toAccountId: cardId,
        debtId: null,
        note: `Paid ${card.name}`,
      };
      await state().put('transaction', payment);
      return payment;
    },

    /** Adds or edits a loan. A credit card is an account (`saveAccount`). */
    async saveDebt(input: DebtInput) {
      const existing = input.id ? find('debt', input.id) : null;
      const debt: Debt = {
        ...(existing ?? { id: newId(), ...stamp(), openingDate: today() }),
        name: input.name,
        kind: 'loan',
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

    /** Deletes a loan, or archives one with a payment made to it; `loanRemoval` says which. */
    async deleteDebt(id: string) {
      const debt = find('debt', id);
      if (loanRemoval(state().data, id).archive) {
        await state().putMany([
          { table: 'debt', record: { ...debt, archivedOn: today(), updatedAt: nowIso() } },
        ]);
      } else {
        await state().putMany([], [{ table: 'debt', id }]);
      }
    },

    /** Pays a loan from a bank account, cash or savings. */
    async payDebt(
      loanId: string,
      fromAccountId: string,
      amount: number,
      date: LocalDate,
    ): Promise<Transaction> {
      notFuture(date);
      const loan = find('debt', loanId);
      payingAccount(state().data, fromAccountId, today());
      const payment: Transaction = {
        id: newId(),
        ...stamp(),
        type: 'debt_payment',
        amount,
        date,
        fromAccountId,
        toAccountId: null,
        debtId: loanId,
        note: `Paid ${loan.name}`,
      };
      await state().put('transaction', payment);
      return payment;
    },

    deleteTransaction: (id: string) => state().remove('transaction', id),

    /**
     * Corrects drift: records the difference between what an account holds (for a credit card,
     * what is owed on it) and what Funcial thinks, as an adjustment to that account.
     */
    async setActualBalance(accountId: string, actual: number, date: LocalDate) {
      notFuture(date);
      const account = accountInUse(state().data, accountId, today());
      const delta = actual - accountBalance(account, state().data, date);
      if (delta === 0) return null;
      const adjustment: Transaction = {
        id: newId(),
        ...stamp(),
        type: 'adjustment',
        amount: delta,
        date,
        fromAccountId: null,
        toAccountId: accountId,
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

    /**
     * Writes the profile (no salary), Main account (debit, opening at 0 today) and the settings that
     * name it the default, in one write. It is the one account: the forms that pick one (Pay, an
     * expense, a subscription, …) need it, and Home asks afterwards what is in it. Savings and cards
     * are added on the Cards tab.
     */
    async completeOnboarding(input: OnboardingInput) {
      const at = nowIso();
      const opened = today();
      const profile: Profile = {
        id: 'profile',
        createdAt: at,
        updatedAt: at,
        name: input.name.trim(),
        currency: input.currency,
        openingDate: opened,
        salary: null,
        onboardedAt: at,
      };
      const main: Account = {
        id: MAIN_ACCOUNT_ID,
        createdAt: at,
        updatedAt: at,
        name: 'Main account',
        kind: 'debit',
        ...defaultsFor('debit'),
        last4: null,
        openingBalance: 0,
        openingDate: opened,
        frozen: false,
        order: 0,
        credit: null,
      };
      const settings = state().data.tables.settings[0] ?? defaultSettings(at);
      await state().putMany([
        { table: 'profile', record: profile },
        { table: 'account', record: main },
        {
          table: 'settings',
          record: { ...settings, defaultAccountId: MAIN_ACCOUNT_ID, updatedAt: at },
        },
      ]);
      await state().sync();
    },
  };
}
