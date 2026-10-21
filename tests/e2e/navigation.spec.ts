import { expect, test } from '@playwright/test';
import { startFresh } from './helpers';

test('mobile: the bottom bar and the Menu sheet navigate', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  const bar = page.getByRole('navigation', { name: 'Primary' });
  await expect(bar).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'All sections' })).toBeHidden();
  await expect(bar.locator('a, button')).toHaveText(['Home', 'Budget', 'Invest', 'Menu']);

  await bar.getByRole('link', { name: 'Budget' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();

  const menuButton = bar.getByRole('button', { name: 'Menu' });
  await menuButton.click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(menu).toBeHidden();
  // The screen chosen takes focus on its name, not the Menu button the sheet handed it back to.
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeFocused();
});

test('mobile: Escape closes the Menu sheet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  const menuButton = page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'Menu' });
  await menuButton.click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();
});

test('desktop: the sidebar navigates and the bottom bar is hidden', async ({ page }, testInfo) => {
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

test('mobile: the Menu has no Buy it?, no About you and no Salary freeze', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'Menu' })
    .click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('heading', { level: 3 })).toHaveText(['Your money', 'You']);
  await expect(menu.getByRole('link', { name: /^Buy it\?/ })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: /^About you/ })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: /^Salary freeze/ })).toHaveCount(0);
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

test('mobile: the Menu opens Goals and Debts as two pages', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  const menuButton = page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'Menu' });
  const menu = page.getByRole('dialog', { name: 'Menu' });

  await menuButton.click();
  await menu.getByRole('link', { name: /^Goals/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Goals' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add goal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add card' })).toHaveCount(0);

  await menuButton.click();
  await menu.getByRole('link', { name: /^Debts/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Debts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add card' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add loan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add goal' })).toHaveCount(0);
});

test('mobile: the Menu opens Income, and an income added there shows in its bars', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'Menu' })
    .click();
  const row = menu.getByRole('link', { name: /^Income/ });
  await expect(row).toContainText('$0.00 this month');
  await row.click();
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

test('desktop: Home links to Income stats, and the sidebar marks Income as current', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page);
  await page
    .getByRole('region', { name: 'Net worth' })
    .getByRole('link', { name: 'Income stats' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Income' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'All sections' }).getByRole('link', { name: /^Income/ }),
  ).toHaveAttribute('aria-current', 'page');
});
