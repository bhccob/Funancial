import { ArrowDownLeft, ArrowUpRight, CreditCard, Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAddSheet } from '@/app/useAddSheet';
import { Sparkline } from '@/components/charts/Sparkline';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { HeadBlock } from '@/components/ui/HeadBlock';
import { Rise } from '@/components/ui/Rise';
import type { Bill } from '@/domain/budget';
import type { LocalDate } from '@/domain/dates';
import type { Income } from '@/domain/entities';
import { questProgress } from '@/domain/game/quests';
import { historyEntries } from '@/domain/history';
import { monthToDate, netWorthSummary } from '@/domain/overview';
import { monthKey } from '@/domain/periods';
import { PaySheet } from '@/features/cards/PaySheet';
import { ActualBalanceDialog } from '@/features/history/ActualBalanceDialog';
import { PlainSection, SectionPillButton } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { daysUntil, formatMonth, formatPercent } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceActions, useFinanceView, useMoney, useToday } from '@/store/useFinance';
import { useGameView } from '@/store/useGame';
import { useSelectedAccountRow } from '@/store/useSelectedAccount';
import { AccountReminder } from './AccountReminder';
import { ConfirmSalaryDialog } from './ConfirmSalaryDialog';
import { HomeHero } from './HomeHero';
import { HomeTopLine } from './HomeTopLine';
import { MoveMoneyDialog } from './MoveMoneyDialog';
import { NetWorthSheet } from './NetWorthSheet';
import { NetWorthTile } from './NetWorthTile';
import { QuestShopStrip } from './QuestShopStrip';
import { RecentSection } from './RecentSection';
import { ReminderBanner } from './ReminderBanner';
import { ShowOnHomeSheet } from './ShowOnHomeSheet';

/** How many of the newest History entries Recent shows. */
const RECENT = 5;

/**
 * The bills still to come this month as round glass bubbles, pulled up over the block's edge: a
 * card's mark or a bill's initial, its name and how many days are left. Each opens the bills page.
 * The row runs out to the screen's edges and scrolls sideways. Its disc wears the two-tone ring of
 * what hangs over the edge when the link has the focus; the row keeps 6px above the discs for it, as
 * a row that scrolls clips what is outside it, so the discs still overlap the block by 42px.
 */
