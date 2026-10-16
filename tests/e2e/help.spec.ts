import { expect, test } from '@playwright/test';
import { startFresh } from './helpers';

test('Help: search the index, open a page and read its worked example', async ({ page }) => {
  await startFresh(page, '/help');
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search help' }).fill('freeze');
  await expect(page.getByRole('link', { name: /^Dividends/ })).toBeHidden();
  await page.getByRole('link', { name: /^Salary and freezes/ }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Salary and freezes' })).toBeVisible();
  const steps = page.getByRole('list', { name: 'Steps' });
  await expect(steps.getByRole('listitem')).toHaveCount(4);
  await expect(page.getByLabel('Result')).toContainText('$2,709.68');

  await page.getByRole('link', { name: 'Back to Help' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
});

test('mobile: the Menu lists Help, no longer marked Soon, and opens it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'Menu' })
    .click();
  const row = page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: /^Help/ });
  await expect(row).not.toContainText('Soon');
  await row.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
});

test('desktop: the sidebar lists Help without Soon and opens it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page);
  const link = page
    .getByRole('navigation', { name: 'All sections' })
    .getByRole('link', { name: /^Help/ });
  await expect(link).not.toContainText('Soon');
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
});

test('Help: the buy-it page draws its zones from the meter', async ({ page }) => {
  await startFresh(page, '/help/buy-it');
  const zones = page.getByRole('list', { name: 'Meter zones' });
  await expect(zones.getByRole('listitem')).toHaveText([
    /Skip\s*0–33/,
    /Wait\s*34–66/,
    /Buy\s*67–100/,
  ]);
});
