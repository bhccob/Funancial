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
      { path: '/history', label: 'History', icon: Clock },
      { sheet: 'net-worth', label: 'Net worth', icon: ChartColumn },
      { soon: true, label: 'My numbers', icon: List },
    ],
  },
  {
    title: 'You',
    items: [
      { path: '/quests', label: 'Quests', icon: Trophy },
      { path: '/shop', label: 'Shop', icon: ShoppingBag },
      { path: '/inbox', label: 'Inbox', icon: Inbox },
      { path: '/help', label: 'Help', icon: CircleQuestionMark },
      { path: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

/**
 * The pages Profile's menu opens. The Profile tab stays marked on them: it is where they were opened
 * from, and the tab bar has no tab of their own.
 */
export const PROFILE_PAGES: readonly string[] = MENU_GROUPS.flatMap((g) =>
  g.items.flatMap((item) => (item.path === undefined ? [] : [item.path])),
);
