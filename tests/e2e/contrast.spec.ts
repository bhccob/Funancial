import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { startDemo } from './helpers';

/**
 * Text contrast on every screen, in both themes, checked by axe's `color-contrast` rule (WCAG AA:
 * 4.5:1 for text, 3:1 for large text). Demo money fills the screens, and its banner shows on all of
 * them. The scan covers the whole page, tab bar and banner included; no node is left out.
 *
 * Text over a gradient (the dark header, the banners) is something axe cannot work out, so it
 * reports it as "incomplete", not as a violation; so is the label inside a chart ring, where the
 * drawing overlaps it. Those colors are held by the token tests (tests/unit/tokens.test.ts)
 * instead: each pair of a gradient's ends against its text, and the ink colors on the surfaces.
 */

const THEMES = ['light', 'dark'] as const;

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

/** Scans the page, and fails with every node that is too faint: where it is, its colors and its ratio. */
async function expectReadable(page: Page, where: string) {
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

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      // Read at load by the script in index.html, which sets <html data-theme>.
      await page.addInitScript((value) => localStorage.setItem('funancial.theme', value), theme);
    });

    /** Opens `path` in the running demo and waits for its page title. */
    async function visit(page: Page, path: string) {
      await startDemo(page);
      if (path !== '/') await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    }

    test('welcome', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Try with demo money' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectReadable(page, 'welcome');
    });

    for (const path of SCREENS) {
      test(`${path === '/' ? 'Home' : path}`, async ({ page }) => {
        await visit(page, path);
        await expectReadable(page, path);
      });
    }

    test('/help/available', async ({ page }) => {
      await visit(page, '/help/available');
      await expectReadable(page, '/help/available');
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
      await expectReadable(page, 'the first holding');
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
        await expectReadable(page, `the ${sheet} sheet`);
      });
    }

    test("Home's More menu, a page surface on the block, and Show on Home", async ({ page }) => {
      await visit(page, '/');
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await expect(page.getByRole('menu', { name: 'More' })).toBeVisible();
      await expectReadable(page, "Home's More menu");
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: /, change account$/ }).click();
      await expect(page.getByRole('dialog', { name: 'Show on Home' })).toBeVisible();
      await expectReadable(page, 'the Show on Home sheet');
    });

    test("the Net worth sheet from Profile's menu", async ({ page }) => {
      await visit(page, '/profile');
      await page
        .getByRole('main')
        .getByRole('button', { name: /^Net worth/ })
        .click();
      await expect(page.getByRole('dialog', { name: 'Net worth' })).toBeVisible();
      await expectReadable(page, 'the Net worth sheet');
    });
  });
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
