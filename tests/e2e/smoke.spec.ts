import { expect, test } from '@playwright/test';

test('app loads with title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Funancial');
});
