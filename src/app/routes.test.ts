import { isValidElement } from 'react';
import { expect, it } from 'vitest';
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
      '/dividends',
      '/freeze',
      '/goals',
      '/help',
      '/history',
      '/inbox',
      '/invest',
      '/news',
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

it('serves the shop from its own screen, not a placeholder', () => {
  const shop = APP_ROUTES.find((r) => r.path === '/shop');
  expect(shop).toMatchObject({ label: 'Shop' });
  expect(isValidElement(shop?.element) && shop.element.type).toBe(ShopScreen);
});
