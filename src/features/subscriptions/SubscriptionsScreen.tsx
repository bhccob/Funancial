import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Menu } from '@/components/ui/Menu';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import type { Cycle, Subscription } from '@/domain/entities';
import { localDay } from '@/domain/game/activity';
import { monthKey } from '@/domain/periods';
import { CardSheet } from '@/features/goals/CardSheet';
import { accountName } from '@/features/shared/AccountField';
import { BillRow } from '@/features/shared/BillRow';
import { cn } from '@/lib/cn';
import { daysUntil, formatDay, relativeDays } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceActions, useFinanceView, useMoney, useToday } from '@/store/useFinance';
import { SubscriptionDialog } from './SubscriptionDialog';

const PER: Record<Cycle, string> = {
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
};

const AUDITS = [
  { value: 'keep', label: 'Keep' },
  { value: 'review', label: 'Review' },
  { value: 'cancel', label: 'Cancel' },
] as const;

/** The local day `sub` was last reviewed, if that was in the month of `today`; else `null`. */
function reviewedThisMonth(sub: Subscription, today: string): string | null {
  if (sub.auditedAt === null) return null;
  const day = localDay(sub.auditedAt);
  return monthKey(day) === monthKey(today) ? day : null;
}

function renewsText(today: string, date: string): string {
  const days = daysUntil(today, date);
  return days >= 0 && days <= 7
    ? `Renews ${relativeDays(today, date)}`
    : `Renews ${formatDay(date)}`;
}

export function SubscriptionsScreen() {
  const view = useFinanceView();
  const money = useMoney();
  const today = useToday();
  const subscriptions = useApp((s) => s.data.tables.subscription);
  const accounts = useApp((s) => s.data.tables.account);
  const { setSubscriptionAudit, setSubscriptionStatus } = useFinanceActions();
  const run = useAction();
  // undefined = dialog closed, null = adding a new one.
  const [editing, setEditing] = useState<Subscription | null | undefined>(undefined);
  const [cardId, setCardId] = useState<string | null>(null);

  const byRenewal = (a: Subscription, b: Subscription) =>
    a.nextRenewal.localeCompare(b.nextRenewal) || a.name.localeCompare(b.name);
  const active = subscriptions.filter((s) => s.status === 'active').sort(byRenewal);
  const cards = view.bills.filter((b) => b.kind === 'card');
  const cancelled = subscriptions
    .filter((s) => s.status === 'cancelled')
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader
        title="Bills & cards"
        action={
          <Button size="sm" onClick={() => setEditing(null)}>
            Add
          </Button>
        }
      >
        {`${money(view.billsTotal)} due this month`}
      </PageHeader>

      {cards.length > 0 && (
        <Section title="Card payments">
          <ul className="divide-border divide-y">
            {cards.map((bill) => (
              <BillRow
                key={bill.refId}
                date={bill.date}
                due
                title={bill.name}
                subline={`${bill.inFull ? 'Full balance' : 'Minimum payment'} · ${relativeDays(today, bill.date)}`}
                amount={money(bill.amount)}
                onOpen={() => setCardId(bill.refId)}
              />
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Active"
        action={active.length > 0 ? `${money(view.subscriptionsMonthly)} a month` : undefined}
      >
        {active.length > 0 ? (
          <ul className="divide-border -my-4 divide-y">
            {active.map((sub) => {
              const reviewed = reviewedThisMonth(sub, today);
              return (
                <li key={sub.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{sub.name}</p>
                      <p className="text-muted text-sm font-semibold tabular-nums">
                        {`${money(sub.amount)} / ${PER[sub.cycle]} · ${renewsText(today, sub.nextRenewal)} · ${accountName(accounts, sub.accountId)}`}
                      </p>
                    </div>
                    <Menu
                      label={`Actions for ${sub.name}`}
                      items={[
                        { label: 'Edit', onSelect: () => setEditing(sub) },
                        {
                          label: 'Cancel subscription',
                          danger: true,
                          onSelect: () =>
                            void run(() => setSubscriptionStatus(sub.id, 'cancelled'), {
                              success: `${sub.name} cancelled. No more renewals are added.`,
                            }),
                        },
                      ]}
                    />
                  </div>
                  <div
                    role="group"
                    aria-label={`Audit ${sub.name}`}
                    className="mt-2.5 flex gap-1.5"
                  >
                    {AUDITS.map((a) => {
                      const pressed = sub.audit === a.value;
                      // A mark from an earlier month (or from before review dates) is stamped again,
                      // so it counts for this month; only a mark stamped this month is cleared.
                      const next = pressed && reviewed !== null ? null : a.value;
                      return (
                        <button
                          key={a.value}
                          type="button"
                          aria-pressed={pressed}
                          onClick={() => void run(() => setSubscriptionAudit(sub.id, next))}
                          className={cn(
                            'h-11 rounded-full border px-4 text-xs font-bold',
                            pressed
                              ? 'bg-primary text-primary-contrast border-transparent'
                              : 'border-border-strong text-muted hover:text-text',
                          )}
                        >
                          {a.label}
                        </button>
                      );
                    })}
                  </div>
                  {reviewed !== null && (
                    <p className="text-muted mt-1.5 text-[12.5px]">{`Reviewed ${formatDay(reviewed)}`}</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No subscriptions yet"
            action={
              <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                Add a subscription
              </Button>
            }
          >
            Renewals are added as expenses on their date and count as upcoming bills until then.
          </EmptyState>
        )}
      </Section>

      {cancelled.length > 0 && (
        <Section title="Cancelled">
          <ul className="divide-border -my-3 divide-y">
            {cancelled.map((sub) => (
              <li key={sub.id} className="flex items-center justify-between gap-3 py-3">
                <div className="text-muted min-w-0">
                  <p className="truncate font-semibold">{sub.name}</p>
                  <p className="text-sm tabular-nums">{`${money(sub.amount)} / ${PER[sub.cycle]}`}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Resume ${sub.name}`}
                  onClick={() =>
                    void run(() => setSubscriptionStatus(sub.id, 'active'), {
                      success: `${sub.name} resumed.`,
                    })
                  }
                >
                  Resume
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <SubscriptionDialog sub={editing} onClose={() => setEditing(undefined)} />
      <CardSheet accountId={cardId} onClose={() => setCardId(null)} />
    </div>
  );
}
