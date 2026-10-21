import { EXAMPLES } from '@/domain/examples';
import { MAX_LEVEL, TIERS } from '@/domain/game/levels';
import { LOG_CAP_PER_DAY, LOG_XP } from '@/domain/game/rules';
import { LEGAL } from './legal';

/**
 * Help is data. A "numbers" page shows one or more worked examples from `EXAMPLES`, which the domain
 * tests check against the real rules, so no figure is typed here; the few that appear in prose
 * (the game's rewards) are read from the code that owns them.
 */
export type HelpPage = {
  id: string;
  title: string;
  summary: string;
  group: 'numbers' | 'how' | 'more';
  body: string[];
  exampleIds?: string[];
};

export const HELP_GROUPS: Array<{ id: HelpPage['group']; title: string }> = [
  { id: 'numbers', title: 'How your numbers work' },
  { id: 'how', title: 'How it works' },
  { id: 'more', title: 'More' },
];

/** How an example's `result` value reads: money in the example's currency, a whole percent, a count or a limit's level. */
export type ResultKind = 'money' | 'percent' | 'count' | 'level';

/** The words for each key of an example's `result`. A key with no entry here fails a test. */
export const RESULT_ROWS: Record<string, { label: string; kind: ResultKind }> = {
  // Cards and balances
  cash: { label: 'Cash', kind: 'money' },
  savings: { label: 'Savings', kind: 'money' },
  passive: { label: 'Passive income', kind: 'money' },
  card: { label: 'Owed on the card', kind: 'money' },
  netWorth: { label: 'Net worth', kind: 'money' },
  // Available to spend
  billsTotal: { label: 'Bills still to come', kind: 'money' },
  reserved: { label: 'Held back for limits', kind: 'money' },
  available: { label: 'Available to spend', kind: 'money' },
  foodSpent: { label: 'Spent on food', kind: 'money' },
  foodPct: { label: 'Food limit used', kind: 'percent' },
  // Limits and warnings
  spent: { label: 'Spent so far', kind: 'money' },
  pct: { label: 'Limit used', kind: 'percent' },
  levelRank: { label: 'Warning level', kind: 'level' },
  pctAfterLunch: { label: 'Limit used after the lunch', kind: 'percent' },
  levelRankAfterLunch: { label: 'Warning level after the lunch', kind: 'level' },
  // Salary and freezes
  lossSep: { label: 'Lost in September', kind: 'money' },
  lossOct: { label: 'Lost in October', kind: 'money' },
  total: { label: 'Total lost', kind: 'money' },
  expectedSep: { label: 'Expected pay, September', kind: 'money' },
  expectedOct: { label: 'Expected pay, October', kind: 'money' },
  // Subscriptions
  billsBefore: { label: 'Bills to come before the renewal', kind: 'money' },
  availableBefore: { label: 'Available before the renewal', kind: 'money' },
  cashBefore: { label: 'Cash before the renewal', kind: 'money' },
  cashAfter: { label: 'Cash after the renewal', kind: 'money' },
  billsAfter: { label: 'Bills to come after the renewal', kind: 'money' },
  nextRenewalMonth: { label: 'Next renewal, month', kind: 'count' },
  nextRenewalDay: { label: 'Next renewal, day of the month', kind: 'count' },
};

const warnAt = EXAMPLES.find((e) => e.id === 'LIM-1')!.data.tables.budgetLimit[0]!.warnAt;
const list = (items: readonly string[]) =>
  new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(items);

