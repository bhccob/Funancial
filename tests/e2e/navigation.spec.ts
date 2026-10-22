import { expect, test, type Page } from '@playwright/test';
import { openProfile, startFresh } from './helpers';

const bar = (page: Page) => page.getByRole('navigation', { name: 'Primary' });
const TABS = ['Home', 'Cards', 'Spending', 'Invest', 'Profile'];

test('mobile: the tab bar navigates, Profile last, and Profile opens from the avatar on Home too', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await expect(bar(page)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'All sections' })).toBeHidden();
  const slots = bar(page).locator('a, button');
  await expect(slots).toHaveCount(5);
  for (const [i, name] of TABS.entries()) {
    await expect(slots.nth(i)).toHaveAccessibleName(name);
  }
  // No ＋ in the bar.
  await expect(bar(page).getByRole('button')).toHaveCount(0);
  await expect(bar(page).getByRole('link', { name: 'Home' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await bar(page).getByRole('link', { name: 'Spending' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();
  await expect(bar(page).getByRole('link', { name: 'Spending' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(bar(page).locator('[aria-current]')).toHaveCount(1);

  await bar(page).getByRole('link', { name: 'Cards' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cards' })).toBeVisible();

  await bar(page).getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  await expect(bar(page).getByRole('link', { name: 'Profile' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const profile = await openProfile(page);
  await profile.getByRole('link', { name: /^Settings/ }).click();
  // The screen chosen takes focus on its name.
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeFocused();
});

test('mobile: the tab bar runs edge to edge along the bottom, 86px tall, the current tab in the accent', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page, '/budget');
  const box = (await bar(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  // No safe area in the browser: the bar is its 56px row of tabs over the least of 30px.
  expect(box).toEqual({ x: 0, y: viewport.height - 86, width: viewport.width, height: 86 });
  await expect(bar(page)).toHaveCSS('border-top-width', '1px');

  const current = bar(page).getByRole('link', { name: 'Spending' });
  const other = bar(page).getByRole('link', { name: 'Home' });
  await expect(current).toHaveCSS('font-weight', '800');
  await expect(other).toHaveCSS('font-weight', '700');
  const [accent, muted] = await page.evaluate(() => {
    const read = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const probe = document.createElement('span');
    document.body.append(probe);
    const resolve = (value: string) => {
      probe.style.color = value;
      return getComputedStyle(probe).color;
    };
    const colors = [resolve(read('--color-accent')), resolve(read('--color-text-muted'))];
    probe.remove();
    return colors;
  });
  await expect(current).toHaveCSS('color', accent!);
  await expect(other).toHaveCSS('color', muted!);
  // Every tab is a tap target well over 44px.
  for (const name of TABS) {
    const tab = (await bar(page).getByRole('link', { name }).boundingBox())!;
    expect(tab.height, name).toBeGreaterThanOrEqual(44);
    expect(tab.width, name).toBeGreaterThanOrEqual(44);
  }
});

test('mobile: at 360×640 every tab shows its whole name under its icon', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await page.setViewportSize({ width: 360, height: 640 });
  await startFresh(page, '/budget');
  for (const name of TABS) {
    const tab = bar(page).getByRole('link', { name });
    await expect(tab.getByText(name, { exact: true })).toBeVisible();
    const fits = await tab.evaluate((link) => {
      const text = link.querySelector('span')!;
      const icon = link.querySelector('svg')!.getBoundingClientRect();
      const inner = text.getBoundingClientRect();
      const outer = link.getBoundingClientRect();
      return {
        whole: text.scrollWidth <= text.clientWidth,
        inside: inner.left >= outer.left && inner.right <= outer.right,
        under: inner.top >= icon.bottom,
      };
    });
    expect(fits, name).toEqual({ whole: true, inside: true, under: true });
  }
});

test('mobile: a toast from a save sits above the tab bar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page, '/add');
  await page.getByLabel('Amount', { exact: true }).fill('4.20');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Expense saved.')).toBeVisible();

  const top = (await bar(page).boundingBox())!.y;
  const toasts = await page.locator('[aria-live] > [role]').all();
  expect(toasts.length).toBeGreaterThan(0);
  for (const shown of toasts) {
    const t = (await shown.boundingBox())!;
    expect(t.y + t.height, `"${await shown.textContent()}" ends above the bar`).toBeLessThanOrEqual(
      top,
    );
  }
});

test('mobile: the bottom of Settings clears the tab bar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page, '/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  for (const size of [
    { width: 375, height: 812 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = page.getByRole('main').getByRole('button').last();
    await expect(last).toBeInViewport();
    await expect
      .poll(async () => {
        const button = (await last.boundingBox())!;
        const top = (await bar(page).boundingBox())!.y;
        return button.y + button.height <= top;
      }, `the last button ends above the tab bar at ${size.width}×${size.height}`)
      .toBe(true);
  }
});

test('desktop: the sidebar navigates and the tab bar is hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page);
  const sidebar = page.getByRole('navigation', { name: 'All sections' });
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();

  await sidebar.getByRole('link', { name: 'Invest' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Invest' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Holdings' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('desktop: the sidebar lists the tabs, marks the one open, and opens Net worth as a sheet', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page);
  const sidebar = page.getByRole('navigation', { name: 'All sections' });
  for (const name of TABS) await expect(sidebar.getByRole('link', { name })).toBeVisible();

  await sidebar.getByRole('link', { name: 'Cards' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cards' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Cards' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await expect(sidebar.getByRole('button', { name: /^My numbers/ })).toBeDisabled();
  await sidebar.getByRole('button', { name: 'Net worth' }).click();
  const sheet = page.getByRole('dialog', { name: 'Net worth' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(sidebar.getByRole('button', { name: 'Net worth' })).toBeFocused();
});

test('unknown route shows not found with a way home', async ({ page }) => {
  await startFresh(page, '/nope');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go home' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
});

test('add is reachable from Home on mobile and opens Add Expense', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await page.getByRole('link', { name: 'Expense', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Expense' })).toBeChecked();
});

test('add is reachable from the sidebar on desktop and opens Add Expense', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page, '/goals');
  await page
    .getByRole('navigation', { name: 'All sections' })
    .getByRole('link', { name: 'Add expense' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Expense' })).toBeChecked();
});

test('mobile: Home has three actions, and History stays one tap away in Last 7 days', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await expect(page.getByRole('link', { name: 'Expense', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Income', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Goals', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buy it?' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'History' })).toHaveCount(1);
});

test("mobile: Profile's menu is History, Net worth and My numbers, then Quests to Settings", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  const menu = await openProfile(page);
  await expect(menu.getByRole('heading', { level: 2 })).toHaveText(['Your money', 'You']);
  for (const gone of [/^Bills & cards/, /^Goals/, /^Debts/, /^Income/, /^Buy it\?/, /^About you/]) {
    await expect(menu.getByRole('link', { name: gone })).toHaveCount(0);
  }
  await expect(menu.getByRole('link', { name: /^History/ })).toHaveAttribute('href', '/history');
  const myNumbers = menu.getByRole('button', { name: /^My numbers/ });
  await expect(myNumbers).toBeDisabled();
  await expect(myNumbers).toContainText('Soon');

  // Net worth opens its sheet over Profile.
  await menu.getByRole('button', { name: /^Net worth/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Net worth' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('What you have')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
});

test('desktop: the sidebar has no Buy it?, no About you and no Salary freeze', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page);
  const sidebar = page.getByRole('navigation', { name: 'All sections' });
  await expect(sidebar.getByRole('link', { name: /^Quests/ })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: /^Buy it\?/ })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: /^About you/ })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: /^Salary freeze/ })).toHaveCount(0);
});

test('Add Expense does not send you off to ask first', async ({ page }) => {
  await startFresh(page, '/add');
  await expect(page.getByRole('heading', { level: 1, name: 'Add' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ask first/ })).toHaveCount(0);
});

test('mobile: a new screen opens at its top, and Back returns to where the last was left', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page, '/help');
  const index = page.getByRole('heading', { level: 1, name: 'Help' });
  await expect(index).toBeVisible();

  // Low on a page taller than the phone, so a new screen's title would be out of view if the scroll stayed.
  const last = page.getByRole('main').getByRole('link').last();
  await last.scrollIntoViewIfNeeded();
  const left = await page.evaluate(() => window.scrollY);
  expect(left).toBeGreaterThan(0);

  await last.click();
  await expect(index).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeFocused();

  await page.goBack();
  await expect(index).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(left);
});

test('mobile: Goals and Debts are two pages', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page, '/goals');
  await expect(page.getByRole('heading', { level: 1, name: 'Goals' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add goal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add card' })).toHaveCount(0);

  await page.goto('/debts');
  await expect(page.getByRole('heading', { level: 1, name: 'Debts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add card' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add loan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add goal' })).toHaveCount(0);
});

test('mobile: Home opens Income, and an income added there shows in its bars', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await page
    .getByRole('region', { name: 'Net worth' })
    .getByRole('link', { name: 'Income stats' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Income' })).toBeVisible();
  await expect(page.getByText('No income yet')).toBeVisible();

  // The empty page offers to add some, and Save brings the person back to it.
  await page.getByRole('link', { name: 'Add income' }).click();
  await expect(page.getByRole('radio', { name: 'Income' })).toBeChecked();
  await page.getByLabel('Amount').fill('1250');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Income' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'This month' })).toContainText('$1,250.00');

  const chart = page.getByRole('region', { name: 'Last 12 months' });
  const bars = chart.getByRole('group', { name: 'Income per month' }).getByRole('button');
  await expect(bars).toHaveCount(12);
  await bars.last().click();
  await expect(chart.getByRole('status')).toContainText(
    'Salary $1,250.00 · Extra $0.00 · Dividends $0.00',
  );
  // Twelve bars and their captions fit a 375px phone without a sideways scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
