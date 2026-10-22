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
 * Pays with an account, as Pay on the Cards tab and on Home does. It resolves to the expense the
 * payment is recorded as, and rejects, writing nothing, with what the finance actions say (a
 * frozen or archived account, a date after today). The seam for a real payment later: a service
 * that takes the money through a payment provider would be seated where the local one is.
 */
export interface PaymentService {
  pay(input: PaymentInput): Promise<Expense>;
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
    async pay(input) {
      const { expense } = await actions.addExpense({ ...input, repeat: null });
      return expense;
    },
  };
}
