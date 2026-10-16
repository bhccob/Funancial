import {
  ChartPie,
  CircleQuestionMark,
  Clock,
  Coins,
  House,
  Inbox,
  Newspaper,
  Repeat,
  Settings,
  ShoppingBag,
  Snowflake,
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

/** The three places the bottom bar links to besides Add and Menu, and the sidebar's first links. */
export const HOME: NavTarget = { path: '/', label: 'Home', icon: House };
export const BUDGET: NavTarget = { path: '/budget', label: 'Budget', icon: ChartPie };
export const QUESTS: NavTarget = { path: '/quests', label: 'Quests', icon: Trophy };
export const PRIMARY_LINKS: NavTarget[] = [HOME, BUDGET, QUESTS];

/** Everything else, grouped the way the Menu sheet and the sidebar list it. */
export const MENU_GROUPS: MenuGroup[] = [
  {
    title: 'Your money',
    items: [
      { path: '/subscriptions', label: 'Subscriptions', icon: Repeat, color: '#2a78d6' },
      { path: '/goals', label: 'Goals', icon: Target, color: '#128a60' },
      { path: '/history', label: 'History', icon: Clock, color: '#d9541e' },
      { path: '/freeze', label: 'Salary freeze', icon: Snowflake, color: '#4458d6' },
    ],
  },
  {
    title: 'Coming next',
    items: [
      { path: '/invest', label: 'Invest', icon: TrendingUp, color: '#b86e00', soon: true },
      { path: '/buy', label: 'Buy it?', icon: ShoppingBag, color: '#c43b6a', soon: true },
      { path: '/dividends', label: 'Dividends', icon: Coins, color: '#0b7f8a', soon: true },
      { path: '/news', label: 'News', icon: Newspaper, color: '#5b6270', soon: true },
    ],
  },
  {
    title: 'You',
    items: [
      { path: '/shop', label: 'Shop', icon: Store, color: '#6b46f5' },
      { path: '/inbox', label: 'Inbox', icon: Inbox, color: '#3b82c4', soon: true },
      {
        path: '/help',
        label: 'Help',
        icon: CircleQuestionMark,
        color: '#128a60',
        soon: true,
      },
      { path: '/settings', label: 'Settings', icon: Settings, color: '#5b6270' },
    ],
  },
];
