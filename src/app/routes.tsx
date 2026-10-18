import type { ReactNode } from 'react';
import { AddScreen } from '@/features/add/AddScreen';
import { BudgetScreen } from '@/features/budget/BudgetScreen';
import { AboutYouScreen } from '@/features/buy/AboutYouScreen';
import { AnswerScreen } from '@/features/buy/AnswerScreen';
import { BuyScreen } from '@/features/buy/BuyScreen';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { FreezeScreen } from '@/features/freeze/FreezeScreen';
import { DebtsScreen } from '@/features/goals/DebtsScreen';
import { GoalsScreen } from '@/features/goals/GoalsScreen';
import { HelpPage } from '@/features/help/HelpPage';
import { HelpScreen } from '@/features/help/HelpScreen';
import { HistoryScreen } from '@/features/history/HistoryScreen';
import { InboxScreen } from '@/features/inbox/InboxScreen';
import { HoldingPage } from '@/features/invest/HoldingPage';
import { IncomeScreen } from '@/features/income/IncomeScreen';
import { InvestScreen } from '@/features/invest/InvestScreen';
import { QuestsScreen } from '@/features/quests/QuestsScreen';
import { ShopScreen } from '@/features/shop/ShopScreen';
import { SubscriptionsScreen } from '@/features/subscriptions/SubscriptionsScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

/**
 * Every screen the app routes to. What the bottom bar, Menu sheet and sidebar list, with each
 * item's name and icon, lives in `menu.ts`.
 */
export interface AppRoute {
  path: string;
  element: ReactNode;
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/', element: <DashboardScreen /> },
  { path: '/budget', element: <BudgetScreen /> },
  { path: '/invest', element: <InvestScreen /> },
  { path: '/invest/holding/:id', element: <HoldingPage /> },
  { path: '/buy', element: <BuyScreen /> },
  { path: '/buy/:id', element: <AnswerScreen /> },
  { path: '/quests', element: <QuestsScreen /> },
  { path: '/about-you', element: <AboutYouScreen /> },
  { path: '/subscriptions', element: <SubscriptionsScreen /> },
  { path: '/freeze', element: <FreezeScreen /> },
  { path: '/goals', element: <GoalsScreen /> },
  { path: '/debts', element: <DebtsScreen /> },
  { path: '/income', element: <IncomeScreen /> },
  { path: '/history', element: <HistoryScreen /> },
  { path: '/shop', element: <ShopScreen /> },
  { path: '/inbox', element: <InboxScreen /> },
  { path: '/help', element: <HelpScreen /> },
  { path: '/help/:id', element: <HelpPage /> },
  { path: '/settings', element: <SettingsScreen /> },
  { path: '/add', element: <AddScreen /> },
];
