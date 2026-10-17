import { isValidElement } from 'react';
import { expect, it } from 'vitest';
import { AboutYouScreen } from '@/features/buy/AboutYouScreen';
import { AnswerScreen } from '@/features/buy/AnswerScreen';
import { BuyScreen } from '@/features/buy/BuyScreen';
import { HelpPage } from '@/features/help/HelpPage';
import { HelpScreen } from '@/features/help/HelpScreen';
import { InboxScreen } from '@/features/inbox/InboxScreen';
import { HoldingPage } from '@/features/invest/HoldingPage';
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
      '/about-you',
      '/add',
      '/budget',
      '/buy',
      '/buy/:id',
      '/freeze',
      '/goals',
      '/help',
      '/help/:id',
      '/history',
      '/inbox',
      '/invest',
      '/invest/holding/:id',
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

it("serves a holding's own page from /invest/holding/:id", () => {
  const holding = APP_ROUTES.find((r) => r.path === '/invest/holding/:id');
  expect(isValidElement(holding?.element) && holding.element.type).toBe(HoldingPage);
});

it('serves Buy it? from its own screens: the Ask form and list, and an answer', () => {
  const ask = APP_ROUTES.find((r) => r.path === '/buy');
  expect(isValidElement(ask?.element) && ask.element.type).toBe(BuyScreen);
  const answer = APP_ROUTES.find((r) => r.path === '/buy/:id');
  expect(isValidElement(answer?.element) && answer.element.type).toBe(AnswerScreen);
});

it('serves About you from its own screen', () => {
  const about = APP_ROUTES.find((r) => r.path === '/about-you');
  expect(isValidElement(about?.element) && about.element.type).toBe(AboutYouScreen);
});

it('serves Help from its own screens: the index and a page', () => {
  const index = APP_ROUTES.find((r) => r.path === '/help');
  expect(isValidElement(index?.element) && index.element.type).toBe(HelpScreen);
  const page = APP_ROUTES.find((r) => r.path === '/help/:id');
  expect(isValidElement(page?.element) && page.element.type).toBe(HelpPage);
});

it('serves the Inbox from its own screen, not a placeholder', () => {
  const inbox = APP_ROUTES.find((r) => r.path === '/inbox');
  expect(isValidElement(inbox?.element) && inbox.element.type).toBe(InboxScreen);
});
