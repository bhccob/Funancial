import { expect, test } from '@playwright/test';
import { startDemo } from './helpers';

// No add-expense screen exists yet, so the demo data is the backup's payload.
test('backup → leave demo → restore round-trip', async ({ page }) => {
  await startDemo(page);
  await page.goto('/settings');
  const summary = page.getByText(/\d+ expenses/);
  const demoSummary = await summary.textContent();

  await page.getByRole('button', { name: 'Create encrypted backup' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create encrypted backup' });
  await dialog.getByLabel('Backup passphrase').fill('correct horse');
  await dialog.getByLabel('Confirm passphrase').fill('correct horse');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Create backup' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^funancial-backup-\d{4}-\d{2}-\d{2}\.funbak$/);
  const file = await download.path();

  await page.getByRole('button', { name: 'Start with my real data' }).first().click();
  await page
    .getByRole('dialog', { name: 'Leave demo?' })
    .getByRole('button', { name: 'Leave demo' })
    .click();
  await expect(page.getByRole('button', { name: 'Try with demo money' })).toBeVisible();
  await page.getByRole('button', { name: 'Start with my real data' }).click();
  await page.goto('/settings');
  await expect(page.getByText('No entries yet.')).toBeVisible();

  const restore = async (passphrase: string) => {
    await page.getByLabel('Backup file').setInputFiles(file);
    await page.getByLabel('Passphrase for this backup').fill(passphrase);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Restore this backup?' })
      .getByRole('button', { name: 'Restore' })
      .click();
  };

  await restore('wrong pass!');
  await expect(page.getByRole('alert')).toHaveText("That didn't match. Try again.");
  await expect(page.getByText('No entries yet.')).toBeVisible();

  await restore('correct horse');
  await expect(page.getByText('Backup restored.')).toBeVisible();
  await expect(page.getByText(demoSummary!)).toBeVisible();
});
