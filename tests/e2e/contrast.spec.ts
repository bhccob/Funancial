import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { startDemo } from './helpers';

/**
 * Text contrast on every screen, in three game themes (Black & White, Sunny Sky and Midnight Navy:
 * the free one, a light block and a dark block) and both modes, checked by axe's `color-contrast`
 * rule (WCAG AA: 4.5:1 for text, 3:1 for large text). Demo money fills the screens, and its banner
 * shows on all of them. The scan covers the whole page, tab bar and banner included; no node is left
 * out.
 *
 * Text over a gradient (the theme's block, the banners) or over blurred glass is something axe
 * cannot work out, so it reports it as "incomplete", not as a violation; so is the label inside a
 * chart ring, where the drawing overlaps it. Those colors are held by the token tests
 * (tests/unit/tokens.test.ts) instead: the ink on the brightest glow of every theme's block, each
 * pair of a gradient's ends against its text, and the ink colors on the surfaces.
 *
 * The demo has no coins to buy a theme with, so a theme is worn through the app's own store: the
 * same two writes the Shop's Buy and Equip make (a purchase in the ledger, the theme in the
 * settings), the purchase priced at nothing so the coins on screen stay the demo's. The theme is
 * then stored data like any other: it survives each `page.goto`, and the app itself writes
 * `<html data-game-theme>` and each block's `data-block-tone`. Every scan first proves the theme is
 * on the page (`expectWorn`).
 */

const MODES = ['light', 'dark'] as const;
type Mode = (typeof MODES)[number];

/**
 * The themes scanned. `tone` is the kind of the theme's top block, which the app writes on each
 * block as `data-block-tone`: a light block carries dark ink, a dark one light ink.
 */
const GAME_THEMES = [
  { id: 'mono', name: 'Black & White', tone: 'dark' },
  { id: 'sky', name: 'Sunny Sky', tone: 'light' },
  { id: 'navy', name: 'Midnight Navy', tone: 'dark' },
] as const;
type GameTheme = (typeof GAME_THEMES)[number];

/** The theme and mode a page is meant to be in, for the proof before a scan. */
interface Look {
  theme: GameTheme;
  mode: Mode;
}

const themesCss = readFileSync(new URL('../../src/styles/themes.css', import.meta.url), 'utf8');

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * What themes.css gives the variable `--name` for theme `id` in `mode`: its own text, which the
 * page's computed value reads the same. Dark mode's own rule is looked in first, then the theme's.
 */
function themeToken(id: string, name: string, mode: Mode): string {
  const selectors = [
    ...(mode === 'dark' ? [`:root[data-theme='dark'][data-game-theme='${id}']`] : []),
    `:root[data-game-theme='${id}']`,
  ];
  for (const selector of selectors) {
    const rule = new RegExp(`${escapeRegExp(selector)}[^{]*\\{([^}]*)\\}`).exec(themesCss);
    const value = rule && new RegExp(`--${name}:\\s*([^;]+);`).exec(rule[1]!)?.[1];
    if (value) return value.trim();
  }
  throw new Error(`themes.css has no --${name} for ${id} in ${mode} mode`);
}

/**
 * Every screen of `APP_ROUTES` (src/app/routes.tsx) that has no parameter. A test below reads that
 * file and fails when a route is missing here, since the file's components cannot be imported into
 * a spec. `/` is Home.
 */
const SCREENS = [
  '/',
  '/cards',
  '/budget',
  '/invest',
  '/profile',
  '/quests',
  '/subscriptions',
  '/goals',
  '/debts',
  '/income',
  '/history',
  '/shop',
  '/inbox',
  '/help',
  '/settings',
  '/add',
];

/** The routes with a parameter, each with the page that stands for it below. */
const PARAM_ROUTES = ['/invest/holding/:id', '/help/:id'];

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'one phone width is enough for colors');
});

test('every screen with no parameter is in the list above', () => {
  const source = readFileSync(new URL('../../src/app/routes.tsx', import.meta.url), 'utf8');
  const routed = [...source.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]!);
  expect(routed.length, 'routes found in routes.tsx').toBeGreaterThan(10);
  expect(
    routed.filter((path) => !path.includes(':') && !SCREENS.includes(path)),
    'screens missing from SCREENS',
  ).toEqual([]);
  expect(
    routed.filter((path) => path.includes(':') && !PARAM_ROUTES.includes(path)),
    'parameter routes missing from PARAM_ROUTES',
  ).toEqual([]);
  expect(
    SCREENS.filter((path) => !routed.includes(path)),
    'SCREENS that are no longer routes',
  ).toEqual([]);
});

test('the themes scanned look different to the check that proves them', () => {
  for (const mode of MODES) {
    const looks = GAME_THEMES.map(
      ({ id }) => `${themeToken(id, 'hmain', mode)} ${themeToken(id, 'accent', mode)}`,
    );
    expect(new Set(looks).size, `${mode} mode: the main button and the accent per theme`).toBe(
      GAME_THEMES.length,
    );
  }
});

