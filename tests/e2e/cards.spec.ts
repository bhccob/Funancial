import { expect, test, type Page } from '@playwright/test';
import { onboard, startDemo } from './helpers';

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'the Cards tab on a phone');
});

const cards = (page: Page) => page.getByRole('group', { name: 'Your cards' });
const actions = (page: Page) => page.getByRole('group', { name: 'Card actions' });

/** Setup with 1,000.00 in the bank account, then the Cards tab from the tab bar. */
async function openCards(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await onboard(page, { cash: '1000' });
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Cards' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cards' })).toBeVisible();
}

test('mobile: Cards pays 12.50 with Main account, then freezes it, and a frozen card cannot pay', async ({
  page,
}) => {
  await openCards(page);
  const main = cards(page).getByRole('button', { name: /^Main account,/ });
  await expect(main).toHaveAttribute('aria-pressed', 'true');
  await expect(main).toHaveAttribute('aria-label', 'Main account, debit, $1,000.00');

  await actions(page).getByRole('button', { name: 'Pay', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Pay with Main account' });
  await sheet.getByLabel('Amount').fill('12.50');
  await sheet.getByRole('radio', { name: 'Transport' }).check();
  await sheet.getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(sheet.getByText('Paid', { exact: true })).toBeVisible();
  await expect(sheet.getByText('$12.50 for Transport with Main account.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
  // The card counts down to its new balance.
  await expect(main).toHaveAttribute('aria-label', 'Main account, debit, $987.50');
  await expect(main).toContainText('$987.50');

  await actions(page).getByRole('button', { name: 'Freeze' }).click();
  await expect(page.getByText('Main account frozen.')).toBeVisible();
  await expect(main).toHaveAttribute('aria-label', 'Main account, debit, $987.50, frozen');
  await expect(main.getByTestId('frost')).toHaveCSS('opacity', '1');
  await expect(actions(page).getByRole('button', { name: 'Unfreeze to pay' })).toBeDisabled();

  // The expense form does not offer the frozen account either.
  await page.goto('/add');
  await expect(
    page.getByLabel('Paid with').locator('option', { hasText: 'Main account' }),
  ).toHaveCount(0);

  await page.goto('/cards');
  await actions(page).getByRole('button', { name: 'Unfreeze', exact: true }).click();
  await expect(actions(page).getByRole('button', { name: 'Pay', exact: true })).toBeEnabled();
  await expect(main.getByTestId('frost')).toHaveCSS('opacity', '0');
});

test('mobile: tapping a card selects it and centres it, and it is still selected after a reload', async ({
  page,
}) => {
  await startDemo(page);
  await page.goto('/cards');
  const savings = cards(page).getByRole('button', { name: /^Savings,/ });
  await savings.click();
  await expect(savings).toHaveAttribute('aria-pressed', 'true');
  // It glides to the middle of the row.
  await expect
    .poll(async () => {
      const box = await savings.boundingBox();
      return box ? Math.round(box.x + box.width / 2) : 0;
    })
    .toBeGreaterThan(375 / 2 - 4);
  const centre = await savings.boundingBox();
  expect(Math.abs(centre!.x + centre!.width / 2 - 375 / 2)).toBeLessThan(4);

  await page.reload();
  await expect(cards(page).getByRole('button', { name: /^Savings,/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(cards(page).getByRole('button', { name: /^Savings,/ })).toBeInViewport();
});

test('mobile: sliding the cards selects the one that comes to rest in the middle', async ({
  page,
}) => {
  await startDemo(page);
  await page.goto('/cards');
  const visa = cards(page).getByRole('button', { name: /^Demo Visa,/ });
  await expect(cards(page).getByRole('button', { name: /^Main account,/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const row = await cards(page).boundingBox();
  await page.mouse.move(row!.x + row!.width / 2, row!.y + row!.height / 2);
  // One card's width and gap to the right.
  await page.mouse.wheel(282, 0);
  await expect(visa).toHaveAttribute('aria-pressed', 'true');
  // The chart now follows the Visa.
  await expect(page.getByRole('region', { name: 'Spending' })).toBeVisible();
});

test('mobile: Bills and Loans lead to their pages', async ({ page }) => {
  await startDemo(page);
  await page.goto('/cards');
  await page
    .getByRole('region', { name: 'Bills' })
    .getByRole('link', { name: /View all/ })
    .click();
  await expect(page).toHaveURL(/\/subscriptions$/);
  await page.goBack();
  await page
    .getByRole('region', { name: 'Loans' })
    .getByRole('link', { name: /View all/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Debts' })).toBeVisible();
});

test('mobile: with reduced motion the frost only fades in, and the balance jumps to its new value', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCards(page);
  const main = cards(page).getByRole('button', { name: /^Main account,/ });
  const frost = main.getByTestId('frost');
  // No growing in: the frost is at its own size before and after, and only its opacity moves.
  await expect(frost).toHaveCSS('scale', '1');
  await expect(frost).toHaveCSS('transition-property', 'opacity');

  await actions(page).getByRole('button', { name: 'Pay', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Pay with Main account' });
  await sheet.getByLabel('Amount').fill('100');
  await sheet.getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(sheet.getByText('Paid', { exact: true })).toBeVisible();
  // No counting: read once, the moment it is paid, the card already shows the new balance.
  expect(await main.textContent()).toContain('$900.00');
  await sheet.getByRole('button', { name: 'Done' }).click();

  await actions(page).getByRole('button', { name: 'Freeze' }).click();
  await expect(frost).toHaveCSS('opacity', '1');
  await expect(frost).toHaveCSS('scale', '1');
});