function BillBubbles({
  bills,
  today,
  labelledBy,
}: {
  bills: Bill[];
  today: LocalDate;
  labelledBy: string;
}) {
  return (
    <ul
      aria-labelledby={labelledBy}
      className="relative -mx-5 -mt-[48px] flex [scrollbar-width:none] gap-3.5 overflow-x-auto px-5 pt-1.5 pb-1 [&::-webkit-scrollbar]:hidden"
    >
      {bills.map((bill) => {
        const card = bill.kind === 'card';
        const days = daysUntil(today, bill.date);
        const left = days <= 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
        return (
          <li key={`${bill.refId}-${bill.date}`} className="flex-none">
            <Link
              to="/subscriptions"
              aria-label={`${card ? `${bill.name} card payment` : bill.name}, due ${days <= 0 ? 'today' : `in ${left}`}`}
              className="press flex w-[62px] flex-col items-center gap-1 text-center focus-visible:outline-none"
            >
              <span className="glass-strong focus-edge grid size-[58px] place-items-center rounded-full text-[20px] font-extrabold">
                {card ? (
                  <CreditCard aria-hidden="true" className="size-[23px]" />
                ) : (
                  <span aria-hidden="true">{[...bill.name.trim()][0]?.toUpperCase()}</span>
                )}
              </span>
              <b className="block w-full truncate text-[12px] font-extrabold">{bill.name}</b>
              <small className="text-muted -mt-[3px] block text-[11px] font-bold">{left}</small>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One Overview tile: what came in or went out this month so far, how that compares with the same
 * days of last month, and its last 7 months as a line. Tapping it adds one, so it carries a small ＋.
 */
function FlowTile({
  kind,
  total,
  change,
  series,
  onAdd,
}: {
  kind: 'income' | 'expense';
  total: number;
  change: number | null;
  series: number[];
  onAdd(): void;
}) {
  const money = useMoney();
  const income = kind === 'income';
  const Arrow = income ? ArrowDownLeft : ArrowUpRight;
  const amount = money(total, { whole: true });
  return (
    <button
      type="button"
      onClick={onAdd}
      className="glass press relative min-w-0 rounded-[22px] p-3.5 text-left"
    >
      <span
        aria-hidden="true"
        className="glass absolute top-3 right-3 grid size-7 place-items-center rounded-full"
      >
        <Plus className="size-3.5" />
      </span>
      <span className="text-muted flex items-center gap-2 text-[12.5px] font-bold">
        <span className="glass text-text grid size-[30px] flex-none place-items-center rounded-full">
          <Arrow aria-hidden="true" className="size-[15px]" />
        </span>
        {income ? 'Income' : 'Expenses'}
      </span>
      <span
        className={cn(
          'mt-2.5 block truncate text-[20px] font-extrabold tracking-[-0.03em] tabular-nums',
          income ? 'text-success' : 'text-danger',
        )}
      >
        {total === 0 ? amount : `${income ? '+' : '−'}${amount}`}
      </span>
      <span className="text-muted mt-0.5 block text-[11.5px] font-bold">
        {change === null ? 'This month' : `This month · ${formatPercent(change, true)}`}
      </span>
      <span className="mt-2 block h-[30px]">
        <Sparkline
          values={series}
          height={30}
          color={income ? 'var(--color-success)' : 'var(--color-danger)'}
          dot
        />
      </span>
      <span className="sr-only">{income ? 'Add income' : 'Add expense'}</span>
    </button>
  );
}

/**
 * Home, as in the glass wireframe. On the theme's block: the top line, then the hero for the account
 * the person picked (its figure, the account, Pay and ⋯), and "Coming up". Under it: the bills as
 * bubbles over the block's edge, the banners, Overview (income and expenses this month, each tile
 * adding one), Net worth, and the newest entries of History.
 *
 * One slim glass strip sits under the bubbles: the quests done out of the quests open, and the coins
 * with the way to the Shop.
 */
export function DashboardScreen() {
  const view = useFinanceView();
  const game = useGameView();
  const money = useMoney();
  const today = useToday();
  const data = useApp((s) => s.data);
  const row = useSelectedAccountRow();
  const openAdd = useAddSheet();
  const { skipIncome } = useFinanceActions();
  const run = useAction();
  const comingUp = useId();
  const [confirming, setConfirming] = useState<Income | null>(null);
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  // The frozen account Pay was last tapped on: the note shows while it is the one shown, and frozen.
  const [frozenTapped, setFrozenTapped] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [worth, setWorth] = useState(false);

  const overview = useMemo(() => monthToDate(data, today), [data, today]);
  const summary = useMemo(() => netWorthSummary(data, today, view), [data, today, view]);
  const recent = useMemo(() => historyEntries(data).slice(0, RECENT), [data]);

  const profile = data.tables.profile[0];
  const shown = row?.account ?? null;

  function pay() {
    if (!shown) return;
    if (shown.frozen) setFrozenTapped(shown.id);
    else setPaying(shown.id);
  }

  return (
    <>
      {/* The block must be the first thing on the page, so it can run up behind the status bar. */}
      <Rise index={0}>
        <HeadBlock>
          <div className="mx-auto max-w-3xl">
            <h1 className="sr-only">Home</h1>
            <HomeTopLine name={profile?.name} game={game} />
            <HomeHero
              row={row}
              frozenNote={shown !== null && shown.frozen && frozenTapped === shown.id}
              onPick={() => setPicking(true)}
              onPay={pay}
              onMove={() => setMoving(true)}
              onCorrect={() => setCorrecting(true)}
            />
            {view.bills.length > 0 && (
              <h2 id={comingUp} className="text-head-dim pt-[18px] text-[12.5px] font-extrabold">
                Coming up
              </h2>
            )}
          </div>
        </HeadBlock>
      </Rise>

      <div className="mx-auto max-w-3xl">
        <Rise index={1}>
          {view.bills.length > 0 && (
            <BillBubbles bills={view.bills} today={today} labelledBy={comingUp} />
          )}
          <QuestShopStrip
            progress={questProgress(game.quests)}
            coins={Math.max(0, game.totals.coins)}
            className={view.bills.length > 0 ? 'mt-3.5' : 'mt-[22px]'}
          />
        </Rise>

        <Rise index={2}>
          <div className="flex flex-col gap-2 pt-[22px] empty:hidden">
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
            <ReminderBanner />
            <AccountReminder />
          </div>
        </Rise>

        <Rise index={3}>
          <PlainSection title="Overview" to="/history">
            <div className="grid grid-cols-2 gap-2.5">
              <FlowTile
                kind="income"
                total={overview.income}
                change={overview.incomeChange}
                series={overview.incomeSeries}
                onAdd={() => openAdd('income')}
              />
              <FlowTile
                kind="expense"
                total={overview.expenses}
                change={overview.expensesChange}
                series={overview.expensesSeries}
                onAdd={() => openAdd('expense')}
              />
            </div>
          </PlainSection>
        </Rise>

        <Rise index={4}>
          <PlainSection
            title="Net worth"
            action={<SectionPillButton onClick={() => setWorth(true)}>Details</SectionPillButton>}
          >
            <NetWorthTile summary={summary} onOpen={() => setWorth(true)} />
          </PlainSection>
        </Rise>

        <Rise index={5}>
          <RecentSection entries={recent} />
        </Rise>
      </div>

      <ShowOnHomeSheet
        open={picking}
        selectedId={shown?.id ?? null}
        onClose={() => setPicking(false)}
      />
      <PaySheet accountId={paying} onClose={() => setPaying(null)} />
      <MoveMoneyDialog open={moving} fromId={shown?.id ?? null} onClose={() => setMoving(false)} />
      <ActualBalanceDialog
        open={correcting}
        accountId={shown?.id ?? null}
        onClose={() => setCorrecting(false)}
      />
      <NetWorthSheet open={worth} view={view} onClose={() => setWorth(false)} />
      <ConfirmSalaryDialog income={confirming} onClose={() => setConfirming(null)} />
    </>
  );
}