/**
 * Puts `theme` on the open demo, as bought and equipped: a purchase of it in the ledger and the
 * theme in the settings, written through the app's own store (the Shop's Buy and Equip write the
 * same two records), which keeps both in the demo's database. The store is found on the React tree,
 * where `AppStoreProvider` holds it for every element. Black & White is what the app wears with
 * nothing equipped, so it needs nothing.
 */
async function wearTheme(page: Page, theme: GameTheme) {
  if (theme.id === 'mono') return;
  await page.evaluate(async (id) => {
    interface Store {
      getState(): {
        data: { tables: { settings: Array<{ cosmetics: Record<string, string> }> } };
        put(table: string, record: object): Promise<void>;
      };
    }
    interface Fiber {
      return: Fiber | null;
      memoizedProps?: { store?: Store };
    }
    const element = document.querySelector('main');
    const fiberKey = element && Object.keys(element).find((k) => k.startsWith('__reactFiber$'));
    let fiber = fiberKey ? ((element as unknown as Record<string, Fiber>)[fiberKey] ?? null) : null;
    let store: Store | undefined;
    while (fiber && !store) {
      store = fiber.memoizedProps?.store;
      fiber = fiber.return;
    }
    if (!store) throw new Error("the app's store is not on the React tree");

    const state = store.getState();
    const settings = state.data.tables.settings[0];
    if (!settings) throw new Error('the demo has no settings');
    const now = new Date().toISOString();
    const ledgerKey = `shop:theme-${id}:e2e`;
    await state.put('ledger', {
      id: `${ledgerKey}#0`,
      createdAt: now,
      updatedAt: now,
      key: ledgerKey,
      kind: 'purchase',
      xp: 0,
      coins: 0,
      label: `Bought: ${id}`,
    });
    await state.put('settings', {
      ...settings,
      cosmetics: { ...settings.cosmetics, theme: `theme-${id}` },
      updatedAt: now,
    });
  }, theme.id);
  await expect(page.locator('html')).toHaveAttribute('data-game-theme', theme.id);
}

/**
 * Proves the page is in the theme and mode the scan is about: both attributes on <html>, the theme's
 * own main-button and accent colors resolved on the page (the text of themes.css, so a theme that
 * fell back to Black & White cannot pass), and the kind of every block on it.
 */
async function expectWorn(page: Page, { theme, mode }: Look) {
  const html = page.locator('html');
  await expect(html, 'the mode on <html>').toHaveAttribute('data-theme', mode);
  await expect(html, 'the game theme on <html>').toHaveAttribute('data-game-theme', theme.id);
  const worn = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      hmain: style.getPropertyValue('--hmain').trim(),
      accent: style.getPropertyValue('--accent').trim(),
      tones: [...document.querySelectorAll<HTMLElement>('[data-head-block]')].map(
        (block) => block.dataset.blockTone,
      ),
    };
  });
  const where = `${theme.name}, ${mode} mode`;
  expect(worn.hmain, `${where}: the main button's color`).toBe(themeToken(theme.id, 'hmain', mode));
  expect(worn.accent, `${where}: the accent`).toBe(themeToken(theme.id, 'accent', mode));
  expect(
    worn.tones.filter((tone) => tone !== theme.tone),
    `${where}: blocks that are not a ${theme.tone} block`,
  ).toEqual([]);
}

/**
 * Waits until the page holds still: the font is in, every CSS animation that ends has ended, and
 * nothing has moved for a few frames. The last part is for the motion library (an amount counting
 * up as a screen opens), whose script-driven moves `getAnimations()` does not list. Gives
 * up after two seconds, so an animation that never ends cannot hold the scan up.
 */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
    const layout = () =>
      [...document.body.querySelectorAll('*')]
        .map((el) => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return `${x},${y},${width},${height}`;
        })
        .join('|');
    let before = layout();
    let still = 0;
    for (let frame = 0; frame < 120 && still < 6; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = layout();
      still = now === before ? still + 1 : 0;
      before = now;
    }
  });
}

/**
 * Scans the page, and fails with every node that is too faint: where it is, its colors and its
 * ratio. With a `look`, the theme and mode are proved on the page first; the welcome screen, which
 * wears no game theme (the app takes it off while locked), passes none.
 */
async function expectReadable(page: Page, where: string, look: Look | null) {
  if (look) await expectWorn(page, look);
  await settle(page);
  const { violations, passes } = await new AxeBuilder({ page })
    .withRules(['color-contrast'])
    .analyze();
  // A page that never drew would pass by having nothing to check.
  expect(passes[0]?.nodes.length ?? 0, `${where}: text that was checked`).toBeGreaterThan(0);
  const report = violations.flatMap((v) =>
    v.nodes.map((node) => {
      const data = node.any[0]?.data as
        | {
            contrastRatio?: number;
            expectedContrastRatio?: string;
            fgColor?: string;
            bgColor?: string;
          }
        | undefined;
      return (
        `${node.target.join(' ')}: ${data?.contrastRatio ?? '?'}:1, needs ${data?.expectedContrastRatio ?? '?'}` +
        ` (${data?.fgColor ?? '?'} on ${data?.bgColor ?? '?'}) ${node.html.slice(0, 120)}`
      );
    }),
  );
  expect(report, `${where}: text under contrast`).toEqual([]);
}

