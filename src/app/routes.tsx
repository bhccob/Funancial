import {
  ChartPie,
  CircleQuestionMark,
  Clock,
  Coins,
  House,
  Inbox,
  Newspaper,
  Plus,
  Repeat,
  Settings,
  ShoppingBag,
  Snowflake,
  Store,
  Target,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { AddScreen } from '@/features/add/AddScreen';
import { BudgetScreen } from '@/features/budget/BudgetScreen';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { FreezeScreen } from '@/features/freeze/FreezeScreen';
import { GoalsScreen } from '@/features/goals/GoalsScreen';
import { HistoryScreen } from '@/features/history/HistoryScreen';
import { PlaceholderScreen } from '@/features/placeholder/PlaceholderScreen';
import { QuestsScreen } from '@/features/quests/QuestsScreen';
import { ShopScreen } from '@/features/shop/ShopScreen';
import { SubscriptionsScreen } from '@/features/subscriptions/SubscriptionsScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

/** Every screen the app routes to. What the bottom bar, Menu sheet and sidebar list lives in `menu.ts`. */
export interface AppRoute {
  path: string;
  label: string;
  icon: LucideIcon;
  element: ReactNode;
}

function placeholder(path: string, label: string, icon: LucideIcon, title = label): AppRoute {
  return { path, label, icon, element: <PlaceholderScreen title={title} /> };
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/', label: 'Home', icon: House, element: <DashboardScreen /> },
  { path: '/budget', label: 'Budget', icon: ChartPie, element: <BudgetScreen /> },
  placeholder('/invest', 'Invest', TrendingUp),
  placeholder('/buy', 'Buy It?', ShoppingBag, 'Should I Buy It?'),
  { path: '/quests', label: 'Quests', icon: Trophy, element: <QuestsScreen /> },
  {
    path: '/subscriptions',
    label: 'Subscriptions',
    icon: Repeat,
    element: <SubscriptionsScreen />,
  },
  { path: '/freeze', label: 'Salary Freeze', icon: Snowflake, element: <FreezeScreen /> },
  placeholder('/dividends', 'Dividends', Coins),
  placeholder('/news', 'News', Newspaper),
  { path: '/goals', label: 'Goals', icon: Target, element: <GoalsScreen /> },
  { path: '/history', label: 'History', icon: Clock, element: <HistoryScreen /> },
  { path: '/shop', label: 'Shop', icon: Store, element: <ShopScreen /> },
  placeholder('/inbox', 'Inbox', Inbox),
  placeholder('/help', 'Help', CircleQuestionMark),
  { path: '/settings', label: 'Settings', icon: Settings, element: <SettingsScreen /> },
  { path: '/add', label: 'Add Expense', icon: Plus, element: <AddScreen /> },
];
