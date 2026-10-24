import { expect, test } from '@playwright/test';
import { onboard, startFresh, startLocked, strayInks } from './helpers';

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

test('the lock screen stands its pad on the theme block: 44px keys, all on screen, and the page ink back in its dialog', async ({
  page,
}) => {
  await startLocked(page);
  const block = page.locator('[data-head-block]');
  await expect(block.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
  const viewport = page.viewportSize()!;
  const blockBox = (await block.boundingBox())!;
  expect(Math.round(blockBox.width), 'the block is as wide as the screen').toBe(viewport.width);
  expect(Math.round(blockBox.y), 'the block starts at the top edge').toBe(0);
  // The block's own room: 20px at the sides (`reach="screen"`) and 22px under (`compact`), whatever
  // order the stylesheet puts its classes in.
  const room = await block.evaluate((el) => {
    const style = getComputedStyle(el);
    return [style.marginLeft, style.paddingLeft, style.paddingRight, style.paddingBottom];
  });
  expect(room, 'margin-left, padding-left, padding-right, padding-bottom of the block').toEqual([
    '0px',
    '20px',
    '20px',
    '22px',
  ]);

  const keys = [...'0123456789', 'Delete', 'Unlock'];
  for (const name of keys) {
    const key = block.getByRole('button', { name, exact: true });
    const box = (await key.boundingBox())!;
    expect(box.width, `${name} is 44px wide`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${name} is 44px tall`).toBeGreaterThanOrEqual(44);
    expect(box.x, `${name} is on the screen`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${name} is on the screen`).toBeLessThanOrEqual(viewport.width);
  }
  const forgot = block.getByRole('button', { name: 'Forgot your PIN?' });
  expect((await forgot.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    'no sideways scroll',
  ).toBe(true);

  // The keys type into the real field, and the unlock key opens the app.
  for (const digit of '2468') await block.getByRole('button', { name: digit, exact: true }).click();
  await expect(page.getByLabel('PIN')).toHaveValue('2468');
  await expect(block.getByRole('button', { name: 'Unlock' })).toBeEnabled();

  // A wrong PIN, which says so on the block. Then every word and mark on the block is drawn in the
  // block's own inks (axe cannot judge text over its gradient; the unit tests hold these inks).
  await page.getByLabel('PIN').fill('1357');
  await page.getByLabel('PIN').press('Enter');
  await expect(block.getByRole('alert')).toHaveText("That didn't match. Try again.");
  expect(
    await strayInks(block),
    'text and marks on the block in a colour that is not its ink',
  ).toEqual([]);

  // The Erase dialog is off the block, so its words are the page's ink and not the block's white.
  await forgot.click();
  const dialog = page.getByRole('dialog', { name: 'Erase this device and start over?' });
  await expect(dialog).toBeVisible();
  const [r, g, b] = await dialog
    .getByRole('heading', { level: 2 })
    .evaluate((h) => getComputedStyle(h).color.match(/\d+/g)!.slice(0, 3).map(Number));
  expect(r! + g! + b!, "the dialog's title is dark on its light sheet").toBeLessThan(300);
  await expect(dialog.getByLabel('Type DELETE to confirm')).toHaveClass(/text-right/);
});

test('a Settings list has no hairline under its last row, and a form keeps the line under its last field', async ({
  page,
}) => {
  await startFresh(page, '/settings');
  /** The width of the line under the row a field stands in (the `row` look draws it as the row's bottom border). */
  const lineUnder = (field: ReturnType<typeof page.getByLabel>) =>
    field
      .locator('xpath=ancestor::div[contains(@class, "border-b")][1]')
      .evaluate((row) => getComputedStyle(row).borderBottomWidth);

  // Profile & salary: Name has the list's line under it, and Pay day closes the list, which has none.
  const profile = page.getByRole('region', { name: 'Profile & salary' });
  expect(await lineUnder(profile.getByLabel('Name'))).toBe('1px');
  expect(await lineUnder(profile.getByLabel('Pay day'))).toBe('0px');

  // A form's rows are not a list: its last field keeps the line that closes the form.
  await page.goto('/add');
  expect(await lineUnder(page.getByLabel('Repeats'))).toBe('1px');

  // Security: with a PIN, Auto-lock is the last row (there is no fingerprint switch in a browser).
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'PIN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set a PIN' });
  await dialog.getByLabel('New PIN').fill('2468');
  await dialog.getByLabel('Confirm PIN').fill('2468');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  const autoLock = page.getByRole('region', { name: 'Security' }).getByLabel('Auto-lock');
  await expect(autoLock).toBeVisible();
  expect(await lineUnder(autoLock)).toBe('0px');
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
