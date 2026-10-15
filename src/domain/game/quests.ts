import { addDays, type LocalDate } from '../dates';
import { monthKey, weekRange } from '../periods';
import type { DataSnapshot } from '../snapshot';
import { anyOver, createSpendIndex, loggedEntries, localDay } from './activity';
import { QUEST_REWARDS } from './rules';
import type { Award, GameContext, QuestId, Reward } from './types';

export type QuestView = {
  id: QuestId;
  cadence: 'daily' | 'weekly' | 'monthly';
  /** Today for a daily quest, the week's start for a weekly one, `YYYY-MM` for a monthly one. */
  period: string;
  title: string;
  detail: string;
  current: number;
  target: number;
  done: boolean;
  reward: Reward;
  /** What the quest offers to do on the spot, if anything. */
  action: 'no-spend' | 'checkin' | null;
};

/** The title of each quest. */
export const QUEST_TITLES: Record<QuestId, string> = {
  'log-today': "Log today's spending",
  'week-limits': 'Stay within your limits this week',
  'week-checkin': 'Do your weekly check-in',
  'month-salary': "Reconcile this month's salary",
  'month-audit': 'Audit your subscriptions',
  'month-backup': 'Back up your data',
};

type Progress = Pick<QuestView, 'detail' | 'current' | 'target' | 'done'> &
  Partial<Pick<QuestView, 'action'>>;

function view(
  id: QuestId,
  cadence: QuestView['cadence'],
  period: string,
  progress: Progress,
): QuestView {
  return {
    id,
    cadence,
    period,
    title: QUEST_TITLES[id],
    reward: QUEST_REWARDS[id],
    action: null,
    ...progress,
  };
}

/** A quest with one step: `current` is 1 once it is done. */
function oneStep(done: boolean, detail: string, action: QuestView['action'] = null): Progress {
  return { done, current: done ? 1 : 0, target: 1, detail, action: done ? null : action };
}

function logToday(data: DataSnapshot, ctx: GameContext): QuestView {
  const { today } = ctx;
  const done =
    loggedEntries(data).some((e) => e.day === today) ||
    data.tables.checkIn.some((c) => c.kind === 'no-spend' && c.date === today);
  const spentToday = data.tables.expense.some((e) => e.subscriptionId === null && e.date === today);
  return view(
    'log-today',
    'daily',
    today,
    oneStep(
      done,
      done ? 'Done for today' : 'Add an expense, or tap Nothing spent',
      spentToday ? null : 'no-spend',
    ),
  );
}

/** Progress through the week's limits. It is only ever won once the week has closed. */
function weekLimits(data: DataSnapshot, ctx: GameContext, weekStart: LocalDate): QuestView {
  let dayOfWeek = 0;
  for (let day = weekStart; day <= ctx.today; day = addDays(day, 1)) dayOfWeek += 1;
  const over = anyOver(createSpendIndex(data, ctx.weekStartsOn), weekStart, ctx.today);
  return view('week-limits', 'weekly', weekStart, {
    done: false,
    current: dayOfWeek,
    target: 7,
    detail: over
      ? 'Over a limit this week. Next week is a fresh start.'
      : `Day ${dayOfWeek} of 7 · on track`,
  });
}

function weekCheckin(data: DataSnapshot, weekStart: LocalDate): QuestView {
  const done = data.tables.checkIn.some((c) => c.kind === 'weekly' && c.date === weekStart);
  return view(
    'week-checkin',
    'weekly',
    weekStart,
    oneStep(done, done ? 'Checked in' : 'Review your week in a minute', 'checkin'),
  );
}

function monthSalary(data: DataSnapshot, month: string): QuestView {
  const salaries = data.tables.income.filter((i) => i.source === 'salary' && i.period === month);
  const done = salaries.some((i) => i.status === 'confirmed' || i.status === 'skipped');
  const expected = salaries.some((i) => i.status === 'expected');
  const detail = done
    ? 'Done'
    : expected
      ? 'Confirm it or mark it as not arrived'
      : 'Waiting for pay day';
  return view('month-salary', 'monthly', month, oneStep(done, detail));
}

function monthAudit(data: DataSnapshot, month: string): QuestView {
  const active = data.tables.subscription.filter((s) => s.status === 'active');
  const audited = active.filter(
    (s) => s.auditedAt !== null && monthKey(localDay(s.auditedAt)) === month,
  ).length;
  return view('month-audit', 'monthly', month, {
    done: audited === active.length,
    current: audited,
    target: active.length,
    detail: `${audited} of ${active.length} reviewed`,
  });
}

function monthBackup(data: DataSnapshot, month: string): QuestView {
  const lastBackupAt = data.tables.settings[0]?.lastBackupAt ?? null;
  const done = lastBackupAt !== null && monthKey(localDay(lastBackupAt)) === month;
  return view(
    'month-backup',
    'monthly',
    month,
    oneStep(done, done ? 'Backed up' : 'Save an encrypted copy'),
  );
}

/** The quests for today, this week and this month that apply to the person: daily, weekly, monthly. */
export function currentQuests(data: DataSnapshot, ctx: GameContext): QuestView[] {
  const weekStart = weekRange(ctx.today, ctx.weekStartsOn).start;
  const month = monthKey(ctx.today);

  const quests = [logToday(data, ctx)];
  if (data.tables.budgetLimit.length > 0) quests.push(weekLimits(data, ctx, weekStart));
  quests.push(weekCheckin(data, weekStart));
  if (data.tables.profile[0]?.salary) quests.push(monthSalary(data, month));
  if (data.tables.subscription.some((s) => s.status === 'active')) {
    quests.push(monthAudit(data, month));
  }
  if (ctx.canBackUp) quests.push(monthBackup(data, month));
  return quests;
}

function award(id: QuestId, period: string): Award {
  const title = QUEST_TITLES[id];
  return {
    key: `quest:${id}:${period}`,
    kind: 'quest',
    title,
    label: `Quest: ${title}`,
    ...QUEST_REWARDS[id],
  };
}

/**
 * One award for every quest done in its current period, plus the limits quest for the week that
 * just closed: it is won when some limit existed on that week's last day and no day of it was
 * over. Weeks before that one are not judged.
 */
export function questAwards(data: DataSnapshot, ctx: GameContext): Award[] {
  const awards = currentQuests(data, ctx)
    .filter((q) => q.done)
    .map((q) => award(q.id, q.period));

  const closedStart = addDays(weekRange(ctx.today, ctx.weekStartsOn).start, -7);
  const closedEnd = addDays(closedStart, 6);
  const spend = createSpendIndex(data, ctx.weekStartsOn);
  if (spend.limitsOn(closedEnd) && !anyOver(spend, closedStart, closedEnd)) {
    awards.push(award('week-limits', closedStart));
  }
  return awards;
}
