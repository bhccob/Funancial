import { expect, test } from '@playwright/test';
import { onboard, startFresh } from './helpers';

test('set PIN → reload → locked → wrong → right → unlocked', async ({ page }) => {
  await startFresh(page, '/settings');
  // A plain click: the radio only becomes checked once the dialog saves the PIN.
  await page.getByRole('radio', { name: 'PIN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set a PIN' });
  await dialog.getByLabel('New PIN').fill('2468');
  await dialog.getByLabel('Confirm PIN').fill('2468');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('radio', { name: 'PIN' })).toBeChecked();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('PIN').fill('1357');
  await page.getByLabel('PIN').press('Enter');
  await expect(page.getByRole('alert')).toHaveText("That didn't match. Try again.");

  await page.getByLabel('PIN').fill('2468');
  await page.getByLabel('PIN').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
});

test('a forgotten PIN points to the account, not to a backup', async ({ page }) => {
  await startFresh(page, '/settings');
  await page.getByRole('radio', { name: 'PIN' }).click();
  const set = page.getByRole('dialog', { name: 'Set a PIN' });
  await set.getByLabel('New PIN').fill('2468');
  await set.getByLabel('Confirm PIN').fill('2468');
  await set.getByRole('button', { name: 'Save' }).click();
  await expect(set).toBeHidden();

  await page.reload();
  await page.getByRole('button', { name: 'Forgot your PIN?' }).click();
  const erase = page.getByRole('dialog', { name: 'Erase this device and start over?' });
  await expect(erase).toContainText(
    "Without your PIN, the data on this device can't be recovered. If you have an account, log in after starting over to get your data back.",
  );
  await expect(erase).not.toContainText(/backup/i);
});

test('Settings, Data offers Delete all data and nothing to back up, restore or export', async ({
  page,
}) => {
  await startFresh(page, '/settings');
  const data = page.getByRole('region', { name: 'Data' });
  await expect(data.getByRole('button', { name: 'Delete all data' })).toBeVisible();
  await expect(data.getByRole('button')).toHaveCount(1);
  await expect(data.getByText(/backup|restore|export/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /backup|export|restore/i })).toHaveCount(0);
});

test('a second tab reloads when data is deleted in the first', async ({ context }) => {
  const a = await context.newPage();
  await startFresh(a, '/settings');
  const b = await context.newPage();
  await b.goto('/');
  await expect(b.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();

  await a.getByRole('button', { name: 'Delete all data' }).click();
  const dialog = a.getByRole('dialog', { name: 'Delete all data?' });
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await dialog.getByRole('button', { name: 'Delete everything' }).click();

  await expect(a.getByRole('button', { name: 'Try with demo money' })).toBeVisible();
  await expect(b.getByRole('button', { name: 'Try with demo money' })).toBeVisible();
});

test('two tabs on the welcome screen: starting in one moves the other along', async ({
  context,
}) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto('/');
  await b.goto('/');
  await expect(b.getByRole('button', { name: 'Create an account' })).toBeVisible();

  await a.getByRole('button', { name: 'Create an account' }).click();
  await expect(a.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  await expect(b.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();

  // Finishing onboarding in one tab takes the other to Home too.
  await onboard(a);
  await expect(b.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
});
