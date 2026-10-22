import { describe, expect, it } from 'vitest';
import {
  localIso,
  makeAccount,
  makeChallenge,
  makeCheckIn,
  makeDebt,
  makeDividend,
  makeExpense,
  makeGoal,
  makeHolding,
  makeIncome,
  makeLedgerEntry,
  makeLimit,
  makeProfile,
  makeSale,
  makeSettings,
  makeStreakFreeze,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import { toLocalDate } from './dates';
import * as entities from './entities';
import {
  AccountKindSchema,
  AccountSchema,
  BudgetLimitSchema,
  ChallengeSchema,
  CheckInSchema,
  DebtSchema,
  defaultSettings,
  DividendSchema,
  ExpenseSchema,
  GoalSchema,
  HoldingSchema,
  IncomeSchema,
  LedgerEntrySchema,
  ProfileSchema,
  SaleSchema,
  SettingsSchema,
  StreakFreezeSchema,
  SubscriptionSchema,
  TransactionSchema,
  type CreditTerms,
} from './entities';

const ok = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe('fixtures', () => {
  it('produce valid entities', () => {
    expect(ok(ProfileSchema, makeProfile())).toBe(true);
    expect(ok(SettingsSchema, makeSettings())).toBe(true);
    expect(ok(AccountSchema, makeAccount())).toBe(true);
    expect(ok(ExpenseSchema, makeExpense())).toBe(true);
    expect(ok(IncomeSchema, makeIncome())).toBe(true);
    expect(ok(SubscriptionSchema, makeSubscription())).toBe(true);
    expect(ok(BudgetLimitSchema, makeLimit())).toBe(true);
    expect(ok(DebtSchema, makeDebt())).toBe(true);
    expect(ok(GoalSchema, makeGoal())).toBe(true);
    expect(ok(TransactionSchema, makeTransaction())).toBe(true);
    expect(ok(LedgerEntrySchema, makeLedgerEntry())).toBe(true);
    expect(ok(CheckInSchema, makeCheckIn())).toBe(true);
    expect(ok(ChallengeSchema, makeChallenge())).toBe(true);
    expect(ok(StreakFreezeSchema, makeStreakFreeze())).toBe(true);
    expect(ok(HoldingSchema, makeHolding())).toBe(true);
    expect(ok(DividendSchema, makeDividend())).toBe(true);
    expect(ok(SaleSchema, makeSale())).toBe(true);
  });

  it('put the money rows on Main account', () => {
    expect(makeAccount()).toMatchObject({ id: 'acct-main', kind: 'debit', credit: null });
    expect(makeExpense().accountId).toBe('acct-main');
    expect(makeIncome().accountId).toBe('acct-main');
    expect(makeSubscription().accountId).toBe('acct-main');
  });

  it('localIso builds a timestamp that falls on the given local day, at noon by default', () => {
    expect(toLocalDate(new Date(localIso('2026-10-15')))).toBe('2026-10-15');
    expect(new Date(localIso('2026-10-15')).getHours()).toBe(12);
    expect(new Date(localIso('2026-10-15', 23)).getHours()).toBe(23);
    expect(toLocalDate(new Date(localIso('2026-10-15', 0)))).toBe('2026-10-15');
    expect(toLocalDate(new Date(localIso('2026-10-15', 23)))).toBe('2026-10-15');
  });
});

describe('game entities', () => {
  it('rejects fractional XP', () =>
    expect(LedgerEntrySchema.safeParse(makeLedgerEntry({ xp: 1.5 })).success).toBe(false));
  it('rejects fractional coins and an empty key', () => {
    expect(ok(LedgerEntrySchema, makeLedgerEntry({ coins: 0.5 }))).toBe(false);
    expect(ok(LedgerEntrySchema, makeLedgerEntry({ key: '' }))).toBe(false);
  });
  it('lets a ledger entry carry negative amounts (reversals and purchases)', () => {
    expect(ok(LedgerEntrySchema, makeLedgerEntry({ kind: 'reversal', xp: -10, coins: -2 }))).toBe(
      true,
    );
    expect(ok(LedgerEntrySchema, makeLedgerEntry({ kind: 'purchase', xp: 0, coins: -30 }))).toBe(
      true,
    );
    expect(ok(LedgerEntrySchema, makeLedgerEntry({ kind: 'gift' as never }))).toBe(false);
  });
  it('rejects a challenge that ends before it starts, but allows a one-day one', () => {
    expect(
      ChallengeSchema.safeParse(makeChallenge({ start: '2026-10-15', end: '2026-10-14' })).success,
    ).toBe(false);
    expect(ok(ChallengeSchema, makeChallenge({ start: '2026-10-15', end: '2026-10-15' }))).toBe(
      true,
    );
  });
  it('only knows the four challenge kinds and two statuses', () => {
    expect(ok(ChallengeSchema, makeChallenge({ kind: 'no-spend-weekend' }))).toBe(true);
    expect(ok(ChallengeSchema, makeChallenge({ kind: 'subscription-audit' }))).toBe(true);
    expect(ok(ChallengeSchema, makeChallenge({ kind: 'budget-30' }))).toBe(true);
    expect(ok(ChallengeSchema, makeChallenge({ kind: 'emergency-sprint' }))).toBe(true);
    expect(ok(ChallengeSchema, makeChallenge({ kind: 'dry-january' as never }))).toBe(false);
    expect(ok(ChallengeSchema, makeChallenge({ status: 'active' }))).toBe(true);
    expect(ok(ChallengeSchema, makeChallenge({ status: 'abandoned' }))).toBe(true);
    expect(ok(ChallengeSchema, makeChallenge({ status: 'won' as never }))).toBe(false);
  });
  it('keeps the baseline whole and the goal positive, both optional as null', () => {
    expect(ok(ChallengeSchema, makeChallenge({ baseline: null, goal: null }))).toBe(true);
    expect(ok(ChallengeSchema, makeChallenge({ baseline: 0, goal: 1 }))).toBe(true);
    expect(ok(ChallengeSchema, makeChallenge({ baseline: 10.5 }))).toBe(false);
    expect(ok(ChallengeSchema, makeChallenge({ goal: 0 }))).toBe(false);
  });
  it('checks the check-in kind and day', () => {
    expect(ok(CheckInSchema, makeCheckIn({ kind: 'weekly' }))).toBe(true);
    expect(ok(CheckInSchema, makeCheckIn({ kind: 'monthly' as never }))).toBe(false);
    expect(ok(CheckInSchema, makeCheckIn({ date: '2026-02-30' }))).toBe(false);
  });
  it('checks the streak a freeze protects and its day', () => {
    expect(ok(StreakFreezeSchema, makeStreakFreeze({ streak: 'checkin' }))).toBe(true);
    expect(ok(StreakFreezeSchema, makeStreakFreeze({ streak: 'saving' as never }))).toBe(false);
    expect(ok(StreakFreezeSchema, makeStreakFreeze({ date: 'yesterday' }))).toBe(false);
  });
  it('needs a non-empty theme, avatar and frame in the cosmetics', () => {
    const { cosmetics } = makeSettings();
    expect(ok(SettingsSchema, makeSettings({ cosmetics: { ...cosmetics, theme: '' } }))).toBe(
      false,
    );
    expect(ok(SettingsSchema, makeSettings({ cosmetics: { ...cosmetics, avatar: '' } }))).toBe(
      false,
    );
    expect(ok(SettingsSchema, makeSettings({ cosmetics: { ...cosmetics, frame: '' } }))).toBe(
      false,
    );
    const without: Record<string, unknown> = { ...makeSettings() };
    delete without.cosmetics;
    expect(ok(SettingsSchema, without)).toBe(false);
  });
  it('needs auditedAt on a subscription, as a timestamp or null', () => {
    expect(ok(SubscriptionSchema, makeSubscription({ auditedAt: null }))).toBe(true);
    expect(
      ok(SubscriptionSchema, makeSubscription({ auditedAt: '2026-10-15T09:00:00.000Z' })),
    ).toBe(true);
    expect(ok(SubscriptionSchema, makeSubscription({ auditedAt: 'today' }))).toBe(false);
    const without: Record<string, unknown> = { ...makeSubscription() };
    delete without.auditedAt;
    expect(ok(SubscriptionSchema, without)).toBe(false);
  });
});

describe('money', () => {
  it('must be whole minor units', () => {
    expect(ok(ExpenseSchema, makeExpense({ amount: 12.5 }))).toBe(false);
    expect(ok(ExpenseSchema, makeExpense({ amount: 0 }))).toBe(false);
    expect(ok(ExpenseSchema, makeExpense({ amount: -100 }))).toBe(false);
    expect(ok(GoalSchema, makeGoal({ current: 0 }))).toBe(true);
  });
});

describe('Account', () => {
  const terms: CreditTerms = {
    limit: 3_000_00,
    statementDay: 1,
    dueDay: 21,
    payInFull: true,
    minimumPayment: 25_00,
    interestRate: 22.9,
  };
  const card = (over: Partial<entities.Account> = {}) =>
    makeAccount({
      id: 'card-1',
      name: 'Visa',
      kind: 'credit',
      skin: 'violet',
      credit: terms,
      ...over,
    });

  it('knows four kinds', () => {
    expect(AccountKindSchema.options).toEqual(['debit', 'credit', 'savings', 'cash']);
    for (const kind of ['debit', 'savings', 'cash'] as const) {
      expect(ok(AccountSchema, makeAccount({ kind }))).toBe(true);
    }
    expect(ok(AccountSchema, card())).toBe(true);
    expect(ok(AccountSchema, makeAccount({ kind: 'loan' as never }))).toBe(false);
  });

  it('has credit terms exactly when it is a credit card', () => {
    expect(ok(AccountSchema, card({ credit: null }))).toBe(false);
    for (const kind of ['debit', 'savings', 'cash'] as const) {
      expect(ok(AccountSchema, makeAccount({ kind, credit: terms })), kind).toBe(false);
    }
  });

  it('checks the credit terms', () => {
    expect(ok(AccountSchema, card({ credit: { ...terms, limit: null } }))).toBe(true);
    expect(
      ok(AccountSchema, card({ credit: { ...terms, statementDay: null, dueDay: null } })),
    ).toBe(true);
    for (const bad of [
      { limit: -1 },
      { limit: 10.5 },
      { dueDay: 0 },
      { statementDay: 32 },
      { minimumPayment: -1 },
      { interestRate: -0.1 },
      { payInFull: 'yes' },
    ]) {
      expect(
        ok(AccountSchema, card({ credit: { ...terms, ...bad } as never })),
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it('shows at most the last four digits, or none', () => {
    expect(ok(AccountSchema, makeAccount({ last4: '0042' }))).toBe(true);
    expect(ok(AccountSchema, makeAccount({ last4: null }))).toBe(true);
    for (const last4 of ['42', '12345', 'abcd', '4111 1111 1111 1111', '']) {
      expect(ok(AccountSchema, makeAccount({ last4 })), last4).toBe(false);
    }
  });

  it('takes a signed whole opening balance and a place in the carousel', () => {
    expect(ok(AccountSchema, makeAccount({ openingBalance: -50_00 }))).toBe(true);
    expect(ok(AccountSchema, makeAccount({ openingBalance: 10.5 }))).toBe(false);
    expect(ok(AccountSchema, makeAccount({ order: 7 }))).toBe(true);
    expect(ok(AccountSchema, makeAccount({ order: -1 }))).toBe(false);
    expect(ok(AccountSchema, makeAccount({ order: 1.5 }))).toBe(false);
  });

  it('needs a name and a skin, and may be archived from a day', () => {
    expect(ok(AccountSchema, makeAccount({ name: '' }))).toBe(false);
    expect(ok(AccountSchema, makeAccount({ skin: '' }))).toBe(false);
    expect(ok(AccountSchema, makeAccount({ archivedOn: '2026-09-01' }))).toBe(true);
    expect(ok(AccountSchema, makeAccount({ archivedOn: '2026-02-30' }))).toBe(false);
    expect(ok(AccountSchema, makeAccount({ openingDate: 'today' }))).toBe(false);
  });
});

describe('the account a row names', () => {
  it('is required on an expense, a subscription and an income', () => {
    expect(ok(ExpenseSchema, makeExpense({ accountId: 'card-1' }))).toBe(true);
    expect(ok(SubscriptionSchema, makeSubscription({ accountId: 'card-1' }))).toBe(true);
    expect(ok(IncomeSchema, makeIncome({ accountId: 'acct-savings' }))).toBe(true);
    expect(ok(ExpenseSchema, makeExpense({ accountId: '' }))).toBe(false);
    expect(ok(SubscriptionSchema, makeSubscription({ accountId: '' }))).toBe(false);
    expect(ok(IncomeSchema, makeIncome({ accountId: '' }))).toBe(false);
    for (const [schema, value] of [
      [ExpenseSchema, makeExpense()],
      [SubscriptionSchema, makeSubscription()],
      [IncomeSchema, makeIncome()],
    ] as const) {
      const without: Record<string, unknown> = { ...value };
      delete without.accountId;
      expect(ok(schema, without)).toBe(false);
    }
  });

  it('replaces the payment method, the card and the bucket', () => {
    expect(Object.keys(ExpenseSchema.shape)).not.toContain('paymentMethod');
    expect(Object.keys(ExpenseSchema.shape)).not.toContain('cardId');
    expect(Object.keys(SubscriptionSchema.shape)).not.toContain('paymentMethod');
    expect(Object.keys(SubscriptionSchema.shape)).not.toContain('cardId');
    expect(Object.keys(IncomeSchema.shape)).not.toContain('bucket');
    expect(Object.keys(TransactionSchema.shape)).not.toContain('from');
    expect(Object.keys(TransactionSchema.shape)).not.toContain('to');
    expect(Object.keys(DividendSchema.shape)).not.toContain('bucket');
    expect(Object.keys(SaleSchema.shape)).not.toContain('to');
  });
});

describe('Debt', () => {
  it('is a loan: credit cards are accounts now', () => {
    expect(ok(DebtSchema, makeDebt())).toBe(true);
    expect(makeDebt().kind).toBe('loan');
    expect(ok(DebtSchema, makeDebt({ kind: 'credit_card' as never }))).toBe(false);
    expect(ok(DebtSchema, makeDebt({ archivedOn: '2026-09-01' }))).toBe(true);
  });
});

describe('removed schemas', () => {
  it('are gone', () => {
    for (const name of [
      'PaymentMethodSchema',
      'BucketSchema',
      'SalaryFreezeSchema',
      'BuyAskSchema',
      'BuyDecisionSchema',
      'AboutYouSchema',
      'VerdictSchema',
      'FactsSchema',
      'ConfidenceSchema',
      'MAX_ASK_PRICE',
    ]) {
      expect(entities, name).not.toHaveProperty(name);
    }
  });
});

describe('BudgetLimit', () => {
  it('needs a category only for category scope', () => {
    expect(ok(BudgetLimitSchema, makeLimit({ scope: 'category', category: null }))).toBe(false);
    expect(ok(BudgetLimitSchema, makeLimit({ scope: 'overall', category: 'food' }))).toBe(false);
    expect(ok(BudgetLimitSchema, makeLimit({ scope: 'overall', category: null }))).toBe(true);
  });
  it('needs ascending warning thresholds', () => {
    expect(ok(BudgetLimitSchema, makeLimit({ warnAt: [100, 80, 120] }))).toBe(false);
    expect(ok(BudgetLimitSchema, makeLimit({ warnAt: [] }))).toBe(false);
  });
});

describe('Transaction', () => {
  const tx = (over: Partial<entities.Transaction>) => ok(TransactionSchema, makeTransaction(over));

  it('transfers between two different accounts', () => {
    expect(tx({ fromAccountId: 'acct-main', toAccountId: 'acct-savings' })).toBe(true);
    expect(tx({ fromAccountId: 'acct-main', toAccountId: 'acct-main' })).toBe(false);
    expect(tx({ fromAccountId: null })).toBe(false);
    expect(tx({ toAccountId: null })).toBe(false);
    expect(tx({ fromAccountId: '' })).toBe(false);
  });

  it('allows negative adjustments to an account, but not empty ones', () => {
    const adjustment = { type: 'adjustment' as const, fromAccountId: null };
    expect(tx({ ...adjustment, amount: -2_000, toAccountId: 'acct-main' })).toBe(true);
    expect(tx({ ...adjustment, amount: 2_000, toAccountId: 'card-1' })).toBe(true);
    expect(tx({ ...adjustment, amount: 0, toAccountId: 'acct-main' })).toBe(false);
    expect(tx({ ...adjustment, amount: -2_000, toAccountId: null })).toBe(false);
    expect(tx({ amount: -500 })).toBe(false);
  });

  it('pays a card from one account into the card, naming no debt', () => {
    const payment = {
      type: 'card_payment' as const,
      fromAccountId: 'acct-main',
      toAccountId: 'card-1',
      debtId: null,
    };
    expect(tx(payment)).toBe(true);
    expect(tx({ ...payment, fromAccountId: null })).toBe(false);
    expect(tx({ ...payment, toAccountId: null })).toBe(false);
    expect(tx({ ...payment, debtId: 'card-1' })).toBe(false);
    expect(tx({ ...payment, amount: 0 })).toBe(false);
  });

  it('pays a loan from an account, naming the loan', () => {
    const payment = {
      type: 'debt_payment' as const,
      fromAccountId: 'acct-main',
      toAccountId: null,
      debtId: 'loan-1',
    };
    expect(tx(payment)).toBe(true);
    expect(tx({ ...payment, debtId: null })).toBe(false);
    expect(tx({ ...payment, fromAccountId: null })).toBe(false);
  });

  it('has investments that leave an account, and need a positive amount', () => {
    const investment = {
      type: 'investment' as const,
      fromAccountId: 'acct-savings',
      toAccountId: null,
    };
    expect(tx(investment)).toBe(true);
    expect(tx({ ...investment, fromAccountId: null })).toBe(false);
    expect(tx({ ...investment, amount: 0 })).toBe(false);
    expect(tx({ ...investment, amount: -5_00 })).toBe(false);
  });
});

describe('Holding', () => {
  it('needs an upper-case symbol and a 3-letter upper-case currency', () => {
    expect(ok(HoldingSchema, makeHolding({ symbol: 'VWRL.L', currency: 'GBP' }))).toBe(true);
    expect(ok(HoldingSchema, makeHolding({ symbol: 'ko' }))).toBe(false);
    expect(ok(HoldingSchema, makeHolding({ symbol: '' }))).toBe(false);
    expect(ok(HoldingSchema, makeHolding({ currency: 'usd' }))).toBe(false);
    expect(ok(HoldingSchema, makeHolding({ currency: 'US' }))).toBe(false);
  });
  it('has a positive number of shares, fractions allowed', () => {
    expect(ok(HoldingSchema, makeHolding({ shares: 0.1234 }))).toBe(true);
    expect(ok(HoldingSchema, makeHolding({ shares: 0 }))).toBe(false);
    expect(ok(HoldingSchema, makeHolding({ shares: -1 }))).toBe(false);
    expect(ok(HoldingSchema, makeHolding({ shares: Infinity }))).toBe(false);
  });
  it('keeps the cost in whole minor units, never negative', () => {
    expect(ok(HoldingSchema, makeHolding({ costBasis: 0 }))).toBe(true);
    expect(ok(HoldingSchema, makeHolding({ costBasis: 12.5 }))).toBe(false);
    expect(ok(HoldingSchema, makeHolding({ costBasis: -1 }))).toBe(false);
  });
  it('keeps the withholding between 0 and 100 percent', () => {
    expect(ok(HoldingSchema, makeHolding({ withholdingPct: 0 }))).toBe(true);
    expect(ok(HoldingSchema, makeHolding({ withholdingPct: 100 }))).toBe(true);
    expect(ok(HoldingSchema, makeHolding({ withholdingPct: -1 }))).toBe(false);
    expect(ok(HoldingSchema, makeHolding({ withholdingPct: 100.5 }))).toBe(false);
  });
  it('checks the purchase date and the type', () => {
    expect(ok(HoldingSchema, makeHolding({ purchaseDate: '2026-02-30' }))).toBe(false);
    expect(ok(HoldingSchema, makeHolding({ type: 'crypto' as never }))).toBe(false);
  });
  it('takes a quote and dividend info, or none', () => {
    const quote = {
      price: 60.12,
      previousClose: null,
      fxRate: 0.92,
      asOf: '2026-10-16T10:00:00.000Z',
    };
    const dividendInfo = {
      history: [{ date: '2026-07-15', amount: 0.485 }],
      nextExDate: '2026-10-15',
      nextPayDate: null,
      nextAmount: null,
      fetchedAt: '2026-10-16T10:00:00.000Z',
    };
    expect(
      ok(
        HoldingSchema,
        makeHolding({ quote, dividendInfo, manualPrice: 61, checkedAt: quote.asOf }),
      ),
    ).toBe(true);
    expect(ok(HoldingSchema, makeHolding({ quote: { ...quote, asOf: 'yesterday' } }))).toBe(false);
    expect(
      ok(
        HoldingSchema,
        makeHolding({ dividendInfo: { ...dividendInfo, nextExDate: '2026-13-01' } }),
      ),
    ).toBe(false);
  });
});

describe('Dividend', () => {
  const div = (over: Partial<entities.Dividend>) => ok(DividendSchema, makeDividend(over));

  it('records a confirmed payout into exactly one of an account or more shares', () => {
    expect(div({ accountId: 'acct-passive', reinvested: false })).toBe(true);
    expect(div({ accountId: null, reinvested: true })).toBe(true);
    expect(div({ accountId: null, reinvested: false })).toBe(false);
    expect(div({ accountId: 'acct-main', reinvested: true })).toBe(false);
    expect(div({ accountId: '' })).toBe(false);
    expect(div({ amount: 11.5 })).toBe(false);
    expect(div({ amount: -1 })).toBe(false);
  });
  it('records a skipped payout as nothing received, nowhere and not reinvested', () => {
    const skipped = {
      status: 'skipped' as const,
      amount: 0,
      accountId: null,
      reinvested: false,
      sharesAdded: null,
    };
    expect(div(skipped)).toBe(true);
    expect(div({ ...skipped, amount: 5_00 })).toBe(false);
    expect(div({ ...skipped, accountId: 'acct-main' })).toBe(false);
    expect(div({ ...skipped, reinvested: true })).toBe(false);
    expect(div({ ...skipped, sharesAdded: 0.2 })).toBe(false);
  });
  it('can add shares when reinvested', () => {
    expect(div({ accountId: null, reinvested: true, sharesAdded: 0.0832 })).toBe(true);
  });
});

describe('Sale', () => {
  it('sells a positive number of shares for positive proceeds, in whole minor units', () => {
    expect(ok(SaleSchema, makeSale({ shares: 0.25 }))).toBe(true);
    expect(ok(SaleSchema, makeSale({ shares: 0 }))).toBe(false);
    expect(ok(SaleSchema, makeSale({ shares: -1 }))).toBe(false);
    expect(ok(SaleSchema, makeSale({ proceeds: 0 }))).toBe(false);
    expect(ok(SaleSchema, makeSale({ proceeds: 10.5 }))).toBe(false);
  });
  it('carried a cost of nothing or more, in whole minor units', () => {
    expect(ok(SaleSchema, makeSale({ cost: 0 }))).toBe(true);
    expect(ok(SaleSchema, makeSale({ cost: -1 }))).toBe(false);
    expect(ok(SaleSchema, makeSale({ cost: 1.5 }))).toBe(false);
  });
  it('checks the date, the account paid into and the type', () => {
    expect(ok(SaleSchema, makeSale({ soldOn: '2026-02-30' }))).toBe(false);
    expect(ok(SaleSchema, makeSale({ toAccountId: 'acct-savings' }))).toBe(true);
    expect(ok(SaleSchema, makeSale({ toAccountId: '' }))).toBe(false);
    expect(ok(SaleSchema, makeSale({ toAccountId: null as never }))).toBe(false);
    expect(ok(SaleSchema, makeSale({ type: 'crypto' as never }))).toBe(false);
  });
  it('holds the holding as it was when the last shares were sold, or nothing', () => {
    expect(ok(SaleSchema, makeSale({ restore: makeHolding() }))).toBe(true);
    expect(ok(SaleSchema, makeSale({ restore: null }))).toBe(true);
    expect(ok(SaleSchema, makeSale({ restore: makeHolding({ shares: 0 }) }))).toBe(false);
    const { restore, ...without } = makeSale();
    expect(restore).toBeNull();
    expect(ok(SaleSchema, without)).toBe(false);
  });
});

describe('Profile and Settings', () => {
  it('needs an ISO currency code', () => {
    expect(ok(ProfileSchema, makeProfile({ currency: 'usd' }))).toBe(false);
    expect(ok(ProfileSchema, makeProfile({ currency: 'EUR' }))).toBe(true);
  });
  it('keeps no opening cash or savings on the profile: the accounts hold them', () => {
    expect(Object.keys(ProfileSchema.shape)).not.toContain('openingCash');
    expect(Object.keys(ProfileSchema.shape)).not.toContain('openingSavings');
    expect(makeProfile()).not.toHaveProperty('openingCash');
  });
  it('names the default account, or none', () => {
    expect(ok(SettingsSchema, makeSettings({ defaultAccountId: 'acct-main' }))).toBe(true);
    expect(ok(SettingsSchema, makeSettings({ defaultAccountId: null }))).toBe(true);
    expect(ok(SettingsSchema, makeSettings({ defaultAccountId: '' }))).toBe(false);
    const without: Record<string, unknown> = { ...makeSettings() };
    delete without.defaultAccountId;
    expect(ok(SettingsSchema, without)).toBe(false);
  });
  it('has no Salary freeze or Buy it? reminder switch', () => {
    const switches = Object.keys(entities.ReminderSettingsSchema.shape);
    expect(switches).not.toContain('freeze');
    expect(switches).not.toContain('buyIt');
  });
  it('limits pay day to a day of the month', () => {
    expect(ok(ProfileSchema, makeProfile({ salary: { monthlyAmount: 1, payDay: 32 } }))).toBe(
      false,
    );
  });
  it('only allows the offered auto-lock choices', () => {
    expect(ok(SettingsSchema, { ...makeSettings(), autoLockMinutes: 2 })).toBe(false);
  });
  it('takes a 3-letter currency for Invest, or none, with its positive rate', () => {
    const fx = { currency: 'USD', rate: 1.1, asOf: '2026-10-14T10:00:00.000Z' };
    expect(ok(SettingsSchema, makeSettings({ investCurrency: 'USD', investFx: fx }))).toBe(true);
    for (const investCurrency of ['usd', 'US', 'USDX', '']) {
      expect(ok(SettingsSchema, makeSettings({ investCurrency })), investCurrency).toBe(false);
    }
    for (const investFx of [
      { ...fx, rate: 0 },
      { ...fx, rate: -1 },
      { ...fx, currency: 'us' },
      { ...fx, asOf: 'yesterday' },
    ]) {
      expect(ok(SettingsSchema, makeSettings({ investFx }))).toBe(false);
    }
    for (const key of ['investCurrency', 'investFx']) {
      const without: Record<string, unknown> = { ...makeSettings() };
      delete without[key];
      expect(ok(SettingsSchema, without), key).toBe(false);
    }
  });
  it('keeps what the inbox has read: keys, and a moment before which all of it is', () => {
    const inbox = { readBefore: '2026-10-14T09:00:00.000Z', read: ['week:2026-10-11'] };
    expect(ok(SettingsSchema, makeSettings({ inbox }))).toBe(true);
    expect(ok(SettingsSchema, makeSettings({ inbox: { readBefore: null, read: [] } }))).toBe(true);
    for (const bad of [
      { ...inbox, readBefore: 'yesterday' },
      { ...inbox, read: [3] },
      { ...inbox, read: 'week:2026-10-11' },
      { read: [] },
    ]) {
      expect(ok(SettingsSchema, { ...makeSettings(), inbox: bad })).toBe(false);
    }
    const without: Record<string, unknown> = { ...makeSettings() };
    delete without.inbox;
    expect(ok(SettingsSchema, without)).toBe(false);
  });
  it('has the documented defaults', () => {
    const s = defaultSettings('2026-10-14T10:00:00.000Z');
    expect(s).toEqual({
      id: 'settings',
      createdAt: '2026-10-14T10:00:00.000Z',
      updatedAt: '2026-10-14T10:00:00.000Z',
      weekStartsOn: 1,
      warningTone: 'motivational',
      autoLockMinutes: 5,
      lastBackupAt: null,
      reminders: {
        enabled: false,
        dailyLog: true,
        dailyTime: '20:00',
        bills: true,
        reviews: true,
        backup: true,
        dividends: true,
        prompted: false,
      },
      cosmetics: { theme: 'theme-mono', avatar: 'avatar-sprout', frame: 'frame-none' },
      investCurrency: null,
      investFx: null,
      inbox: { readBefore: null, read: [] },
      defaultAccountId: null,
    });
    expect(ok(SettingsSchema, s)).toBe(true);
  });
  it('needs reminder settings, with the time as HH:MM on a 24-hour clock', () => {
    const { reminders, ...without } = makeSettings();
    expect(ok(SettingsSchema, without)).toBe(false);
    for (const dailyTime of ['00:00', '07:30', '20:00', '23:59']) {
      expect(ok(SettingsSchema, makeSettings({ reminders: { ...reminders, dailyTime } }))).toBe(
        true,
      );
    }
    for (const dailyTime of ['24:00', '7:30', '20:60', '20:00:00', '2000', '']) {
      expect(ok(SettingsSchema, makeSettings({ reminders: { ...reminders, dailyTime } }))).toBe(
        false,
      );
    }
  });
  it('hands each caller its own reminder defaults', () => {
    const a = defaultSettings('2026-10-14T10:00:00.000Z');
    const b = defaultSettings('2026-10-14T10:00:00.000Z');
    expect(a.reminders).not.toBe(b.reminders);
    expect(a.cosmetics).not.toBe(b.cosmetics);
  });
});
