import { isValidElement } from 'react';
import { expect, it } from 'vitest';
import { InvestScreen } from '@/features/invest/InvestScreen';
import { ShopScreen } from '@/features/shop/ShopScreen';
import { MENU_GROUPS, PRIMARY_LINKS } from './menu';
import { APP_ROUTES } from './routes';

it('has unique paths', () => {
  expect(new Set(APP_ROUTES.map((r) => r.path)).size).toBe(APP_ROUTES.length);
});

it('routes every spec screen', () => {
  expect(APP_ROUTES.map((r) => r.path).sort()).toEqual(
    [
      '/',
      '/add',
      '/budget',
      '/buy',
      '/freeze',
      '/goals',
      '/help',
      '/history',
      '/inbox',
      '/invest',
      '/quests',
      '/settings',
      '/shop',
      '/subscriptions',
    ].sort(),
  );
});

it('routes every screen the bottom bar, Menu sheet and sidebar link to', () => {
  const routed = new Set(APP_ROUTES.map((r) => r.path));
  const linked = [...PRIMARY_LINKS, ...MENU_GROUPS.flatMap((g) => g.items)].map((l) => l.path);
  expect(linked.filter((path) => !routed.has(path))).toEqual([]);
  expect(new Set(linked).size).toBe(linked.length);
});

it('says only where each screen is; names and icons live in menu.ts', () => {
  for (const route of APP_ROUTES) {
    expect(Object.keys(route).sort(), route.path).toEqual(['element', 'path']);
  }
});

it('serves the shop from its own screen, not a placeholder', () => {
  const shop = APP_ROUTES.find((r) => r.path === '/shop');
  expect(isValidElement(shop?.element) && shop.element.type).toBe(ShopScreen);
});

it('serves Invest from its own screen, and has no separate Dividends or News route', () => {
  const invest = APP_ROUTES.find((r) => r.path === '/invest');
  expect(isValidElement(invest?.element) && invest.element.type).toBe(InvestScreen);
  expect(APP_ROUTES.some((r) => r.path === '/dividends' || r.path === '/news')).toBe(false);
});
