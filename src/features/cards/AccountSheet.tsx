import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { archivedBy } from '@/domain/accounts';
import { accountBalance } from '@/domain/balances';
import { categoryLabel } from '@/domain/budget';
import type { Account, Cycle } from '@/domain/entities';
import { entryDate, historyEntries, type Entry } from '@/domain/history';
import { CardFacts } from '@/features/goals/CardSheet';
import { PayDialog, type PayTarget } from '@/features/goals/PayDialog';
import { ActualBalanceDialog } from '@/features/history/ActualBalanceDialog';
import { accountName } from '@/features/shared/AccountField';
import { formatDate, formatDay, formatShares } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useMoney, useToday } from '@/store/useFinance';
import { KIND_LABEL } from './cardText';

/** How many of an account's latest entries its sheet lists. */
const LATEST = 10;

const PER: Record<Cycle, string> = {
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
};

const HEADING = 'text-muted mt-6 mb-1 text-[13px] font-bold';
const ROWS = 'divide-y divide-black/7 dark:divide-white/8';

/** Whether a History entry moves money on the account: paid with it, into it, or out of it. */
function names(entry: Entry, id: string): boolean {
  switch (entry.kind) {
    case 'expense':
    case 'income':
    case 'dividend':
      return entry.item.accountId === id;
    case 'sale':
      return entry.item.toAccountId === id;
    case 'transaction':
      return entry.item.fromAccountId === id || entry.item.toAccountId === id;
  }
}

type Line = { title: string; detail: string; amount: number; sign: '+' | '−' | '' };

/**
 * One entry as the account sees it: what it was, and the money in (+) or out (−) of the account.
 * On a credit card spending is out and a payment to it is in, as on a bank account.
 */
