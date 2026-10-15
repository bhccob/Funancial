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
import { PlaceholderScreen } from '@/features/placeholder/PlaceholderScreen';
import { SubscriptionsScreen } from '@/features/subscriptions/SubscriptionsScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

export interface AppRoute {
  path: string;
  label: string;
  icon: LucideIcon;
  nav: 'tab' | 'more' | 'hidden';
  element: ReactNode;
}

function placeholder(
  path: string,
  label: string,
  icon: LucideIcon,
  nav: AppRoute['nav'],
  title = label,
): AppRoute {
  return { path, label, icon, nav, element: <PlaceholderScreen title={title} /> };
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/', label: 'Home', icon: House, nav: 'tab', element: <DashboardScreen /> },
  { path: '/budget', label: 'Budget', icon: ChartPie, nav: 'tab', element: <BudgetScreen /> },
  placeholder('/invest', 'Invest', TrendingUp, 'tab'),
  placeholder('/buy', 'Buy It?', ShoppingBag, 'tab', 'Should I Buy It?'),
  placeholder('/quests', 'Quests', Trophy, 'tab'),
  {
    path: '/subscriptions',
    label: 'Subscriptions',
    icon: Repeat,
    nav: 'more',
    element: <SubscriptionsScreen />,
  },
  {
    path: '/freeze',
    label: 'Salary Freeze',
    icon: Snowflake,
    nav: 'more',
    element: <FreezeScreen />,
  },
  placeholder('/dividends', 'Dividends', Coins, 'more'),
  placeholder('/news', 'News', Newspaper, 'more'),
  { path: '/goals', label: 'Goals', icon: Target, nav: 'more', element: <GoalsScreen /> },
  placeholder('/history', 'History', Clock, 'more'),
  placeholder('/shop', 'Shop', Store, 'more'),
  placeholder('/inbox', 'Inbox', Inbox, 'more'),
  placeholder('/help', 'Help', CircleQuestionMark, 'more'),
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
    nav: 'more',
    element: <SettingsScreen />,
  },
  { path: '/add', label: 'Add Expense', icon: Plus, nav: 'hidden', element: <AddScreen /> },
];

export const TAB_ROUTES = APP_ROUTES.filter((r) => r.nav === 'tab');
export const MORE_ROUTES = APP_ROUTES.filter((r) => r.nav === 'more');
