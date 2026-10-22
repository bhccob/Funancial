import { expect, test } from '@playwright/test';
import { onboard, skipAccount } from './helpers';

test('a new user sets up money, salary and a PIN, then lands on Home', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  await onboard(page, {
    cash: '1,000',
    savings: '5000',
    salary: { amount: '4200', payDay: '25' },
    pin: '2468',
  });
  // The bank account (1,000) is what is available; the savings (5,000) are shown apart, in Net
  // worth. No bills or limits yet.
  await expect(page.getByRole('region', { name: 'Available to spend' })).toContainText('$1,000.00');
  const netWorth = page.getByRole('region', { name: 'Net worth' });
  await expect(netWorth).toContainText('$6,000.00');
  await expect(netWorth).toContainText('Bank & cash $1,000');
  await expect(netWorth).toContainText('Savings $5,000');

  // The PIN chosen during onboarding is in force from the next start.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('PIN').fill('2468');
  await page.getByLabel('PIN').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
});

test('Back on the first step returns to Welcome, where the demo can still be tried', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Create an account' })).toBeVisible();

  // The empty data the tap made is gone, so a reload stays on Welcome rather than in setup.
  await page.reload();
  await page.getByRole('button', { name: 'Try with demo money' }).click();
  await expect(page.getByText("You're exploring with demo money")).toBeVisible();
});

test.describe('in the Netherlands', () => {
  // The time zone is the location signal, even on an English (US) phone.
  test.use({ timezoneId: 'Europe/Amsterdam' });

  test("setup starts on the phone's currency, and the person can pick another", async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await skipAccount(page);
    await expect(page.getByLabel('Currency')).toHaveValue('EUR');
    await page.getByLabel('Currency').selectOption('GBP');
    await expect(page.getByLabel('Currency')).toHaveValue('GBP');
  });
});

test('onboarding survives a reload part-way through', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await skipAccount(page);
  await expect(page.getByText('Step 2 of 6')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
});
