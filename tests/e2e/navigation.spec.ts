import { expect, test } from '@playwright/test';
import { startFresh } from './helpers';

test('mobile: the bottom bar and the Menu sheet navigate', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  const bar = page.getByRole('navigation', { name: 'Primary' });
  await expect(bar).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'All sections' })).toBeHidden();

  await bar.getByRole('link', { name: 'Budget' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();

  await bar.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(menu).toBeHidden();
});

test('mobile: Escape closes the Menu sheet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'Menu' })
    .click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('desktop: the sidebar navigates and the bottom bar is hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page);
  const sidebar = page.getByRole('navigation', { name: 'All sections' });
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();

  await sidebar.getByRole('link', { name: 'Dividends' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dividends' })).toBeVisible();
});

test('unknown route shows not found with a way home', async ({ page }) => {
  await startFresh(page, '/nope');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go home' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
});

test('add is reachable from the bar on mobile and opens Add Expense', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page, '/goals');
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Add expense' })
    .click();
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
