import { expect, test, type Locator, type Page } from '@playwright/test';
import { onboard, startDemo } from './helpers';

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
        // The words' second line is the one under the title, whatever its clamp.
        const line = words.children[1] as HTMLElement;
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

/** Saves an expense, from the Add page. */
async function addExpense(page: Page, opts: { amount: string; note: string }) {
  await page.goto('/add');
  await page.getByLabel('Amount', { exact: true }).fill(opts.amount);
  await page.getByLabel('Note', { exact: true }).fill(opts.note);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Expense saved.')).toBeVisible();
}

/** Saves extra income, from the Add page, and waits for Home to show it as the newest row. */
async function addIncome(page: Page, opts: { amount: string; label: string }) {
  await page.goto('/add');
  await page.getByRole('radio', { name: 'Income' }).click();
  // The income form replaces the expense form; fill the one that stays.
  await expect(page.getByRole('group', { name: 'Source' })).toBeVisible();
  await page.getByLabel('Amount', { exact: true }).fill(opts.amount);
  await page.getByLabel('Label').fill(opts.label);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Recent transactions' }).locator('li[data-entry]').first(),
  ).toContainText(opts.label);
}

/** What a list of entry rows measures: where each row's amount ends, and what its last control is. */
function measureAmounts(rows: Locator) {
  return rows.evaluateAll((els) =>
    els.map((li) => {
      const right = (el: Element) => el.getBoundingClientRect().right;
      const del = li.querySelector('button[aria-label^="Delete"]');
      const box = del?.getBoundingClientRect();
      return {
        title: li.querySelector('b')!.textContent,
        kind: del ? 'delete' : 'open',
        // From the row's right edge, so the lists compare wherever each one stands.
        amountEnd: right(li) - right(li.querySelector('.tabular-nums')!),
        target: box && { width: box.width, height: box.height, left: box.left, right: box.right },
        page: { width: window.innerWidth, scrolls: document.documentElement.scrollWidth },
      };
    }),
  );
}

// An expense row ends in a 16px chevron and every other row in a 44px delete button; the delete
// button gives back what its box is wider than the chevron's, so the amounts stand in one column.
for (const [width, height] of [
  [360, 780],
  [375, 812],
] as const) {
  test(`mobile: at ${width}px the amounts line up in Recent and History`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await onboard(page, { cash: '1000' });
    // Today's five rows: expenses (a chevron) and income (a delete button), mixed.
    await addExpense(page, { amount: '4.50', note: 'Coffee' });
    await addIncome(page, { amount: '1250', label: 'Side job' });
    await addExpense(page, { amount: '12', note: 'Lunch' });
    await addIncome(page, { amount: '20', label: 'Gift' });
    await addExpense(page, { amount: '3', note: 'Bakery' });

    await page.goto('/');
    const recent = page
      .getByRole('region', { name: 'Recent transactions' })
      .locator('li[data-entry]');
    await expect(recent).toHaveCount(5);
    const inRecent = await measureAmounts(recent);

    await page.goto('/history');
    const history = page.getByRole('main').locator('section ul > li');
    await expect(history.first()).toBeVisible();
    const inHistory = await measureAmounts(history);

    for (const [where, rows] of [
      ['Recent', inRecent],
      ['History', inHistory],
    ] as const) {
      for (const kind of ['open', 'delete']) {
        expect(
          rows.filter((r) => r.kind === kind).length,
          `${where}: rows with ${kind}`,
        ).toBeGreaterThan(0);
      }
      for (const row of rows) {
        expect(row.page.scrolls, `${where}: the page does not scroll sideways`).toBeLessThanOrEqual(
          width,
        );
        if (!row.target) continue;
        // The target stays a whole 44px box, on the screen.
        expect(row.target.width, `${where}: ${row.title}: delete target`).toBe(44);
        expect(row.target.height, `${where}: ${row.title}: delete target`).toBe(44);
        expect(row.target.left, `${where}: ${row.title}: target on screen`).toBeGreaterThanOrEqual(
          0,
        );
        expect(row.target.right, `${where}: ${row.title}: target on screen`).toBeLessThanOrEqual(
          width,
        );
      }
    }
    const ends = [...inRecent, ...inHistory].map((r) => r.amountEnd);
    expect(
      Math.max(...ends) - Math.min(...ends),
      `the amounts' distance from the row's end: ${ends.map((e) => e.toFixed(1)).join(', ')}`,
    ).toBeLessThanOrEqual(1);
  });
}

// "Afl." (Aruban florin, in Dutch) is the widest amount the owner reads. The newest row also says
// what is left on its card, so the amount column is as wide as "Afl. 2.605 left", and the words
// have what is left of 360px: the card's name and last 4 digits must still be there whole.
test.describe('a long card name, with Afl. amounts', () => {
  test.use({ locale: 'nl-AW' });
  for (const width of [360, 375]) {
    test(`mobile: at ${width}px a long card name shows whole with Afl. amounts`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
      await page.setViewportSize({ width, height: 780 });
      await page.goto('/');
      await page.getByRole('button', { name: 'Create an account' }).click();
      await onboard(page, { currency: 'AWG', cash: '2605' });

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

      await addExpense(page, { amount: '1234.50', note: 'Groceries' });
      await page.goto('/');
      const row = page
        .getByRole('region', { name: 'Recent transactions' })
        .locator('li[data-entry]')
        .first();
      await expect(row).toContainText('Everyday checking ·· 4312');
      await expect(row).toContainText('Afl.');

      const shown = await row.evaluate((li) => {
        const words = li.querySelector('b')!.closest('span.min-w-0.flex-1')!;
        // The title is the words' first line, the line under it their second.
        const line = words.children[1] as HTMLElement;
        const box = line.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(line);
        const glyphs = [...range.getClientRects()];
        const wordsBox = words.getBoundingClientRect();
        return {
          text: line.textContent,
          words: wordsBox.width,
          // A clamped line keeps its hidden lines in the box, past its bottom, and ends in an ellipsis.
          clipped: line.scrollHeight > line.clientHeight + 1,
          outside: glyphs.filter(
            (g) =>
              g.left < wordsBox.left - 0.5 ||
              g.right > wordsBox.right + 0.5 ||
              g.top < box.top - 0.5 ||
              g.bottom > box.bottom + 0.5,
          ).length,
          height: li.getBoundingClientRect().height,
          scrolls: document.documentElement.scrollWidth,
        };
      });
      console.log(`${width}px: words ${shown.words.toFixed(1)}px wide, row ${shown.height}px tall`);
      expect(shown.text).toContain('Everyday checking ·· 4312');
      expect(shown.clipped, 'the line under the title is cut').toBe(false);
      expect(shown.outside, 'glyphs outside the words').toBe(0);
      expect(shown.scrolls, 'the page does not scroll sideways').toBeLessThanOrEqual(width);
    });
  }
});