function lineOf(
  entry: Entry,
  account: Account,
  nameOf: (id: string | null) => string,
  loanName: (id: string | null) => string,
): Line {
  const day = formatDay(entryDate(entry));
  switch (entry.kind) {
    case 'expense': {
      const e = entry.item;
      const category = categoryLabel(e.category);
      return {
        title: e.note || category,
        detail: `${category} · ${day}`,
        amount: e.amount,
        sign: '−',
      };
    }
    case 'income': {
      const i = entry.item;
      const counted = i.status === 'confirmed';
      const status = i.status === 'expected' ? 'Expected' : "Didn't arrive";
      return {
        title: i.label,
        detail: `${counted ? 'Income' : status} · ${day}`,
        amount: counted ? i.amount : 0,
        sign: counted ? '+' : '',
      };
    }
    case 'dividend': {
      const d = entry.item;
      const counted = d.status === 'confirmed';
      return {
        title: `Dividend · ${d.symbol}`,
        detail: day,
        amount: counted ? d.amount : 0,
        sign: counted ? '+' : '',
      };
    }
    case 'sale': {
      const s = entry.item;
      return {
        title: `Sold ${formatShares(s.shares)} ${s.symbol}`,
        detail: day,
        amount: s.proceeds,
        sign: '+',
      };
    }
    case 'transaction': {
      const t = entry.item;
      const out = t.fromAccountId === account.id;
      if (t.type === 'adjustment') {
        // On a card a correction up means owing more, which reads as money out.
        const up = t.amount > 0;
        const sign = account.kind === 'credit' ? (up ? '−' : '+') : up ? '+' : '−';
        return { title: 'Balance correction', detail: day, amount: Math.abs(t.amount), sign };
      }
      if (t.type === 'transfer') {
        return {
          title: out ? `To ${nameOf(t.toAccountId)}` : `From ${nameOf(t.fromAccountId)}`,
          detail: `Transfer · ${day}`,
          amount: t.amount,
          sign: out ? '−' : '+',
        };
      }
      if (t.type === 'card_payment') {
        return {
          title: out ? `Paid ${nameOf(t.toAccountId)}` : `Payment from ${nameOf(t.fromAccountId)}`,
          detail: `Card payment · ${day}`,
          amount: t.amount,
          sign: out ? '−' : '+',
        };
      }
      return {
        // A purchase's note names what was bought ("Bought KO"); a loan payment names the loan.
        title: t.type === 'investment' ? t.note || 'Investment' : `Paid ${loanName(t.debtId)}`,
        detail: day,
        amount: t.amount,
        sign: '−',
      };
    }
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted text-[13px] font-bold">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}

/** A plain row of the sheet: what it is, a line under it, and an amount. */
function Row({ title, detail, amount }: { title: string; detail: string; amount: string }) {
  return (
    <li className="flex min-h-[54px] items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14.5px] font-extrabold">{title}</b>
        <span className="text-muted block truncate text-[12px] font-semibold">{detail}</span>
      </span>
      <span className="shrink-0 text-[14.5px] font-extrabold tabular-nums">{amount}</span>
    </li>
  );
}

/**
 * One account in full, from View card on the Cards tab: what it is and holds (a credit card: what it
 * owes and when, as its own sheet says), then Pay the card for a credit card, or Correct the balance
 * for the others; its latest ten History entries, in History's order; and the subscriptions it pays.
 * Open while `accountId` names an account in use. The dialogs stack over the sheet, which updates
 * behind them.
 */
export function AccountSheet({
  accountId,
  onClose,
}: {
  accountId: string | null;
  onClose(): void;
}) {
  const today = useToday();
  const money = useMoney();
  const data = useApp((s) => s.data);
  const [pay, setPay] = useState<PayTarget | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const account = data.tables.account.find((a) => a.id === accountId && !archivedBy(a, today));
  const balance = account ? accountBalance(account, data, today) : 0;
  const everything = useMemo(() => historyEntries(data), [data]);
  const entries = account ? everything.filter((e) => names(e, account.id)).slice(0, LATEST) : [];
  const subscriptions = account
    ? data.tables.subscription.filter((s) => s.accountId === account.id && s.status === 'active')
    : [];
  const latestId = useId();
  const subscriptionsId = useId();
  // Archived accounts are in the table too, so old rows keep their names.
  const nameOf = (id: string | null) => accountName(data.tables.account, id);
  const loanName = (id: string | null) =>
    data.tables.debt.find((d) => d.id === id)?.name ?? 'a loan';
  const credit = account?.kind === 'credit';

  return (
    <>
      <Sheet open={account !== undefined} title={account?.name ?? ''} onClose={onClose}>
        {account && (
          <>
            {/* The sheet is named by its title; these are the drawn copy of it. */}
            <p aria-hidden="true" className="text-muted text-[13px] font-bold">
              {`${KIND_LABEL[account.kind]}${account.last4 ? ` · •••• ${account.last4}` : ''}${account.frozen ? ' · Frozen' : ''}`}
            </p>
            <p
              aria-hidden="true"
              className="truncate text-[22px] leading-tight font-extrabold tracking-[-0.02em]"
            >
              {account.name}
            </p>
            {credit ? (
              <CardFacts card={account} balance={balance} />
            ) : (
              <dl className="my-4 grid grid-cols-2 gap-x-3 gap-y-3">
                <Fact label="Balance" value={money(balance)} />
                <Fact label="Opened" value={formatDate(account.openingDate)} />
                <Fact label="In Available" value={account.inAvailable ? 'Yes' : 'No'} />
              </dl>
            )}
            <div className="mt-4 flex flex-col gap-2">
              {credit ? (
                <Button
                  disabled={balance <= 0}
                  onClick={() => setPay({ kind: 'card', card: account, balance })}
                >
                  Pay the card
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setCorrecting(true)}>
                  Correct the balance
                </Button>
              )}
            </div>

            <h3 id={latestId} className={HEADING}>
              Latest entries
            </h3>
            {entries.length > 0 ? (
              <ul aria-labelledby={latestId} className={ROWS}>
                {entries.map((entry) => {
                  const line = lineOf(entry, account, nameOf, loanName);
                  return (
                    <Row
                      key={entry.item.id}
                      title={line.title}
                      detail={line.detail}
                      amount={`${line.sign}${money(line.amount)}`}
                    />
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted py-2 text-[14px] font-semibold">Nothing yet.</p>
            )}

            <h3 id={subscriptionsId} className={HEADING}>
              Subscriptions
            </h3>
            {subscriptions.length > 0 ? (
              <ul aria-labelledby={subscriptionsId} className={ROWS}>
                {subscriptions.map((sub) => (
                  <Row
                    key={sub.id}
                    title={sub.name}
                    detail={`Every ${PER[sub.cycle]} · next ${formatDay(sub.nextRenewal)}`}
                    amount={money(sub.amount)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-muted py-2 text-[14px] font-semibold">None paid with it.</p>
            )}
          </>
        )}
      </Sheet>
      <PayDialog target={pay} onClose={() => setPay(null)} />
      <ActualBalanceDialog
        open={correcting}
        accountId={account?.id ?? null}
        onClose={() => setCorrecting(false)}
      />
    </>
  );
}
