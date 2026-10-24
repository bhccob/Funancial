import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { archivedBy } from '@/domain/accounts';
import { accountBalance } from '@/domain/balances';
import type { Cycle, Subscription } from '@/domain/entities';
import { entryDate, historyEntries, movesMoneyOn } from '@/domain/history';
import { CardFacts, Fact } from '@/features/goals/CardSheet';
import { PayDialog, type PayTarget } from '@/features/goals/PayDialog';
import { ActualBalanceDialog } from '@/features/history/ActualBalanceDialog';
import { entryLine, type EntryLine } from '@/features/shared/entryLine';
import { dayName, entryIcon } from '@/features/shared/entryLook';
import { EntryRow } from '@/features/shared/EntryRow';
import { ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { formatDate, formatDay } from '@/lib/format';
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

/** A subscription as the sheet's rows write it: its name, when it renews, and what it costs. */
const subscriptionLine = (sub: Subscription): EntryLine => ({
  title: sub.name,
  detail: `Every ${PER[sub.cycle]} · next ${formatDay(sub.nextRenewal)}`,
  amount: sub.amount,
  sign: '',
  tone: 'plain',
});

const HEADING = 'text-muted mt-6 mb-1 text-[13px] font-bold';

/**
 * One account in full, from View card on the Cards tab: what it is and holds (a credit card: what it
 * owes and when, as its own sheet says), then Pay the card for a credit card, or Correct the balance
 * for the others; its latest ten History entries, in History's order and written as History writes
 * them, seen from the account (`entryLine`), in the rows of the Cards tab's "On this card"
 * (`EntryRow`); and the subscriptions it pays.
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
  const entries = account
    ? everything.filter((e) => movesMoneyOn(e, account.id)).slice(0, LATEST)
    : [];
  const subscriptions = account
    ? data.tables.subscription.filter((s) => s.accountId === account.id && s.status === 'active')
    : [];
  const latestId = useId();
  const subscriptionsId = useId();
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
              <dl className={cn('my-3', ROWS)}>
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
                {entries.map((entry) => (
                  // The rows of "On this card", one tap away on the Cards tab: seen from this account (a
                  // transfer or a card payment is money in or out of it), with the icon and the day.
                  <EntryRow
                    key={entry.item.id}
                    entryId={entry.item.id}
                    line={entryLine(entry, {
                      accounts: data.tables.account,
                      debts: data.tables.debt,
                      perspective: account.id,
                    })}
                    icon={entryIcon(entry)}
                    day={dayName(entryDate(entry), today)}
                    danger
                  />
                ))}
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
                  <EntryRow key={sub.id} line={subscriptionLine(sub)} />
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
