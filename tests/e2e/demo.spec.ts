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

  // Available to spend is the Cards tab's pill; Net worth is Home's tile.
  await page.goto('/cards');
  await page.getByRole('button', { name: /^Available to spend/ }).click();
  const available = page.getByRole('dialog', { name: 'Available to spend' });
  await expect(available.getByRole('listitem').filter({ hasText: 'Main account' })).toHaveCount(1);
  await expect(available.getByRole('listitem').filter({ hasText: 'Cash wallet' })).toHaveCount(1);
  // Savings, the passive income account and the card are not spent from, so they are not here.
  for (const apart of ['Savings', 'Passive income', 'Demo Visa']) {
    await expect(available.getByRole('listitem').filter({ hasText: apart })).toHaveCount(0);
  }
  await page.keyboard.press('Escape');
  await expect(available).toBeHidden();

  await page.goto('/');
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

test('Home shows the card picked on the Cards tab, and Show on Home picks it for both', async ({
  page,
}) => {
  await startDemo(page);
  const hero = (label: string) => page.getByRole('region', { name: label });
  const cards = page.getByRole('group', { name: 'Your cards' });
  // Nothing picked yet: the default account.
  await expect(hero('Available balance')).toContainText('Main account');

  await page.goto('/cards');
  await cards.getByRole('button', { name: /^Demo Visa/ }).click();
  await expect(cards.getByRole('button', { name: /^Demo Visa/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto('/');
  // A card with a limit shows what is left to spend on it.
  await expect(hero('Available credit')).toContainText('Demo Visa');

  await hero('Available credit')
    .getByRole('button', { name: /, change account$/ })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Show on Home' });
  await expect(sheet.getByRole('button', { pressed: true })).toContainText('Demo Visa');
  await sheet.getByRole('button', { name: /^Savings/ }).click();
  await expect(sheet).toBeHidden();
  await expect(hero('Available balance')).toContainText('Savings');

  await page.goto('/cards');
  await expect(cards.getByRole('button', { name: /^Savings/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
