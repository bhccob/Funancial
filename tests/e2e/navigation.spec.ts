import { expect, test } from '@playwright/test';
import { startFresh } from './helpers';

test('mobile: the bottom bar and the Menu sheet navigate', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  const bar = page.getByRole('navigation', { name: 'Primary' });
  await expect(bar).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'All sections' })).toBeHidden();
  await expect(bar.locator('a, button')).toHaveText(['Home', 'Budget', 'Invest', 'Menu']);

  await bar.getByRole('link', { name: 'Budget' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();

  const menuButton = bar.getByRole('button', { name: 'Menu' });
  await menuButton.click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(menu).toBeHidden();
  // The screen chosen takes focus on its name, not the Menu button the sheet handed it back to.
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeFocused();
});

test('mobile: Escape closes the Menu sheet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  const menuButton = page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'Menu' });
  await menuButton.click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();
});

test('desktop: the sidebar navigates and the bottom bar is hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page);
  const sidebar = page.getByRole('navigation', { name: 'All sections' });
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();

  await sidebar.getByRole('link', { name: 'Invest' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Invest' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Holdings' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('unknown route shows not found with a way home', async ({ page }) => {
  await startFresh(page, '/nope');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go home' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
});

test('add is reachable from Home on mobile and opens Add Expense', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await page.getByRole('link', { name: 'Expense', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Expense' })).toBeChecked();
});

test('add is reachable from the sidebar on desktop and opens Add Expense', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page, '/goals');
  await page
    .getByRole('navigation', { name: 'All sections' })
    .getByRole('link', { name: 'Add expense' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Expense' })).toBeChecked();
});

test('mobile: Home has a Buy it? action in History’s place, and it opens the Ask form', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  // History stays one tap away in Last 7 days.
  await expect(page.getByRole('link', { name: 'History' })).toHaveCount(1);
  await page.getByRole('link', { name: 'Buy it?' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Should I buy it?' })).toBeVisible();
  await expect(page.getByText('Your numbers stay with your data, encrypted.')).toBeVisible();
});

test('mobile: the Menu lists Buy it? under Your money, no longer marked Soon', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'Menu' })
    .click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('heading', { level: 3 })).toHaveText(['Your money', 'You']);
  const row = menu.getByRole('link', { name: /^Buy it\?/ });
  await expect(row).not.toContainText('Soon');
  await row.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Should I buy it?' })).toBeVisible();
});

test('desktop: the sidebar lists Buy it? without Soon and opens the Ask form', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page);
  const link = page
    .getByRole('navigation', { name: 'All sections' })
    .getByRole('link', { name: /^Buy it\?/ });
  await expect(link).not.toContainText('Soon');
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Should I buy it?' })).toBeVisible();
});

test('Add Expense says to ask first, and asking works with no link', async ({ page }) => {
  await startFresh(page, '/add');
  await page.getByRole('link', { name: "Haven't bought it yet? Ask first →" }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Should I buy it?' })).toBeVisible();

  await page.getByLabel('What is it?').fill('Noise-cancelling headphones');
  await page.getByLabel('Price', { exact: true }).fill('249');
  await page.getByRole('button', { name: 'Ask' }).click();

  // The answer comes from the phone alone: a meter, a verdict, the facts and the disclaimer.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Noise-cancelling headphones' }),
  ).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Buy meter' })).toBeVisible();
  await expect(page.getByText(/^· confidence (low|medium|high)$/)).toBeVisible();
  await expect(page.getByText('Available after')).toBeVisible();
  await expect(page.getByText('Not financial advice')).toBeVisible();

  // "I bought it" opens Add Expense with the item, its price and its category filled in.
  await page.getByRole('button', { name: 'I bought it' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add' })).toBeVisible();
  await expect(page.getByLabel('Amount')).toHaveValue('249.00');
  await expect(page.getByRole('radio', { name: 'Shopping', exact: true })).toBeChecked();
  await expect(page.getByLabel('Note')).toHaveValue('Noise-cancelling headphones');

  // Back on the answer, what was bought can be rated.
  await page.goBack();
  await expect(page.getByText(/^Bought /)).toBeVisible();
  await page.getByRole('radio', { name: '4' }).click();
  await expect(page.getByRole('radio', { name: '4' })).toBeChecked();
});

test('mobile: a new screen opens at its top, and Back returns to where the last was left', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page, '/help');
  const index = page.getByRole('heading', { level: 1, name: 'Help' });
  await expect(index).toBeVisible();

  // Low on a page taller than the phone, so a new screen's title would be out of view if the scroll stayed.
  const last = page.getByRole('main').getByRole('link').last();
  await last.scrollIntoViewIfNeeded();
  const left = await page.evaluate(() => window.scrollY);
  expect(left).toBeGreaterThan(0);

  await last.click();
  await expect(index).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeFocused();

  await page.goBack();
  await expect(index).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(left);
});
