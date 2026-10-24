import { categoryLabel } from '@/domain/budget';
import { cardMark, type CardMark } from '@/domain/cardMark';
import type { Account, Debt } from '@/domain/entities';
import type { Entry } from '@/domain/history';
import { formatShares } from '@/lib/format';
import { accountName } from './AccountField';

/**
 * What an entry's amount is: money earned (income, a dividend, a sale), money that left (a minus),
 * or neither (moved between accounts, a correction up, or nothing at all).
 */
export type EntryTone = 'in' | 'out' | 'plain';

/**
 * The account an entry moved money on, drawn as a card mark in its colour where `detail` says its
 * name. `before` is what `detail` says up to the name ("Food · ", "Salary · to "), `after` what it
 * says from the end of the name ("" or " · Subscription"). So `detail` is `before`, `name` and
 * `after` run together; the mark and the card's last 4 digits only add to it.
 */
export interface LineMark extends CardMark {
  /** The account's id, for what looks up its balance. */
  accountId: string;
  before: string;
  after: string;
}

/** One History entry as every list writes it: History, Home's Recent and an account's sheet. */
export interface EntryLine {
  /** What it was: "Groceries", "Skipped dividend · AAPL", "Main account → Savings". */
  title: string;
  /** The line under the title: its kind and the accounts it touched, or '' for none. */
  detail: string;
  /**
   * The account the entry moved money on, set when `detail` names it: an expense's or income's
   * account, a transfer's or card payment's from-account, the account a purchase or a loan payment
   * left, a dividend or a sale paid into, a correction is for. None for an entry with no account (a
   * reinvested dividend), for an account that is gone, and on that account's own sheet.
   */
  mark?: LineMark;
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

/** A place in a line's detail for an account, with the words that lead its name ("to ", "From "). */
interface Slot {
  id: string | null;
  lead: string;
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
  /** Where an account stands in a line's detail, with the words that lead its name. */
  const at = (id: string | null, lead = ''): Slot => ({ id, lead });
  /**
   * The line under a title, from its pieces: the words and the account it names, in order, joined
   * by " · " with the empty ones left out. The account in it, when it is one that exists, is its mark.
   */
  const detailOf = (...parts: Array<string | Slot>): Pick<EntryLine, 'detail' | 'mark'> => {
    const written = parts
      .map((part) => {
        if (typeof part === 'string') return { text: part, slot: undefined };
        const name = other(part.id);
        return { text: name && `${part.lead}${name}`, slot: part };
      })
      .filter((piece) => piece.text);
    const detail = written.map((piece) => piece.text).join(' · ');
    const stands = written.findIndex(
      (piece) => piece.slot && accounts.some((a) => a.id === piece.slot?.id),
    );
    const slot = written[stands]?.slot;
    const account = accounts.find((a) => a.id === slot?.id);
    if (!slot || !account) return { detail };
    return {
      detail,
      mark: {
        ...cardMark(account),
        accountId: account.id,
        before: `${written
          .slice(0, stands)
          .map((piece) => `${piece.text} · `)
          .join('')}${slot.lead}`,
        after: written
          .slice(stands + 1)
          .map((piece) => ` · ${piece.text}`)
          .join(''),
      },
    };
  };

  switch (entry.kind) {
    case 'expense': {
      const e = entry.item;
      const category = categoryLabel(e.category);
      return {
        title: e.note || category,
        ...detailOf(category, at(e.accountId), e.subscriptionId ? 'Subscription' : ''),
        amount: e.amount,
        sign: '−',
        tone: 'out',
      };
    }
    case 'income': {
      const i = entry.item;
      const source = i.source === 'salary' ? 'Salary' : 'Extra income';
      const skipped = i.status === 'skipped';
      return {
        title: i.label,
        ...detailOf(source, at(i.accountId, 'to ')),
        amount: skipped ? 0 : i.amount,
        sign: skipped ? '' : '+',
        tone: skipped ? 'plain' : 'in',
        chip: i.status === 'expected' ? 'Expected' : skipped ? "Didn't arrive" : undefined,
      };
    }
    case 'dividend': {
      const d = entry.item;
      const skipped = d.status === 'skipped';
      return {
        title: `${skipped ? 'Skipped dividend' : 'Dividend'} · ${d.symbol}`,
        ...detailOf(
          d.reinvested ? 'Reinvested' : d.accountId === null ? '' : at(d.accountId, 'To '),
        ),
        amount: skipped ? 0 : d.amount,
        sign: skipped ? '' : '+',
        tone: skipped ? 'plain' : 'in',
      };
    }
    case 'sale': {
      const s = entry.item;
      return {
        title: `Sold ${formatShares(s.shares)} ${s.symbol}`,
        ...detailOf(at(s.toAccountId, 'To ')),
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
            ...detailOf('Transfer', t.note),
            amount: t.amount,
            sign: from ? '−' : '+',
            tone: from ? 'out' : 'plain',
          };
        }
        return {
          title: `${nameOf(t.fromAccountId)} → ${nameOf(t.toAccountId)}`,
          // Which account the money left, first, then the note.
          ...detailOf(at(t.fromAccountId), t.note),
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
          // From either account's own side the title says the other; otherwise which account paid, first.
          ...detailOf(from || into ? '' : at(t.fromAccountId), 'Card payment'),
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
          ...detailOf(at(t.toAccountId), change, t.note === title ? '' : t.note),
          amount: Math.abs(t.amount),
          sign: out ? '−' : '+',
          tone: out ? 'out' : 'plain',
        };
      }
      // A purchase's note names what was bought ("Bought KO"); a loan payment names the loan.
      return {
        title:
          t.type === 'investment'
            ? t.note || 'Investment'
            : `Paid ${debts.find((d) => d.id === t.debtId)?.name ?? 'a loan'}`,
        ...detailOf(t.fromAccountId === null ? '' : at(t.fromAccountId, 'From ')),
        amount: t.amount,
        sign: '−',
        tone: 'out',
      };
    }
  }
}
