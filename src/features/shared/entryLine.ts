import { categoryLabel } from '@/domain/budget';
import type { Account, Debt } from '@/domain/entities';
import type { Entry } from '@/domain/history';
import { formatShares } from '@/lib/format';
import { accountName } from './AccountField';

/**
 * What an entry's amount is: money earned (income, a dividend, a sale), money that left (a minus),
 * or neither (moved between accounts, a correction up, or nothing at all).
 */
export type EntryTone = 'in' | 'out' | 'plain';

/** One History entry as every list writes it: History, Home's Recent and an account's sheet. */
export interface EntryLine {
  /** What it was: "Groceries", "Skipped dividend · AAPL", "Main account → Savings". */
  title: string;
  /** The line under the title: its kind and the accounts it touched, or '' for none. */
  detail: string;
  /** A sale's profit, negative for a loss, which the line writes after `detail` with ▲ or ▼. */
  profit?: number;
  /** The money, in minor units and never negative; 0 for what didn't arrive. */
  amount: number;
  /** Written before the amount: + in, − out, nothing for money moved or nothing at all. */
  sign: '+' | '−' | '';
  tone: EntryTone;
  /** Said beside the title for income not counted yet. */
  chip?: 'Expected' | "Didn't arrive";
}

export interface EntryLineContext {
  /** Every account, archived ones included, so old rows keep their names. */
  accounts: readonly Account[];
  debts: readonly Debt[];
  /**
   * The account the list is seen from (its own sheet): a transfer or a card payment reads as money
   * into or out of it, and the line leaves its own name out.
   */
  perspective?: string;
}

/**
 * One entry as History writes it, which Home's Recent and the account sheet write the same way: an
 * expected income is money in with an "Expected" chip, never 0.00; one that didn't arrive, or a
 * skipped dividend, is 0.00 with nothing before it. A correction on a card is owing more or less, so
 * owing more reads as money out, as spending on it does.
 */
export function entryLine(
  entry: Entry,
  { accounts, debts, perspective }: EntryLineContext,
): EntryLine {
  const nameOf = (id: string | null) => accountName(accounts, id);
  /** An account the line names, unless it is the one the list is seen from. */
  const other = (id: string | null) => (id !== null && id === perspective ? '' : nameOf(id));
  const join = (...parts: string[]) => parts.filter(Boolean).join(' · ');

  switch (entry.kind) {
    case 'expense': {
      const e = entry.item;
      const category = categoryLabel(e.category);
      return {
        title: e.note || category,
        detail: join(category, other(e.accountId), e.subscriptionId ? 'Subscription' : ''),
        amount: e.amount,
        sign: '−',
        tone: 'out',
      };
    }
    case 'income': {
      const i = entry.item;
      const to = other(i.accountId);
      const source = i.source === 'salary' ? 'Salary' : 'Extra income';
      const skipped = i.status === 'skipped';
      return {
        title: i.label,
        detail: join(source, to && `to ${to}`),
        amount: skipped ? 0 : i.amount,
        sign: skipped ? '' : '+',
        tone: skipped ? 'plain' : 'in',
        chip: i.status === 'expected' ? 'Expected' : skipped ? "Didn't arrive" : undefined,
      };
    }
    case 'dividend': {
      const d = entry.item;
      const skipped = d.status === 'skipped';
      const to = d.accountId === null ? '' : other(d.accountId);
      return {
        title: `${skipped ? 'Skipped dividend' : 'Dividend'} · ${d.symbol}`,
        detail: d.reinvested ? 'Reinvested' : to && `To ${to}`,
        amount: skipped ? 0 : d.amount,
        sign: skipped ? '' : '+',
        tone: skipped ? 'plain' : 'in',
      };
    }
    case 'sale': {
      const s = entry.item;
      const to = other(s.toAccountId);
      return {
        title: `Sold ${formatShares(s.shares)} ${s.symbol}`,
        detail: to && `To ${to}`,
        profit: s.proceeds - s.cost,
        amount: s.proceeds,
        sign: '+',
        tone: 'in',
      };
    }
    case 'transaction': {
      const t = entry.item;
      const from = t.fromAccountId !== null && t.fromAccountId === perspective;
      const into = t.toAccountId !== null && t.toAccountId === perspective;
      if (t.type === 'transfer') {
        if (from || into) {
          return {
            title: from ? `To ${nameOf(t.toAccountId)}` : `From ${nameOf(t.fromAccountId)}`,
            detail: join('Transfer', t.note),
            amount: t.amount,
            sign: from ? '−' : '+',
            tone: from ? 'out' : 'plain',
          };
        }
        return {
          title: `${nameOf(t.fromAccountId)} → ${nameOf(t.toAccountId)}`,
          detail: t.note,
          amount: t.amount,
          sign: '',
          tone: 'plain',
        };
      }
      if (t.type === 'card_payment') {
        // Money moved from an account onto the card, so it reads like a transfer.
        return {
          title: from
            ? `Paid ${nameOf(t.toAccountId)}`
            : into
              ? `Payment from ${nameOf(t.fromAccountId)}`
              : `${nameOf(t.fromAccountId)} → ${nameOf(t.toAccountId)}`,
          detail: 'Card payment',
          amount: t.amount,
          sign: into ? '+' : '−',
          tone: into ? 'plain' : 'out',
        };
      }
      if (t.type === 'adjustment') {
        const title = 'Balance correction';
        // On a card the correction changes what is owed: owing more reads as a card expense does.
        const onCard = accounts.find((a) => a.id === t.toAccountId)?.kind === 'credit';
        const change = onCard ? (t.amount > 0 ? 'owed more' : 'owed less') : '';
        const out = onCard ? t.amount > 0 : t.amount < 0;
        return {
          title,
          detail: join(other(t.toAccountId), change, t.note === title ? '' : t.note),
          amount: Math.abs(t.amount),
          sign: out ? '−' : '+',
          tone: out ? 'out' : 'plain',
        };
      }
      // A purchase's note names what was bought ("Bought KO"); a loan payment names the loan.
      const source = t.fromAccountId === null ? '' : other(t.fromAccountId);
      return {
        title:
          t.type === 'investment'
            ? t.note || 'Investment'
            : `Paid ${debts.find((d) => d.id === t.debtId)?.name ?? 'a loan'}`,
        detail: source && `From ${source}`,
        amount: t.amount,
        sign: '−',
        tone: 'out',
      };
    }
  }
}
