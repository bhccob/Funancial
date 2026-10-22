import { expect, test, type Page } from '@playwright/test';
import { openProfile, startFresh } from './helpers';

const bar = (page: Page) => page.getByRole('navigation', { name: 'Primary' });
/** The ＋ in the tab bar: named Add while the fan is shut, Close while it is open. */
const plus = (page: Page) => bar(page).getByRole('button', { name: /^(Add|Close)$/ });
/** The fan of Expense and Income; exact, as the add sheets are named "Add expense" and "Add income". */
const fan = (page: Page) => page.getByRole('dialog', { name: 'Add', exact: true });

test('mobile: the tab bar navigates, and Profile opens from the avatar on Home', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await expect(bar(page)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'All sections' })).toBeHidden();
  const slots = bar(page).locator('a, button');
  await expect(slots).toHaveCount(5);
  for (const [i, name] of ['Home', 'Cards', 'Add', 'Spending', 'Invest'].entries()) {
    await expect(slots.nth(i)).toHaveAccessibleName(name);
  }

  await bar(page).getByRole('link', { name: 'Spending' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();
  await expect(bar(page).getByRole('link', { name: 'Spending' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await bar(page).getByRole('link', { name: 'Cards' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bills & cards' })).toBeVisible();

  const profile = await openProfile(page);
  await profile.getByRole('link', { name: /^Settings/ }).click();
  // The screen chosen takes focus on its name.
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeFocused();
});

test('mobile: at 360×640 the current tab shows all of "Spending"', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await page.setViewportSize({ width: 360, height: 640 });
  await startFresh(page, '/budget');
  const tab = bar(page).getByRole('link', { name: 'Spending' });
  const label = tab.getByText('Spending', { exact: true });
  await expect(label).toBeVisible();
  const fits = await tab.evaluate((link) => {
    const text = [...link.querySelectorAll('span')].find((s) => s.textContent === 'Spending')!;
    const inner = text.getBoundingClientRect();
    const outer = link.getBoundingClientRect();
    const nav = link.closest('nav')!.getBoundingClientRect();
    return {
      label: text.scrollWidth <= text.clientWidth,
      link: link.scrollWidth <= link.clientWidth,
      inside: inner.left >= outer.left && inner.right <= outer.right && outer.right <= nav.right,
    };
  });
  expect(fits).toEqual({ label: true, link: true, inside: true });
});

test('mobile: the ＋ opens the fan, and Escape closes it with focus back on the ＋', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await plus(page).click();
  await expect(fan(page)).toBeVisible();
  await expect(plus(page)).toHaveAccessibleName('Close');
  await expect(plus(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(fan(page).getByRole('button', { name: 'Expense' })).toBeFocused();
  await expect(fan(page).getByRole('button', { name: 'Income' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(fan(page)).toBeHidden();
  await expect(plus(page)).toHaveAccessibleName('Add');
  await expect(plus(page)).toBeFocused();
});

test('mobile: ＋, then Expense, adds an expense that shows in History', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await plus(page).click();
  await fan(page).getByRole('button', { name: 'Expense' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add expense' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { level: 2, name: 'Add expense' })).toBeVisible();
  await expect(fan(page)).toBeHidden();
  const amount = sheet.getByLabel('Amount', { exact: true });
  await expect(amount).toBeFocused();
  await amount.fill('4.20');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText('Expense saved.')).toBeVisible();
  await expect(sheet).toBeHidden();
  // Still on Home, with focus back on the ＋ that started it.
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(plus(page)).toBeFocused();

  const profile = await openProfile(page);
  await profile.getByRole('link', { name: /^History/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
  await expect(page.getByText('−$4.20')).toBeVisible();
});

test('mobile: toasts from a save stay clear of the fan opened again, and its bubbles work', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await plus(page).click();
  await fan(page).getByRole('button', { name: 'Expense' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add expense' });
  await sheet.getByLabel('Amount', { exact: true }).fill('4.20');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet).toBeHidden();
  // The first expense also completes a quest and earns a badge: three toasts, stacked.
  const saved = page.getByText('Expense saved.');
  await expect(saved).toBeVisible();

  await plus(page).click();
  const bubbles = [
    fan(page).getByRole('button', { name: 'Expense' }),
    fan(page).getByRole('button', { name: 'Income' }),
  ];
  // Measured where they come to rest.
  for (const bubble of bubbles) await expect(bubble).toHaveCSS('opacity', '1');
  await expect(saved).toBeVisible();
  const toasts = await page.locator('[aria-live] > [role]').all();
  expect(toasts.length).toBeGreaterThan(0);
  for (const shown of toasts) {
    const t = (await shown.boundingBox())!;
    for (const bubble of bubbles) {
      const b = (await bubble.boundingBox())!;
      const apart =
        t.x + t.width <= b.x ||
        b.x + b.width <= t.x ||
        t.y + t.height <= b.y ||
        b.y + b.height <= t.y;
      expect(apart, `"${await shown.textContent()}" is clear of a bubble`).toBe(true);
    }
  }

  await bubbles[1]!.click();
  await expect(page.getByRole('dialog', { name: 'Add income' })).toBeVisible();
});

test('mobile: the bottom of Settings clears the tab bar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page, '/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  for (const size of [
    { width: 375, height: 812 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = page.getByRole('main').getByRole('button').last();
    await expect(last).toBeInViewport();
    await expect
      .poll(async () => {
        const button = (await last.boundingBox())!;
        const top = (await bar(page).boundingBox())!.y;
        return button.y + button.height <= top;
      }, `the last button ends above the tab bar at ${size.width}×${size.height}`)
      .toBe(true);
  }
});

test('mobile: reduced motion: the fan only fades', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startFresh(page);
  await plus(page).click();
  const expense = fan(page).getByRole('button', { name: 'Expense' });
  await expect(expense).toBeVisible();
  // Read at once, while a rise would still be on its way: nothing moves or grows, it only fades in.
  const moving = await expense.evaluate((el) => {
    const s = getComputedStyle(el);
    return { transform: s.transform, translate: s.translate, scale: s.scale };
  });
  expect(moving).toEqual({ transform: 'none', translate: 'none', scale: 'none' });
  await expect.poll(() => expense.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
});

test('desktop: the sidebar navigates and the tab bar is hidden', async ({ page }, testInfo) => {
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

test('mobile: Home has three actions, and History stays one tap away in Last 7 days', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  await expect(page.getByRole('link', { name: 'Expense', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Income', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Goals', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buy it?' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'History' })).toHaveCount(1);
});

test('mobile: Profile has no Buy it?, no About you and no Salary freeze', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  const menu = await openProfile(page);
  await expect(menu.getByRole('heading', { level: 2 })).toHaveText(['Your money', 'You']);
  await expect(menu.getByRole('link', { name: /^Buy it\?/ })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: /^About you/ })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: /^Salary freeze/ })).toHaveCount(0);
});

test('desktop: the sidebar has no Buy it?, no About you and no Salary freeze', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page);
  const sidebar = page.getByRole('navigation', { name: 'All sections' });
  await expect(sidebar.getByRole('link', { name: /^Quests/ })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: /^Buy it\?/ })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: /^About you/ })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: /^Salary freeze/ })).toHaveCount(0);
});

test('Add Expense does not send you off to ask first', async ({ page }) => {
  await startFresh(page, '/add');
  await expect(page.getByRole('heading', { level: 1, name: 'Add' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ask first/ })).toHaveCount(0);
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

test('mobile: Profile opens Goals and Debts as two pages', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);

  await (await openProfile(page)).getByRole('link', { name: /^Goals/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Goals' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add goal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add card' })).toHaveCount(0);

  await (await openProfile(page)).getByRole('link', { name: /^Debts/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Debts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add card' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add loan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add goal' })).toHaveCount(0);
});

