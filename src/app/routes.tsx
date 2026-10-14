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
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { PlaceholderScreen } from '@/features/placeholder/PlaceholderScreen';
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
  placeholder('/budget', 'Budget', ChartPie, 'tab'),
  placeholder('/invest', 'Invest', TrendingUp, 'tab'),
  placeholder('/buy', 'Buy It?', ShoppingBag, 'tab', 'Should I Buy It?'),
  placeholder('/quests', 'Quests', Trophy, 'tab'),
  placeholder('/subscriptions', 'Subscriptions', Repeat, 'more'),
  placeholder('/freeze', 'Salary Freeze', Snowflake, 'more'),
  placeholder('/dividends', 'Dividends', Coins, 'more'),
  placeholder('/news', 'News', Newspaper, 'more'),
  placeholder('/goals', 'Goals', Target, 'more'),
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
  placeholder('/add', 'Add Expense', Plus, 'hidden'),
];

export const TAB_ROUTES = APP_ROUTES.filter((r) => r.nav === 'tab');
export const MORE_ROUTES = APP_ROUTES.filter((r) => r.nav === 'more');
