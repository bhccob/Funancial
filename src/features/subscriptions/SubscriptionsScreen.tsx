import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Menu } from '@/components/ui/Menu';
import { PageHeader } from '@/components/ui/PageHeader';
import type { Cycle, Subscription } from '@/domain/entities';
import { localDay } from '@/domain/game/activity';
import { monthKey } from '@/domain/periods';
import { CardSheet } from '@/features/goals/CardSheet';
import { accountName } from '@/features/shared/AccountField';
import { BillRow } from '@/features/shared/BillRow';
import { CATEGORY_ICONS } from '@/features/shared/categories';
import { IconRow, ROW_SUB, ROW_TITLE } from '@/features/shared/IconRow';
import { PlainSection, ROWS } from '@/features/shared/PlainSection';
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
      {/* Bills are listed on the Cards tab: where Back goes when the app has no history to go back through. */}
      <PageHeader
        title="Bills & cards"
        back
        backTo="/cards"
        action={
          <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
            Add
          </Button>
        }
      >
        {`${money(view.billsTotal)} due this month`}
      </PageHeader>

      {cards.length > 0 && (
        <PlainSection title="Card payments">
          <ul className={cn('px-1', ROWS)}>
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
        </PlainSection>
      )}

      <PlainSection
        title="Active"
        action={
          active.length > 0 ? (
            <span className="text-muted text-[13.5px] font-bold">
              {`${money(view.subscriptionsMonthly)} a month`}
            </span>
          ) : undefined
        }
      >
        {active.length > 0 ? (
          <ul className={cn('px-1', ROWS)}>
            {active.map((sub) => {
              const reviewed = reviewedThisMonth(sub, today);
              return (
                <li key={sub.id}>
                  <IconRow
                    icon={CATEGORY_ICONS[sub.category]}
                    top
                    end={
                      <div className="-mt-2.5 -mr-2.5">
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
                    }
                  >
                    <p className={cn(ROW_TITLE, 'truncate')}>{sub.name}</p>
                    <p className={cn(ROW_SUB, 'tabular-nums')}>
                      {`${money(sub.amount)} / ${PER[sub.cycle]} · ${renewsText(today, sub.nextRenewal)} · ${accountName(accounts, sub.accountId)}`}
                    </p>
                    <div
                      role="group"
                      aria-label={`Audit ${sub.name}`}
                      className="mt-2.5 flex gap-2"
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
                              // A 32px pill with a 44px tap area, as the add forms' pills are.
                              'press hit-44 h-8 rounded-full px-3 text-[12.5px] font-extrabold',
                              // Solid, not glass: the glass shorthand would paint over a fill.
                              pressed
                                ? 'bg-primary text-primary-contrast border-primary border'
                                : 'glass text-text',
                            )}
                          >
                            {a.label}
                          </button>
                        );
                      })}
                    </div>
                    {reviewed !== null && (
                      <p className={cn(ROW_SUB, 'mt-1.5')}>{`Reviewed ${formatDay(reviewed)}`}</p>
                    )}
                  </IconRow>
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
      </PlainSection>

      {cancelled.length > 0 && (
        <PlainSection title="Cancelled">
          <ul className={cn('px-1', ROWS)}>
            {cancelled.map((sub) => (
              <li key={sub.id}>
                <IconRow
                  icon={CATEGORY_ICONS[sub.category]}
                  end={
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
                  }
                >
                  <p className={cn(ROW_TITLE, 'text-muted truncate')}>{sub.name}</p>
                  <p className={cn(ROW_SUB, 'tabular-nums')}>
                    {`${money(sub.amount)} / ${PER[sub.cycle]}`}
                  </p>
                </IconRow>
              </li>
            ))}
          </ul>
        </PlainSection>
      )}

      <SubscriptionDialog sub={editing} onClose={() => setEditing(undefined)} />
      <CardSheet accountId={cardId} onClose={() => setCardId(null)} />
    </div>
  );
}
