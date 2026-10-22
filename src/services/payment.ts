import type { LimitStatus } from '@/domain/budget';
import type { LocalDate } from '@/domain/dates';
import type { Category, Expense } from '@/domain/entities';
import type { FinanceActions } from '@/store/financeActions';

/** What a payment is: an amount paid with an account, on a day, for a category and a note. */
export type PaymentInput = {
  accountId: string;
  /** Minor units of the profile currency. */
  amount: number;
  category: Category;
  note: string;
  date: LocalDate;
};

/**
 * What a payment did: the expense it is recorded as, and the limits it took to a new level, which
 * Pay tells the person about as the expense form does.
 */
export type PaymentResult = { expense: Expense; alerts: LimitStatus[] };

/**
 * Pays with an account, as Pay on the Cards tab and on Home does. It resolves to the expense the
 * payment is recorded as and the limits it crossed, and rejects, writing nothing, with what the
 * finance actions say (a frozen or archived account, a date after today). The seam for a real
 * payment later: a service that takes the money through a payment provider would be seated where
 * the local one is.
 */
export interface PaymentService {
  pay(input: PaymentInput): Promise<PaymentResult>;
}

/**
 * The payment service of a phone with no payment provider: paying records an expense on the
 * account (`addExpense`), which lowers what a bank account, cash or savings holds and raises what a
 * credit card owes. It never repeats, so it never makes a subscription.
 */
export function createLocalPaymentService(
  actions: Pick<FinanceActions, 'addExpense'>,
): PaymentService {
  return {
    pay: (input) => actions.addExpense({ ...input, repeat: null }),
  };
}
