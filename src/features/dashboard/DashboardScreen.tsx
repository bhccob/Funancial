import { CreditCard, HandCoins, Plus, Repeat, ShoppingBag } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Banner } from '@/components/ui/Banner';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Section } from '@/components/ui/Section';
import { categoryBreakdown, categoryLabel, limitLabel, type LimitStatus } from '@/domain/budget';
import type { Goal, Income } from '@/domain/entities';
import { monthKey, monthRange } from '@/domain/periods';
import { cn } from '@/lib/cn';
import { formatDay, formatMonth, relativeDays } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useAction } from '@/lib/useAction';
import { useFinanceActions, useFinanceView, useMoney, useToday } from '@/store/useFinance';
import { ConfirmSalaryDialog } from './ConfirmSalaryDialog';

const sectionLink = 'hover:text-text underline-offset-4 hover:underline';

function Kpi({
  label,
  value,
  lead,
  children,
}: {
  label: string;
  value: string;
  lead?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'border-border border-b py-6 last:border-b-0 lg:border-b-0 lg:py-7',
        'lg:[&+&]:border-l lg:[&+&]:pl-6 lg:[&:not(:last-child)]:pr-6',
      )}
    >
      <h2 id={id} className="text-muted text-[13px] font-semibold">
        {label}
      </h2>
      <p
        className={cn(
          'mt-1.5 font-extrabold tracking-[-0.03em] tabular-nums',
          lead ? 'text-[40px] leading-[1.1] lg:text-[48px]' : 'text-[34px] leading-[1.15]',
        )}
      >
        {value}
      </p>
      {children}
    </section>
  );
}

/** One cell of the two-column grid: hairline below, and a hairline between the columns on wide screens. */
function Panel({ side, ...props }: { side: 'left' | 'right' } & Parameters<typeof Section>[0]) {
  return (
    <Section
      {...props}
      className={side === 'left' ? 'lg:pr-6' : 'lg:border-border lg:border-l lg:pl-6'}
    />
  );
}

function LimitRow({ status, month }: { status: LimitStatus; month: string }) {
  const money = useMoney();
  const { limit, spent, remaining, pct, level } = status;
  const label = `${limitLabel(limit)} · ${limit.period === 'weekly' ? 'this week' : month}`;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-semibold">
        <span className="truncate">{label}</span>
        <span className="text-muted shrink-0 font-medium tabular-nums">
          {money(spent)} of {money(limit.amount)}
        </span>
      </div>
      <ProgressBar label={label} value={pct} level={level} valueText={`${pct}% used`} />
      {level !== 'ok' && (
        <p
          className={cn(
            'mt-1 text-xs font-semibold',
            level === 'warn' ? 'text-warning' : 'text-danger',
          )}
        >
          {remaining >= 0 ? `${money(remaining)} left` : `${money(-remaining)} over`}
        </p>
      )}
    </div>
  );
}

function goalOrder(a: Goal, b: Goal): number {
  // Deadlines first (soonest first), then the closest to done.
  if (a.deadline !== b.deadline) {
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline.localeCompare(b.deadline);
  }
  return b.current / b.target - a.current / a.target;
}

