import { describe, expect, it } from 'vitest';
import {
  localIso,
  makeChallenge,
  makeCheckIn,
  makeDebt,
  makeExpense,
  makeGoal,
  makeIncome,
  makeLedgerEntry,
  makeLimit,
  makeProfile,
  makeSettings,
  makeStreakFreeze,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import { toLocalDate } from './dates';
import {
  BudgetLimitSchema,
  ChallengeSchema,
  CheckInSchema,
  DebtSchema,
  defaultSettings,
  ExpenseSchema,
  GoalSchema,
  IncomeSchema,
  LedgerEntrySchema,
  ProfileSchema,
  SalaryFreezeSchema,
  SettingsSchema,
  StreakFreezeSchema,
  SubscriptionSchema,
  TransactionSchema,
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
        prompted: false,
      },
      cosmetics: { theme: 'theme-violet', avatar: 'avatar-sprout', frame: 'frame-none' },
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
