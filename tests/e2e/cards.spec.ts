import { expect, test, type Page } from '@playwright/test';
import { onboard, setStartingBalance, startDemo } from './helpers';

// The "mobile:" cases run on the phone, the "wide:" ones on the desktop project, where the sidebar is.
test.beforeEach(() => {
  const { title, project } = test.info();
  const wide = title.startsWith('wide:');
  test.skip(
    project.name !== (wide ? 'desktop-chromium' : 'mobile-chromium'),
    wide ? 'the Cards tab on a wide screen' : 'the Cards tab on a phone',
  );
});

const cards = (page: Page) => page.getByRole('group', { name: 'Your cards' });
const actions = (page: Page) => page.getByRole('group', { name: 'Card actions' });

/** How far, in px, a card's middle is from the middle of the row it scrolls in. */
async function offCentre(page: Page, name: string): Promise<number> {
  const row = await cards(page).boundingBox();
  const card = await cards(page)
    .getByRole('button', { name: new RegExp(`^${name},`) })
    .boundingBox();
  if (!row || !card) return Infinity;
  return Math.abs(card.x + card.width / 2 - (row.x + row.width / 2));
}

/** Setup with 1,000.00 in the bank account, then the Cards tab from the tab bar. */
async function openCards(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await onboard(page);
  await setStartingBalance(page, '1000');
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
  // The done step: what was paid, the category (no shop here), the card, and no balance line.
  await expect(sheet.getByText('Paid $12.50', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Transport', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Paid with Main account', { exact: true })).toBeVisible();
  await expect(sheet).not.toContainText('left');
  // The badge waits for Done: it is not on the card behind the sheet.
  await expect(main.getByText('−$12.50 just now')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
  // Then the card says what came off it, sliding in, and takes it back after a few seconds.
  const justNow = main.getByText('−$12.50 just now');
  await expect(justNow).toBeVisible();
  await expect(justNow).toHaveCSS('animation-name', 'just-now');
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

for (const width of [375, 360]) {
  test(`mobile: at ${width}px a card is 300 by 186, the next one shows beside it, and the row snaps card by card`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 });
    await startDemo(page);
    await page.goto('/cards');
    const main = cards(page).getByRole('button', { name: /^Main account,/ });
    const visa = cards(page).getByRole('button', { name: /^Demo Visa,/ });
    const box = await main.boundingBox();
    expect(Math.round(box!.width)).toBe(300);
    expect(Math.round(box!.height)).toBe(186);
    // The whole first card fits, and the second shows beside it, cut off by the screen's edge.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const next = await visa.boundingBox();
    expect(next!.x).toBeLessThan(width);
    expect(next!.x + next!.width).toBeGreaterThan(width);

    const row = await cards(page).boundingBox();
    await page.mouse.move(row!.x + row!.width / 2, row!.y + row!.height / 2);
    await page.mouse.wheel(312, 0);
    await expect(visa).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => {
        const moved = await visa.boundingBox();
        return moved ? Math.abs(moved.x + moved.width / 2 - width / 2) : Infinity;
      })
      .toBeLessThan(4);
  });
}

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
  await page.mouse.wheel(312, 0);
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
  await expect(sheet.getByText('Paid $100.00', { exact: true })).toBeVisible();
  // No counting: read once, the moment it is paid, the card already shows the new balance.
  expect(await main.textContent()).toContain('$900.00');
  await sheet.getByRole('button', { name: 'Done' }).click();
  // The badge only fades: it does not slide in or out.
  await expect(main.getByText('−$100.00 just now')).toHaveCSS('animation-name', 'just-now-fade');

  await actions(page).getByRole('button', { name: 'Freeze' }).click();
  await expect(frost).toHaveCSS('opacity', '1');
  await expect(frost).toHaveCSS('scale', '1');
});

for (const width of [1280, 820]) {
  test(`wide: at ${width}px a tapped card glides to the middle of the row, the end ones too`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await startDemo(page);
    await page.goto('/cards');
    for (const name of ['Demo Visa', 'Savings', 'Passive income', 'Main account', 'Cash wallet']) {
      const card = cards(page).getByRole('button', { name: new RegExp(`^${name},`) });
      await card.click();
      await expect(card).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => offCentre(page, name), { message: name }).toBeLessThan(4);
    }
    // The row opens on it again, in the middle.
    await page.reload();
    await expect(cards(page).getByRole('button', { name: /^Cash wallet,/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(() => offCentre(page, 'Cash wallet')).toBeLessThan(4);
  });
}

test('wide: with reduced motion the row opens with the selected card in the middle', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startDemo(page);
  await page.goto('/cards');
  await cards(page)
    .getByRole('button', { name: /^Savings,/ })
    .click();
  await expect.poll(() => offCentre(page, 'Savings')).toBeLessThan(4);
  await page.reload();
  await expect(cards(page).getByRole('button', { name: /^Savings,/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => offCentre(page, 'Savings')).toBeLessThan(4);
});