test('mobile: Profile opens Income, and an income added there shows in its bars', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await startFresh(page);
  const row = (await openProfile(page)).getByRole('link', { name: /^Income/ });
  await expect(row).toContainText('$0.00 this month');
  await row.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Income' })).toBeVisible();
  await expect(page.getByText('No income yet')).toBeVisible();

  // The empty page offers to add some, and Save brings the person back to it.
  await page.getByRole('link', { name: 'Add income' }).click();
  await expect(page.getByRole('radio', { name: 'Income' })).toBeChecked();
  await page.getByLabel('Amount').fill('1250');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Income' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'This month' })).toContainText('$1,250.00');

  const chart = page.getByRole('region', { name: 'Last 12 months' });
  const bars = chart.getByRole('group', { name: 'Income per month' }).getByRole('button');
  await expect(bars).toHaveCount(12);
  await bars.last().click();
  await expect(chart.getByRole('status')).toContainText(
    'Salary $1,250.00 · Extra $0.00 · Dividends $0.00',
  );
  // Twelve bars and their captions fit a 375px phone without a sideways scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('desktop: Home links to Income stats, and the sidebar marks Income as current', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop layout only');
  await startFresh(page);
  await page
    .getByRole('region', { name: 'Net worth' })
    .getByRole('link', { name: 'Income stats' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Income' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'All sections' }).getByRole('link', { name: /^Income/ }),
  ).toHaveAttribute('aria-current', 'page');
});
