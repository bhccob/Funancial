import { describe, expect, it } from 'vitest';
import {
  localIso,
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
import { makeAboutYou, makeBuyAsk, makeBuyDecision } from '@/test/retiredFixtures';
import { toLocalDate } from './dates';
import {
  AboutYouSchema,
  BudgetLimitSchema,
  BuyAskSchema,
  BuyDecisionSchema,
  CategorySchema,
  ChallengeSchema,
  CheckInSchema,
  DebtSchema,
  defaultSettings,
  DividendSchema,
  ExpenseSchema,
  FactsSchema,
  GoalSchema,
  HoldingSchema,
  IncomeSchema,
  LedgerEntrySchema,
  ProfileSchema,
  SalaryFreezeSchema,
  SaleSchema,
  SettingsSchema,
  StreakFreezeSchema,
  SubscriptionSchema,
  TransactionSchema,
  VerdictSchema,
} from './entities';

const ok = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

const validFreeze = {
  id: 'f1',
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  start: '2026-10-01',
  end: '2026-10-07',
  lostAmount: 98_000,
  mode: 'computed',
  note: '',
};

describe('fixtures', () => {
  it('produce valid entities', () => {
    expect(ok(ProfileSchema, makeProfile())).toBe(true);
    expect(ok(SettingsSchema, makeSettings())).toBe(true);
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
    expect(ok(BuyDecisionSchema, makeBuyDecision())).toBe(true);
    expect(ok(AboutYouSchema, makeAboutYou())).toBe(true);
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

describe('payment method and card', () => {
  it('requires a card exactly when paying by credit card', () => {
    expect(ok(ExpenseSchema, makeExpense({ paymentMethod: 'credit_card', cardId: null }))).toBe(
      false,
    );
    expect(ok(ExpenseSchema, makeExpense({ paymentMethod: 'cash', cardId: 'card-1' }))).toBe(false);
    expect(ok(ExpenseSchema, makeExpense({ paymentMethod: 'credit_card', cardId: 'card-1' }))).toBe(
      true,
    );
    expect(
      ok(SubscriptionSchema, makeSubscription({ paymentMethod: 'credit_card', cardId: null })),
    ).toBe(false);
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

describe('SalaryFreeze', () => {
  it('cannot end before it starts, but may last one day', () => {
    expect(ok(SalaryFreezeSchema, { ...validFreeze, start: '2026-10-10', end: '2026-10-01' })).toBe(
      false,
    );
    expect(ok(SalaryFreezeSchema, { ...validFreeze, start: '2026-10-10', end: '2026-10-10' })).toBe(
      true,
    );
  });
});

describe('Transaction', () => {
  it('transfers between two different buckets', () => {
    expect(ok(TransactionSchema, makeTransaction({ from: 'cash', to: 'cash' }))).toBe(false);
    expect(ok(TransactionSchema, makeTransaction({ from: null }))).toBe(false);
  });
  it('allows negative adjustments but not empty ones', () => {
    expect(
      ok(
        TransactionSchema,
        makeTransaction({ type: 'adjustment', amount: -2_000, from: null, to: 'cash' }),
      ),
    ).toBe(true);
    expect(
      ok(
        TransactionSchema,
        makeTransaction({ type: 'adjustment', amount: 0, from: null, to: 'cash' }),
      ),
    ).toBe(false);
    expect(ok(TransactionSchema, makeTransaction({ amount: -500 }))).toBe(false);
  });
  it('ties card and debt payments to a debt, paid from a bucket', () => {
    const payment = { type: 'card_payment' as const, from: 'cash' as const, to: null };
    expect(ok(TransactionSchema, makeTransaction({ ...payment, debtId: null }))).toBe(false);
    expect(ok(TransactionSchema, makeTransaction({ ...payment, debtId: 'card-1' }))).toBe(true);
    expect(
      ok(TransactionSchema, makeTransaction({ ...payment, from: null, debtId: 'card-1' })),
    ).toBe(false);
  });
  it('has investments that leave a bucket, and need a positive amount and a source', () => {
    const investment = { type: 'investment' as const, from: 'cash' as const, to: null };
    expect(ok(TransactionSchema, makeTransaction(investment))).toBe(true);
    expect(ok(TransactionSchema, makeTransaction({ ...investment, from: null }))).toBe(false);
    expect(ok(TransactionSchema, makeTransaction({ ...investment, amount: 0 }))).toBe(false);
    expect(ok(TransactionSchema, makeTransaction({ ...investment, amount: -5_00 }))).toBe(false);
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
  it('records a confirmed payout into a bucket', () => {
    for (const bucket of ['cash', 'savings', 'passive', 'reinvest'] as const) {
      expect(ok(DividendSchema, makeDividend({ bucket }))).toBe(true);
    }
    expect(ok(DividendSchema, makeDividend({ bucket: null }))).toBe(false);
    expect(ok(DividendSchema, makeDividend({ amount: 11.5 }))).toBe(false);
    expect(ok(DividendSchema, makeDividend({ amount: -1 }))).toBe(false);
  });
  it('records a skipped payout as nothing received and nowhere', () => {
    const skipped = { status: 'skipped' as const, amount: 0, bucket: null, sharesAdded: null };
    expect(ok(DividendSchema, makeDividend(skipped))).toBe(true);
    expect(ok(DividendSchema, makeDividend({ ...skipped, amount: 5_00 }))).toBe(false);
    expect(ok(DividendSchema, makeDividend({ ...skipped, bucket: 'cash' }))).toBe(false);
    expect(ok(DividendSchema, makeDividend({ ...skipped, sharesAdded: 0.2 }))).toBe(false);
  });
  it('can add shares when reinvested', () => {
    expect(ok(DividendSchema, makeDividend({ bucket: 'reinvest', sharesAdded: 0.0832 }))).toBe(
      true,
    );
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
  it('checks the date, the destination and the type', () => {
    expect(ok(SaleSchema, makeSale({ soldOn: '2026-02-30' }))).toBe(false);
    expect(ok(SaleSchema, makeSale({ to: 'savings' }))).toBe(true);
    expect(ok(SaleSchema, makeSale({ to: 'passive' as never }))).toBe(false);
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
        freeze: true,
        reviews: true,
        backup: true,
        dividends: true,
        buyIt: true,
        prompted: false,
      },
      cosmetics: { theme: 'theme-violet', avatar: 'avatar-sprout', frame: 'frame-none' },
      investCurrency: null,
      investFx: null,
      inbox: { readBefore: null, read: [] },
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

describe('BuyAsk', () => {
  it('takes a well-formed ask, with or without a note and a link', () => {
    expect(ok(BuyAskSchema, makeBuyAsk())).toBe(true);
    expect(
      ok(BuyAskSchema, makeBuyAsk({ why: 'for the commute', link: 'https://shop.test/x' })),
    ).toBe(true);
  });
  it('wants a name of 1 to 80 characters', () => {
    expect(ok(BuyAskSchema, makeBuyAsk({ item: '' }))).toBe(false);
    expect(ok(BuyAskSchema, makeBuyAsk({ item: 'x'.repeat(80) }))).toBe(true);
    expect(ok(BuyAskSchema, makeBuyAsk({ item: 'x'.repeat(81) }))).toBe(false);
  });
  it('wants a positive whole price, of at most 10,000,000.00', () => {
    expect(ok(BuyAskSchema, makeBuyAsk({ price: 0 }))).toBe(false);
    expect(ok(BuyAskSchema, makeBuyAsk({ price: -5_00 }))).toBe(false);
    expect(ok(BuyAskSchema, makeBuyAsk({ price: 12.5 }))).toBe(false);
    expect(ok(BuyAskSchema, makeBuyAsk({ price: 1 }))).toBe(true);
    expect(ok(BuyAskSchema, makeBuyAsk({ price: 10_000_000_00 }))).toBe(true);
    expect(ok(BuyAskSchema, makeBuyAsk({ price: 10_000_000_01 }))).toBe(false);
  });
  it('wants a quantity from 1 to 99', () => {
    expect(ok(BuyAskSchema, makeBuyAsk({ quantity: 0 }))).toBe(false);
    expect(ok(BuyAskSchema, makeBuyAsk({ quantity: 1.5 }))).toBe(false);
    expect(ok(BuyAskSchema, makeBuyAsk({ quantity: 99 }))).toBe(true);
    expect(ok(BuyAskSchema, makeBuyAsk({ quantity: 100 }))).toBe(false);
  });
  it('keeps the note to 200 characters', () => {
    expect(ok(BuyAskSchema, makeBuyAsk({ why: 'x'.repeat(200) }))).toBe(true);
    expect(ok(BuyAskSchema, makeBuyAsk({ why: 'x'.repeat(201) }))).toBe(false);
  });
  it('keeps the link to 2048 characters', () => {
    expect(ok(BuyAskSchema, makeBuyAsk({ link: 'x'.repeat(2048) }))).toBe(true);
    expect(ok(BuyAskSchema, makeBuyAsk({ link: 'x'.repeat(2049) }))).toBe(false);
  });
  it('only knows the offered categories, urgencies, timings and ways to pay', () => {
    expect(ok(BuyAskSchema, makeBuyAsk({ category: 'travel' as never }))).toBe(false);
    expect(ok(BuyAskSchema, makeBuyAsk({ urgency: 'must' as never }))).toBe(false);
    expect(ok(BuyAskSchema, makeBuyAsk({ howSoon: 'now' as never }))).toBe(false);
    expect(ok(BuyAskSchema, makeBuyAsk({ payWith: 'crypto' as never }))).toBe(false);
  });
});

describe('Verdict and Facts', () => {
  it('knows the four verdicts', () => {
    for (const v of ['buy', 'wait', 'cheaper', 'skip']) expect(ok(VerdictSchema, v)).toBe(true);
    expect(ok(VerdictSchema, 'maybe')).toBe(false);
  });
  it('takes facts with the optional lines left out', () => {
    const facts = {
      total: 40_00,
      categoryAfter: null,
      overallAfter: { limit: 500_00, spentAfter: 170_00, pct: 34 },
      overBy: 0,
      availableAfter: -5_00,
      emergencyBefore: null,
      emergencyAfter: null,
      goalDelay: { name: 'Bike', days: 12 },
      requiresDebt: false,
      resetsOn: null,
    };
    expect(ok(FactsSchema, facts)).toBe(true);
    expect(ok(FactsSchema, { ...facts, overBy: -1 })).toBe(false);
    expect(ok(FactsSchema, { ...facts, resetsOn: '2026-02-30' })).toBe(false);
  });
});

describe('Reminder settings: Buy it?', () => {
  it('needs the buy-it switch', () => {
    const { buyIt, ...reminders } = makeSettings().reminders;
    expect(buyIt).toBe(true);
    expect(ok(SettingsSchema, makeSettings({ reminders: reminders as never }))).toBe(false);
  });
});

describe('BuyDecision', () => {
  it('holds no advisor answer and no debate: the rules give the answer', () => {
    const d = makeBuyDecision();
    const keys = Object.keys(BuyDecisionSchema.shape);
    expect(keys).not.toContain('ai');
    expect(keys).not.toContain('debate');
    expect(d).not.toHaveProperty('ai');
    expect(d).not.toHaveProperty('debate');
    expect(BuyDecisionSchema.parse(d)).toEqual(d);
  });
  it('holds the ask as the ask schema reads it', () => {
    expect(ok(BuyDecisionSchema, makeBuyDecision({ ask: makeBuyAsk({ price: 0 }) }))).toBe(false);
  });
  it('holds the facts, the verdicts and the confidence as their schemas read them', () => {
    const d = makeBuyDecision();
    expect(ok(BuyDecisionSchema, { ...d, facts: { ...d.facts, overBy: -1 } })).toBe(false);
    expect(ok(BuyDecisionSchema, { ...d, verdict: 'maybe' })).toBe(false);
    expect(ok(BuyDecisionSchema, { ...d, rulesVerdict: 'maybe' })).toBe(false);
    for (const confidence of ['low', 'medium', 'high']) {
      expect(ok(BuyDecisionSchema, { ...d, confidence })).toBe(true);
    }
    expect(ok(BuyDecisionSchema, { ...d, confidence: 'sure' })).toBe(false);
  });
  it('keeps both meters to whole numbers from 0 to 100', () => {
    for (const key of ['meter', 'rulesMeter'] as const) {
      for (const v of [0, 55, 100])
        expect(ok(BuyDecisionSchema, makeBuyDecision({ [key]: v }))).toBe(true);
      for (const v of [-1, 101, 55.5, Number.NaN]) {
        expect(ok(BuyDecisionSchema, makeBuyDecision({ [key]: v }))).toBe(false);
      }
    }
  });
  it('keeps the notes and the guard reasons the answer was shown with', () => {
    const d = makeBuyDecision({
      notes: ['You said: a bike'],
      guards: { capAtWait: true, reasons: ["Needs money you don't have"] },
    });
    expect(BuyDecisionSchema.parse(d)).toEqual(d);
    expect(ok(BuyDecisionSchema, makeBuyDecision({ notes: 'a bike' as never }))).toBe(false);
    expect(ok(BuyDecisionSchema, makeBuyDecision({ guards: { capAtWait: 'yes' } as never }))).toBe(
      false,
    );
    for (const key of ['notes', 'guards']) {
      const without: Record<string, unknown> = { ...makeBuyDecision() };
      delete without[key];
      expect(ok(BuyDecisionSchema, without), key).toBe(false);
    }
  });
  it('knows four statuses', () => {
    for (const status of ['open', 'waiting', 'bought', 'skipped'] as const) {
      expect(ok(BuyDecisionSchema, makeBuyDecision({ status }))).toBe(true);
    }
    expect(ok(BuyDecisionSchema, makeBuyDecision({ status: 'done' as never }))).toBe(false);
  });
  it('wants real dates for the reminder and the purchase', () => {
    expect(
      ok(BuyDecisionSchema, makeBuyDecision({ remindOn: '2026-11-01', boughtOn: '2026-10-16' })),
    ).toBe(true);
    expect(ok(BuyDecisionSchema, makeBuyDecision({ remindOn: '2026-02-30' }))).toBe(false);
    expect(ok(BuyDecisionSchema, makeBuyDecision({ boughtOn: 'yesterday' }))).toBe(false);
  });
  it('rates how much it was used from 1 to 5, or not at all', () => {
    for (const usage of [1, 2, 3, 4, 5, null] as const) {
      expect(ok(BuyDecisionSchema, makeBuyDecision({ usage }))).toBe(true);
    }
    for (const usage of [0, 6, 2.5]) {
      expect(ok(BuyDecisionSchema, makeBuyDecision({ usage: usage as never }))).toBe(false);
    }
  });
});

describe('AboutYou', () => {
  const messages = (v: unknown) => AboutYouSchema.safeParse(v).error?.issues.map((i) => i.message);

  it('is one record with the id about, empty to start', () => {
    const about = makeAboutYou();
    expect(about).toMatchObject({
      id: 'about',
      situation: '',
      matters: '',
      overspend: [],
      protectGoalId: null,
    });
    expect(ok(AboutYouSchema, about)).toBe(true);
    expect(ok(AboutYouSchema, makeAboutYou({ id: 'other' as never }))).toBe(false);
  });
  it('keeps no list of remembered facts: nothing is debated any more', () => {
    expect(Object.keys(AboutYouSchema.shape)).not.toContain('facts');
    expect(Object.keys(makeAboutYou())).not.toContain('facts');
  });
  it('accepts a situation and what matters at 500 characters, and refuses more with a message', () => {
    for (const key of ['situation', 'matters'] as const) {
      expect(ok(AboutYouSchema, makeAboutYou({ [key]: 'x'.repeat(500) }))).toBe(true);
      const long = makeAboutYou({ [key]: 'x'.repeat(501) });
      expect(ok(AboutYouSchema, long)).toBe(false);
      expect(messages(long)).toEqual(['Keep it to 500 characters or fewer']);
    }
  });
  it('takes overspend as categories the app knows, each picked once', () => {
    expect(ok(AboutYouSchema, makeAboutYou({ overspend: [] }))).toBe(true);
    expect(ok(AboutYouSchema, makeAboutYou({ overspend: ['food', 'entertainment'] }))).toBe(true);
    expect(ok(AboutYouSchema, makeAboutYou({ overspend: [...CategorySchema.options] }))).toBe(true);
    expect(ok(AboutYouSchema, makeAboutYou({ overspend: ['travel' as never] }))).toBe(false);
    expect(ok(AboutYouSchema, makeAboutYou({ overspend: 'food' as never }))).toBe(false);

    const twice = makeAboutYou({ overspend: ['food', 'rent', 'food'] });
    expect(ok(AboutYouSchema, twice)).toBe(false);
    expect(messages(twice)).toEqual(['Pick each category once']);
  });
  it('takes the goal to protect as an id, or none', () => {
    expect(ok(AboutYouSchema, makeAboutYou({ protectGoalId: 'goal-1' }))).toBe(true);
    expect(ok(AboutYouSchema, makeAboutYou({ protectGoalId: null }))).toBe(true);
    expect(ok(AboutYouSchema, makeAboutYou({ protectGoalId: '' }))).toBe(false);
    expect(ok(AboutYouSchema, { ...makeAboutYou(), protectGoalId: undefined })).toBe(false);
  });
});