export const HELP_PAGES: HelpPage[] = [
  {
    id: 'available',
    title: 'Available to spend',
    summary: 'What you can still spend this month',
    group: 'numbers',
    body: [
      'Available to spend is the money you can use now without touching money that is already spoken for.',
      'It starts with your cash and savings. Then it takes away the bills still to come this month, plus the next payment due on each credit card. It also takes away the unspent part of any limit you chose to reserve.',
      'Investments, passive income and pay that is only expected are not part of it.',
      'If it is lower than your cash plus savings, those bills and reserved limits are the reason.',
    ],
    exampleIds: ['AVL-1'],
  },
  {
    id: 'limits',
    title: 'Limits and warnings',
    summary: `Warnings at ${warnAt.map((n) => `${n}%`).join(' · ')}`,
    group: 'numbers',
    body: [
      'A limit is the most you want to spend on one category, or on everything, in a week or a month.',
      'Every expense counts toward its limit by its date. Subscriptions and card purchases count too.',
      'Funcial warns you as you pass each warning point, so you hear about it on the way, not after. You can pick how gentle or strict the words are in Settings.',
      'A limit you reserve holds back what is left of it, and Available to spend leaves that money out.',
    ],
    exampleIds: ['LIM-1'],
  },
  {
    id: 'salary-freeze',
    title: 'Salary and freezes',
    summary: 'What a freeze takes away',
    group: 'numbers',
    body: [
      'A salary freeze is a stretch of days when you are not paid. Funcial takes those days off your expected pay in each month they fall in.',
      'A day is worth your monthly pay divided by the days in that month. A freeze that crosses two months can lose a different amount in each.',
      'Bills and subscriptions do not stop during a freeze. They still count in Available to spend.',
    ],
    exampleIds: ['SAL-1'],
  },
  {
    id: 'cards',
    title: 'Cards and balances',
    summary: "Why card spending isn't cash",
    group: 'numbers',
    body: [
      'Spending on a credit card does not take money from your cash. It adds to what you owe on the card.',
      'Your cash drops when you pay with debit or cash, or when you pay the card off.',
      'An expense is money you spent and did not get back. It counts toward your limits whichever way you paid.',
      'Money you only expect does not count until it arrives. Moving money between cash and savings changes where it sits, not what you are worth.',
    ],
    exampleIds: ['EXP-1', 'BAL-1'],
  },
  {
    id: 'subscriptions',
    title: 'Subscriptions',
    summary: 'Bills that come back on their own',
    group: 'numbers',
    body: [
      'A subscription is a bill that repeats. Once its renewal falls in the current month it is an upcoming bill: it lowers Available to spend, and your cash stays where it is.',
      'On the renewal day Funcial records the charge as an expense, and your cash drops. The next renewal moves forward by one cycle.',
      'Renewals count toward your limits like any other expense.',
    ],
    exampleIds: ['SUB-1'],
  },
  {
    id: 'net-worth',
    title: 'Net worth',
    summary: 'Everything you have minus everything you owe',
    group: 'numbers',
    body: [
      'Net worth is everything you have, minus everything you owe.',
      'What you have is your cash, your savings, the passive income you have received, and your investments at their latest price. What you owe is your card balances and your loans.',
      'Spending lowers it, and saving, earning and paying down what you owe raise it. Moving money between cash and savings does not change it.',
    ],
  },
  {
    id: 'investments',
    title: 'Investments',
    summary: 'Portfolio value, and profit & loss',
    group: 'numbers',
    body: [
      'Portfolio value is what your holdings are worth at their latest price, in your currency. A holding with no price yet is left out until it has one. Prices and exchange rates come from the price service and can be a little behind.',
      'The gain on a holding is what it is worth now minus what you paid.',
      'Profit & loss adds three things together: the gain on what you hold, the realised profit from sales, and every confirmed dividend, reinvested ones included.',
      'Investments count toward your net worth. They are not part of Available to spend.',
    ],
  },
  {
    id: 'dividends',
    title: 'Dividends',
    summary: 'Expected, confirmed, reinvested',
    group: 'how',
    body: [
      'A dividend is a payment a company makes to the people who hold its shares.',
      'Expected payouts come from the real ex-dates the price service reports. When a date is a guess, it shows a ~ in front of it.',
      'An expected payout is not money yet. When it arrives, you confirm it: check the amount you really received and the day it arrived, and choose where it goes.',
      'It can go to cash, savings or passive income, or you can reinvest it in the same holding. If a payout never comes, you can say so.',
      'Every confirmed dividend counts toward your profit & loss.',
    ],
  },
  {
    id: 'game',
    title: 'Levels, quests and coins',
    summary: 'What earns XP and coins',
    group: 'how',
    body: [
      `Using the app earns XP. Logging an expense, income or a dividend earns ${LOG_XP} XP, up to ${LOG_CAP_PER_DAY} a day.`,
      `XP raises your level. There are ${MAX_LEVEL} levels in ${TIERS.length} tiers: ${list(TIERS.map((t) => t.name))}. Each level takes a little more XP than the one before.`,
      "Quests are small jobs for the day, week and month, like logging today's spending or doing your weekly check-in. Streaks count how many days, weeks or months in a row you keep a habit. Badges mark firsts and milestones. Challenges are longer goals you take on yourself.",
      'Quests, streaks, badges and challenges also pay coins. You spend coins in the Shop, on looks and on streak freezes: a logging freeze covers one missed day, and a check-in freeze covers one missed week.',
      'The Quests screen lists everything that earns XP and coins, with the exact amounts.',
    ],
  },
  {
    id: 'glossary',
    title: 'Words',
    summary: 'Glossary: what the terms mean',
    group: 'more',
    body: ['The words Funcial uses, in plain language.'],
  },
  {
    id: 'faq',
    title: 'FAQ',
    summary: 'Quick answers',
    group: 'more',
    body: ['Answers to what people ask most.'],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    summary: 'Where your data lives',
    group: 'more',
    body: LEGAL.privacy,
  },
  {
    id: 'terms',
    title: 'Terms',
    summary: 'The small print, in plain words',
    group: 'more',
    body: LEGAL.terms,
  },
];

export function helpPage(id: string): HelpPage | undefined {
  return HELP_PAGES.find((p) => p.id === id);
}
