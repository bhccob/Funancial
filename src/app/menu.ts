import {
  ChartColumn,
  ChartPie,
  CircleQuestionMark,
  Clock,
  CreditCard,
  House,
  Inbox,
  List,
  Settings,
  ShoppingBag,
  TrendingUp,
  Trophy,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export interface NavTarget {
  path: string;
  label: string;
  icon: LucideIcon;
}

/** A sheet a menu row opens over the page it is on, rather than a page of its own. */
export type MenuSheet = 'net-worth';

/**
 * A row of Profile's menu (and the sidebar's): it opens a page (`path`), opens a sheet over the page
 * (`sheet`), or is not built yet (`soon`), which shows it marked "Soon" and does nothing.
 */
export type MenuItem = {
  label: string;
  icon: LucideIcon;
  /** Fixed in both themes: each holds at least 3:1 against the white icon on it. */
  color: string;
} & (
  | { path: string; sheet?: undefined; soon?: undefined }
  | { sheet: MenuSheet; path?: undefined; soon?: undefined }
  | { soon: true; path?: undefined; sheet?: undefined }
);

export interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export const HOME: NavTarget = { path: '/', label: 'Home', icon: House };
export const CARDS: NavTarget = { path: '/cards', label: 'Cards', icon: CreditCard };
/** Spending is the Budget page. */
export const SPENDING: NavTarget = { path: '/budget', label: 'Spending', icon: ChartPie };
export const INVEST: NavTarget = { path: '/invest', label: 'Invest', icon: TrendingUp };
/** The person's level, coins and the menu below them. The avatar on Home opens it too. */
export const PROFILE: NavTarget = { path: '/profile', label: 'Profile', icon: UserRound };

/** The phone's tab bar, Profile at the bottom right; the sidebar's first links on a wide screen. */
export const TABS = [HOME, CARDS, SPENDING, INVEST, PROFILE] as const;

/**
 * Everything else, grouped the way Profile and the sidebar list it. Bills & cards and Loans are on
 * the Cards tab, Goals on Spending and Income on Home, so they are not here.
 */
export const MENU_GROUPS: MenuGroup[] = [
  {
    title: 'Your money',
    items: [
      { path: '/history', label: 'History', icon: Clock, color: '#d9541e' },
      { sheet: 'net-worth', label: 'Net worth', icon: ChartColumn, color: '#2a78d6' },
      { soon: true, label: 'My numbers', icon: List, color: '#0f7a8a' },
    ],
  },
  {
    title: 'You',
    items: [
      { path: '/quests', label: 'Quests', icon: Trophy, color: '#b86e00' },
      { path: '/shop', label: 'Shop', icon: ShoppingBag, color: '#6b46f5' },
      { path: '/inbox', label: 'Inbox', icon: Inbox, color: '#3b82c4' },
      { path: '/help', label: 'Help', icon: CircleQuestionMark, color: '#128a60' },
      { path: '/settings', label: 'Settings', icon: Settings, color: '#5b6270' },
    ],
  },
];