for (const theme of GAME_THEMES) {
  for (const mode of MODES) {
    const look: Look = { theme, mode };
    test.describe(`${theme.name}, ${mode} mode`, () => {
      test.beforeEach(async ({ page }) => {
        // Read at load by the script in index.html, which sets <html data-theme>.
        await page.addInitScript((value) => localStorage.setItem('funancial.theme', value), mode);
      });

      /** Opens `path` in the running demo, in the theme, and waits for its page title. */
      async function visit(page: Page, path: string) {
        await startDemo(page);
        await wearTheme(page, theme);
        if (path !== '/') await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectWorn(page, look);
      }

      if (theme.id === 'mono') {
        // Before the app is open, so no game theme is worn; the other themes have no welcome to scan.
        test('welcome', async ({ page }) => {
          await page.goto('/');
          await expect(page.getByRole('button', { name: 'Try with demo money' })).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
          await expectReadable(page, 'welcome', null);
        });
      }

      for (const path of SCREENS) {
        test(`${path === '/' ? 'Home' : path}`, async ({ page }) => {
          await visit(page, path);
          await expectReadable(page, path, look);
        });
      }

      test('/help/available', async ({ page }) => {
        await visit(page, '/help/available');
        await expectReadable(page, '/help/available', look);
      });

      test('the first demo holding', async ({ page }) => {
        await visit(page, '/invest');
        await page
          .getByRole('main')
          .getByRole('link', { name: /^[A-Z]+ · / })
          .first()
          .click();
        await expect(page).toHaveURL(/\/invest\/holding\/[\w-]+$/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectReadable(page, 'the first holding', look);
      });

      for (const [tile, sheet] of [
        ['Expenses', 'Add expense'],
        ['Income', 'Add income'],
      ] as const) {
        test(`the ${sheet} sheet from Home's ${tile} tile`, async ({ page }) => {
          await visit(page, '/');
          await page
            .getByRole('region', { name: 'Overview' })
            .getByRole('button', { name: new RegExp(`^${tile}.*${sheet}$`) })
            .click();
          await expect(page.getByRole('dialog', { name: sheet })).toBeVisible();
          await expectReadable(page, `the ${sheet} sheet`, look);
        });
      }

      test("Home's More menu, a page surface on the block, and Show on Home", async ({ page }) => {
        await visit(page, '/');
        await page.getByRole('button', { name: 'More', exact: true }).click();
        await expect(page.getByRole('menu', { name: 'More' })).toBeVisible();
        await expectReadable(page, "Home's More menu", look);
        await page.keyboard.press('Escape');

        await page.getByRole('button', { name: /, change account$/ }).click();
        await expect(page.getByRole('dialog', { name: 'Show on Home' })).toBeVisible();
        await expectReadable(page, 'the Show on Home sheet', look);
      });

      test("the Net worth sheet from Profile's menu", async ({ page }) => {
        await visit(page, '/profile');
        await page
          .getByRole('main')
          .getByRole('button', { name: /^Net worth/ })
          .click();
        await expect(page.getByRole('dialog', { name: 'Net worth' })).toBeVisible();
        await expectReadable(page, 'the Net worth sheet', look);
      });

      test("the border sheet from Profile's Lv badge", async ({ page }) => {
        await visit(page, '/profile');
        await page.getByRole('button', { name: /^Lv \d+, choose your border$/ }).click();
        await expect(page.getByRole('dialog', { name: 'Your border' })).toBeVisible();
        await expectReadable(page, 'the border sheet', look);
      });

      test("the Shop's Avatars and Freezes", async ({ page }) => {
        await visit(page, '/shop');
        const tabs = page.getByRole('group', { name: 'Shop sections' });
        await tabs.getByRole('button', { name: 'Avatars' }).click();
        await expect(page.getByRole('heading', { level: 2, name: 'Avatars' })).toBeVisible();
        await expectReadable(page, "the Shop's avatars", look);
        await tabs.getByRole('button', { name: 'Freezes' }).click();
        await expect(page.getByRole('heading', { level: 2, name: 'Streak freezes' })).toBeVisible();
        await expectReadable(page, "the Shop's freezes", look);
      });
    });
  }
}

test("Profile's block sits below the demo banner", async ({ page }) => {
  await startDemo(page);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  const banner = page.getByRole('status').filter({ hasText: "You're exploring with demo money" });
  const block = page.locator('[data-head-block]');
  const bannerBox = await banner.boundingBox();
  const blockBox = await block.boundingBox();
  expect(bannerBox, 'the demo banner is drawn').not.toBeNull();
  expect(blockBox, 'the block is drawn').not.toBeNull();
  expect(blockBox!.y).toBeGreaterThanOrEqual(bannerBox!.y + bannerBox!.height);
});
