import { useState } from 'react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Section, SectionLink } from '@/components/ui/Section';
import type { Income } from '@/domain/entities';
import { monthKey } from '@/domain/periods';
import { QuestList } from '@/features/game/QuestList';
import { formatDay, formatMonth } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceActions, useFinanceView, useMoney, useToday } from '@/store/useFinance';
import { useGameView } from '@/store/useGame';
import { AccountReminder } from './AccountReminder';
import { BillsSection } from './BillsSection';
import { ConfirmSalaryDialog } from './ConfirmSalaryDialog';
import { GoalsSection } from './GoalsSection';
import { HomeActions } from './HomeActions';
import { HomeHero } from './HomeHero';
import { HomeTopLine } from './HomeTopLine';
import { LimitsSection } from './LimitsSection';
import { NetWorthSection } from './NetWorthSection';
import { ReminderBanner } from './ReminderBanner';
import { SpendingSection } from './SpendingSection';
import { WeekSection } from './WeekSection';

/**
 * Home: a top line, the amount available to spend with the month under it, four round actions,
 * then titled sections. On a wide screen the sections stand in two columns.
 */
export function DashboardScreen() {
  const view = useFinanceView();
  const game = useGameView();
  const money = useMoney();
  const today = useToday();
  const data = useApp((s) => s.data);
  const [confirming, setConfirming] = useState<Income | null>(null);
  const { skipIncome } = useFinanceActions();
  const run = useAction();

  const profile = data.tables.profile[0];
  const weekStartsOn = data.tables.settings[0]?.weekStartsOn ?? 1;
  const freeze = view.activeFreeze;

  return (
    <div>
      <h1 className="sr-only">Home</h1>

      <HomeTopLine name={profile?.name} today={today} game={game} />

      <div className="mb-6 flex flex-col gap-2 empty:hidden">
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
                    variant="banner"
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
        <ReminderBanner />
        <AccountReminder />
      </div>

      <HomeHero view={view} today={today} />
      <HomeActions />

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-14">
        <div className="border-border min-w-0 max-lg:border-b">
          <SpendingSection
            expenses={data.tables.expense}
            today={today}
            weekStartsOn={weekStartsOn}
          />
          <WeekSection
            expenses={data.tables.expense}
            today={today}
            weekTotal={view.spending.week}
          />
          <LimitsSection limits={view.limits} />
        </div>
        <div className="min-w-0">
          <BillsSection bills={view.bills} total={view.billsTotal} today={today} />
          <NetWorthSection data={data} view={view} today={today} />
          <GoalsSection goals={data.tables.goal} />
          <Section title="Quests" action={<SectionLink to="/quests">All</SectionLink>}>
            <QuestList quests={game.quests} limit={3} />
          </Section>
        </div>
      </div>

      <ConfirmSalaryDialog income={confirming} onClose={() => setConfirming(null)} />
    </div>
  );
}
