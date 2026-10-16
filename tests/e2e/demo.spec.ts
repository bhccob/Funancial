import { expect, test } from '@playwright/test';
import { startDemo } from './helpers';

test('try demo → banner → leave demo → welcome', async ({ page }) => {
  await startDemo(page);
  await page.getByRole('button', { name: 'Start for real' }).click();
  const dialog = page.getByRole('dialog', { name: 'Leave demo?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Leave demo' }).click();
  await expect(page.getByRole('button', { name: 'Try with demo money' })).toBeVisible();
});

test('demo data shows up in the data summary', async ({ page }) => {
  await startDemo(page);
  await page.goto('/settings');
  await expect(page.getByText(/\d+ expenses · 4 subscriptions · 3 limits/)).toBeVisible();
});