export function DashboardScreen() {
  const view = useFinanceView();
  const money = useMoney();
  const today = useToday();
  const data = useApp((s) => s.data);
  const [confirming, setConfirming] = useState<Income | null>(null);
  const { skipIncome } = useFinanceActions();
  const run = useAction();

  const profile = data.tables.profile[0];
  const month = formatMonth(monthKey(today));
  const overall = view.limits.find(
    (l) => l.limit.scope === 'overall' && l.limit.period === 'monthly',
  );
  const topCategories = categoryBreakdown(data.tables.expense, monthRange(today)).slice(0, 3);
  const goals = [...data.tables.goal].sort(goalOrder).slice(0, 2);
  const freeze = view.activeFreeze;

  return (
    <div>
      <PageHeader
        compact
        title="Home"
        action={profile?.name ? <p className="text-[13px] font-bold">Hi, {profile.name}</p> : null}
      />

      {(view.pendingSalary.length > 0 || freeze) && (
        <div className="flex flex-col gap-2 pt-4">
          {view.pendingSalary.map((income) => {
            const m = formatMonth(income.period ?? monthKey(income.date));
            return (
              <Banner
                key={income.id}
                tone="info"
                action={
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Didn't arrive (${m} salary)`}
                      onClick={() =>
                        void run(() => skipIncome(income.id), {
                          success: `${m} salary marked as not arrived. It isn't counted.`,
                        })
                      }
                    >
                      Didn&apos;t arrive
                    </Button>
                    <Button
                      size="sm"
                      aria-label={`Confirm ${m} salary`}
                      onClick={() => setConfirming(income)}
                    >
                      Confirm
                    </Button>
                  </div>
                }
              >
                {`Your ${m} salary is expected: ${money(income.amount)}. Did it arrive?`}
              </Banner>
            );
          })}
          {freeze && (
            <Banner tone="info">
              {`Salary freeze until ${formatDay(freeze.end)}. Bills and subscriptions still apply.`}
            </Banner>
          )}
        </div>
      )}

      <div className="border-border grid border-b lg:grid-cols-[1.3fr_1fr_1fr]">
        <Kpi label="Available to spend" value={money(view.available)} lead>
          <p className="text-muted mt-1.5 text-[13px] font-semibold">
            Cash + savings − upcoming bills − reserved limits
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink to="/add" size="sm">
              <Plus aria-hidden className="size-4" />
              Add expense
            </ButtonLink>
            <ButtonLink to="/add?type=income" size="sm" variant="secondary">
              <HandCoins aria-hidden className="size-4" />
              Income
            </ButtonLink>
            <ButtonLink to="/buy" size="sm" variant="secondary">
              <ShoppingBag aria-hidden className="size-4" />
              Buy it?
            </ButtonLink>
          </div>
        </Kpi>
        <Kpi label="Net worth" value={money(view.netWorth)}>
          <p className="text-muted mt-1.5 text-[13px] font-semibold tabular-nums">
            {`Cash ${money(view.buckets.cash)} · Savings ${money(view.buckets.savings)} · Debts ${money(view.debtTotal)}`}
          </p>
        </Kpi>
        <Kpi label={`Spent in ${month}`} value={money(view.spending.month)}>
          <p className="text-muted mt-1.5 text-[13px] font-semibold tabular-nums">
            {overall
              ? `${overall.pct}% of your ${money(overall.limit.amount)} limit`
              : `This year ${money(view.spending.year)}`}
          </p>
        </Kpi>
      </div>

      <div className="grid lg:grid-cols-[7fr_5fr]">
        <Panel
          side="left"
          title="Limits"
          action={
            view.limits.length > 0 ? (
              <Link to="/budget" className={sectionLink}>
                See all
              </Link>
            ) : null
          }
        >
          {view.limits.length > 0 ? (
            <div className="flex flex-col gap-4">
              {view.limits.slice(0, 4).map((s) => (
                <LimitRow key={s.limit.id} status={s} month={month} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No limits yet"
              action={
                <ButtonLink to="/budget" size="sm" variant="secondary">
                  Set a limit
                </ButtonLink>
              }
            >
              Limits warn you before you overspend.
            </EmptyState>
          )}
        </Panel>

        <Panel side="right" title="Spending">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {(
              [
                ['Today', view.spending.today],
                ['This week', view.spending.week],
                ['This month', view.spending.month],
                ['This year', view.spending.year],
              ] as const
            ).map(([label, amount]) => (
              <div key={label}>
                <dt className="text-muted text-xs font-semibold">{label}</dt>
                <dd className="text-lg font-extrabold tabular-nums">{money(amount)}</dd>
              </div>
            ))}
          </dl>
          {topCategories.length > 0 && (
            <>
              <h3 className="text-muted mt-5 mb-1 text-xs font-semibold">Top in {month}</h3>
              <ul className="divide-border divide-y">
                {topCategories.map((c) => (
                  <li key={c.category} className="flex justify-between py-2 text-sm font-semibold">
                    <span>{categoryLabel(c.category)}</span>
                    <span className="tabular-nums">{money(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel
          side="left"
          title="Upcoming bills"
          action={view.bills.length > 0 ? `${money(view.billsTotal)} this month` : null}
        >
          {view.bills.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {view.bills.map((b) => {
                const card =
                  b.kind === 'card' ? data.tables.debt.find((d) => d.id === b.refId) : undefined;
                const Icon = b.kind === 'card' ? CreditCard : Repeat;
                return (
                  <li key={`${b.refId}-${b.date}`} className="flex items-center gap-3 py-2">
                    <span className="bg-surface-2 grid size-9 shrink-0 place-items-center rounded-xl">
                      <Icon aria-hidden className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{b.name}</span>
                      <span className="text-muted block text-[12.5px]">
                        {card
                          ? `Due ${formatDay(b.date)} · ${card.payInFull || card.minimumPayment <= 0 ? 'full balance' : 'minimum payment'}`
                          : `${formatDay(b.date)} · ${relativeDays(today, b.date)}`}
                      </span>
                    </span>
                    <span className="text-sm font-bold tabular-nums">{money(b.amount)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Nothing due this month">
              Subscription renewals and card payments due before the month ends show up here.
            </EmptyState>
          )}
        </Panel>

        <Panel
          side="right"
          title="Goals"
          action={
            goals.length > 0 ? (
              <Link to="/goals" className={sectionLink}>
                All goals
              </Link>
            ) : null
          }
        >
          {goals.length > 0 ? (
            <div className="flex flex-col gap-4">
              {goals.map((g) => {
                const pct = Math.floor((g.current * 100) / g.target);
                return (
                  <div key={g.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-semibold">
                      <span className="truncate">{g.name}</span>
                      <span className="text-muted shrink-0 font-medium tabular-nums">
                        {money(g.current)} of {money(g.target)}
                      </span>
                    </div>
                    <ProgressBar
                      label={g.name}
                      value={pct}
                      level="ok"
                      valueText={`${pct}% saved`}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No goals yet"
              action={
                <ButtonLink to="/goals" size="sm" variant="secondary">
                  Add a goal
                </ButtonLink>
              }
            >
              Save toward something and watch it fill up.
            </EmptyState>
          )}
        </Panel>
      </div>

      <ConfirmSalaryDialog income={confirming} onClose={() => setConfirming(null)} />
    </div>
  );
}
