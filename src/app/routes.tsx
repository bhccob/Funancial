import type { ReactNode } from 'react';
import { AddScreen } from '@/features/add/AddScreen';
import { BudgetScreen } from '@/features/budget/BudgetScreen';
import { AnswerScreen } from '@/features/buy/AnswerScreen';
import { BuyScreen } from '@/features/buy/BuyScreen';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { FreezeScreen } from '@/features/freeze/FreezeScreen';
import { GoalsScreen } from '@/features/goals/GoalsScreen';
import { HistoryScreen } from '@/features/history/HistoryScreen';
import { HoldingPage } from '@/features/invest/HoldingPage';
import { InvestScreen } from '@/features/invest/InvestScreen';
import { PlaceholderScreen } from '@/features/placeholder/PlaceholderScreen';
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

function placeholder(path: string, title: string): AppRoute {
  return { path, element: <PlaceholderScreen title={title} /> };
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/', element: <DashboardScreen /> },
  { path: '/budget', element: <BudgetScreen /> },
  { path: '/invest', element: <InvestScreen /> },
  { path: '/invest/holding/:id', element: <HoldingPage /> },
  { path: '/buy', element: <BuyScreen /> },
  { path: '/buy/:id', element: <AnswerScreen /> },
  { path: '/quests', element: <QuestsScreen /> },
  { path: '/subscriptions', element: <SubscriptionsScreen /> },
  { path: '/freeze', element: <FreezeScreen /> },
  { path: '/goals', element: <GoalsScreen /> },
  { path: '/history', element: <HistoryScreen /> },
  { path: '/shop', element: <ShopScreen /> },
  placeholder('/inbox', 'Inbox'),
  placeholder('/help', 'Help'),
  { path: '/settings', element: <SettingsScreen /> },
  { path: '/add', element: <AddScreen /> },
];
