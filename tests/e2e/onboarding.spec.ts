import { expect, test } from '@playwright/test';
import { onboard } from './helpers';

test('a new user sets up money, salary and a PIN, then lands on Home', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with my real data' }).click();
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  await onboard(page, {
    cash: '1,000',
    savings: '5000',
    salary: { amount: '4200', payDay: '25' },
    pin: '2468',
  });
  // Cash 1,000 + savings 5,000; no bills or limits yet.
  await expect(page.getByRole('region', { name: 'Available to spend' })).toContainText('$6,000.00');

  // The PIN chosen during onboarding is in force from the next start.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('PIN').fill('2468');
  await page.getByLabel('PIN').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
});

test('onboarding survives a reload part-way through', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with my real data' }).click();
  await page.getByRole('checkbox', { name: 'I understand' }).check();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Before we start' })).toBeVisible();
});
