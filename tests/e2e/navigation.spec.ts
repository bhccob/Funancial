import { expect, test } from '@playwright/test';
import { startFresh } from './helpers';

test('mobile: bottom tabs and the More sheet navigate', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  const tabs = page.getByRole('navigation', { name: 'Primary' });
  await expect(tabs).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'All sections' })).toBeHidden();

  await tabs.getByRole('link', { name: 'Budget' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();

  await tabs.getByRole('button', { name: 'More' }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'More' })).toBeHidden();
});

test('desktop: the sidebar navigates and bottom tabs are hidden', async ({ page }, testInfo) => {
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

test('quick add is reachable and opens Add Expense', async ({ page }) => {
  await startFresh(page, '/goals');
  await page.getByRole('link', { name: 'Quick add' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Expense' })).toBeChecked();
});
