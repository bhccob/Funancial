import { expect, type Page } from '@playwright/test';

/** First run → "Start with my real data" → Home. Each test gets a fresh browser context. */
export async function startFresh(page: Page, path = '/') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with my real data' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  if (path !== '/') await page.goto(path);
}

/** First run → "Try with demo money" → Home with the demo banner. */
export async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with demo money' }).click();
  await expect(page.getByText("You're using demo money.")).toBeVisible();
}
