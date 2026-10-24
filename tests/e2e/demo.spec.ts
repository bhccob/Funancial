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

// The room Home's Recent rows leave their words, at the two phone widths in use: with a long card name
// and its last 4 digits, the line under a title needs two lines, and no more, to say all of it.
for (const [width, room] of [
  [360, 150],
  [375, 165],
] as const) {
  test(`mobile: at ${width}px Home's Recent rows say the card's name and last 4 in two lines, uncut`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
    await page.setViewportSize({ width, height: 780 });
    await startDemo(page);
    // Main account is the card the demo's rows are on: a long name and its last 4 digits.
    await page.goto('/cards');
    await page
      .getByRole('group', { name: 'Card actions' })
      .getByRole('button', { name: 'Settings' })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Everyday checking');
    await dialog.getByLabel('Last 4 digits').fill('4312');
    await dialog.getByRole('button', { name: /^Save/ }).click();
    await expect(dialog).toBeHidden();

    await page.goto('/');
    const rows = page
      .getByRole('region', { name: 'Recent transactions' })
      .locator('li[data-entry]');
    await expect(rows).toHaveCount(5);
    await expect(rows.filter({ hasText: 'Everyday checking ·· 4312' }).first()).toBeVisible();
    const measured = await rows.evaluateAll((els) =>
      els.map((li) => {
        const words = li.querySelector('b')!.closest('span.min-w-0.flex-1')!;
        const line = words.querySelector<HTMLElement>('.line-clamp-2')!;
        const button = li.querySelector('button')!;
        return {
          title: li.querySelector('b')!.textContent,
          words: words.getBoundingClientRect().width,
          // The line under the title is whole when what it holds fits what it shows.
          cut: line.scrollHeight > line.clientHeight + 1,
          lines: Math.round(
            line.getBoundingClientRect().height / parseFloat(getComputedStyle(line).lineHeight),
          ),
          row: li.getBoundingClientRect().height,
          // The chevron is the last thing in the row's button: a sign, not a target.
          chevron: button.lastElementChild!.getBoundingClientRect().width,
          scrolls: document.documentElement.scrollWidth,
        };
      }),
    );
    for (const row of measured) {
      expect(row.words, `${row.title}: the room for its words`).toBeGreaterThanOrEqual(room);
      expect(row.cut, `${row.title}: its second line is cut`).toBe(false);
      expect(row.lines, `${row.title}: lines`).toBeLessThanOrEqual(2);
      expect(row.row, `${row.title}: the row is a tap target tall`).toBeGreaterThanOrEqual(44);
      expect(row.chevron, `${row.title}: the chevron's box`).toBe(16);
      expect(row.scrolls, 'the page does not scroll sideways').toBeLessThanOrEqual(width);
    }
    // The newest row says what is left on its card in whole units, with no cents.
    await expect(rows.first().locator('small')).toHaveText(/^\D*[\d,]+ (left|owed)$/);
  });
}
