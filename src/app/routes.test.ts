import { isValidElement } from 'react';
import { expect, it } from 'vitest';
import { ShopScreen } from '@/features/shop/ShopScreen';
import { APP_ROUTES } from './routes';

it('has unique paths', () => {
  expect(new Set(APP_ROUTES.map((r) => r.path)).size).toBe(APP_ROUTES.length);
});

it('has exactly 5 tabs in spec order', () => {
  expect(APP_ROUTES.filter((r) => r.nav === 'tab').map((r) => r.label)).toEqual([
    'Home',
    'Budget',
    'Invest',
    'Buy It?',
    'Quests',
  ]);
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

it('serves the shop from its own screen, not a placeholder', () => {
  const shop = APP_ROUTES.find((r) => r.path === '/shop');
  expect(shop).toMatchObject({ label: 'Shop', nav: 'more' });
  expect(isValidElement(shop?.element) && shop.element.type).toBe(ShopScreen);
});
