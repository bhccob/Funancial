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

test('demo money: Available counts the bank account and the cash wallet, Net worth lists every account', async ({
  page,
}) => {
  await startDemo(page);

  await page.getByRole('button', { name: 'Available to spend: see and correct' }).click();
  const available = page.getByRole('dialog', { name: 'Available to spend' });
  await expect(available.getByRole('listitem').filter({ hasText: 'Main account' })).toHaveCount(1);
  await expect(available.getByRole('listitem').filter({ hasText: 'Cash wallet' })).toHaveCount(1);
  // Savings, the passive income account and the card are not spent from, so they are not here.
  for (const apart of ['Savings', 'Passive income', 'Demo Visa']) {
    await expect(available.getByRole('listitem').filter({ hasText: apart })).toHaveCount(0);
  }
  await page.keyboard.press('Escape');
  await expect(available).toBeHidden();

  await page.getByRole('button', { name: 'Net worth: see and correct' }).click();
  const worth = page.getByRole('dialog', { name: 'Net worth' });
  for (const held of ['Savings', 'Passive income', 'Main account', 'Cash wallet']) {
    await expect(worth.getByRole('listitem').filter({ hasText: held })).toHaveCount(1);
  }
  // What the card owes is under "What you owe", with its own editor.
  const visa = worth.getByRole('listitem').filter({ hasText: 'Demo Visa' });
  await expect(visa).toHaveCount(1);
  await expect(visa.getByRole('button', { name: 'Edit Demo Visa' })).toBeVisible();
});
