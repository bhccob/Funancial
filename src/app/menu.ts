import {
  ChartPie,
  CircleQuestionMark,
  Clock,
  CreditCard,
  HandCoins,
  House,
  Inbox,
  Repeat,
  Settings,
  Store,
  Target,
  Trophy,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

export interface NavTarget {
  path: string;
  label: string;
  icon: LucideIcon;
}

export interface MenuItem extends NavTarget {
  /** Fixed in both themes: each holds at least 3:1 against the white icon on it. */
  color: string;
  /** Not built yet: the row still opens its page, marked "Soon". */
  soon?: boolean;
}

export interface MenuGroup {
  title: string;
  items: MenuItem[];
}

/** The three places the bottom bar links to besides the Menu, and the sidebar's first links. */
export const HOME: NavTarget = { path: '/', label: 'Home', icon: House };
export const BUDGET: NavTarget = { path: '/budget', label: 'Budget', icon: ChartPie };
export const INVEST: NavTarget = { path: '/invest', label: 'Invest', icon: TrendingUp };
export const PRIMARY_LINKS: NavTarget[] = [HOME, BUDGET, INVEST];

/** Everything else, grouped the way the Menu sheet and the sidebar list it. */
export const MENU_GROUPS: MenuGroup[] = [
  {
    title: 'Your money',
    items: [
      { path: '/subscriptions', label: 'Bills & cards', icon: Repeat, color: '#2a78d6' },
      { path: '/goals', label: 'Goals', icon: Target, color: '#128a60' },
      { path: '/debts', label: 'Debts', icon: CreditCard, color: '#b3261e' },
      { path: '/income', label: 'Income', icon: HandCoins, color: '#2e7d32' },
      { path: '/history', label: 'History', icon: Clock, color: '#d9541e' },
    ],
  },
  {
    title: 'You',
    items: [
      { path: '/quests', label: 'Quests', icon: Trophy, color: '#b86e00' },
      { path: '/shop', label: 'Shop', icon: Store, color: '#6b46f5' },
      { path: '/inbox', label: 'Inbox', icon: Inbox, color: '#3b82c4' },
      { path: '/help', label: 'Help', icon: CircleQuestionMark, color: '#128a60' },
      { path: '/settings', label: 'Settings', icon: Settings, color: '#5b6270' },
    ],
  },
];
