import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The main flows with the keyboard alone: only Tab, Enter, Escape and typing, no mouse. Every
 * Tab stop must show where focus is, and a dialog or sheet must hand focus back to what opened it.
 * No network: Buy it? is asked without a link, so nothing leaves the page.
 */

/**
 * Whether the focused element shows that it has focus: an outline (the page-wide ring, which the
 * radio tabs draw on their label), or the 2px ink line that line fields take under their value
 * instead of a box (`focus:outline-none` + `focus:border-b-2`, by design).
 */
const focusIsShown = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    const outlined = (e: Element) => {
      const s = getComputedStyle(e);
      return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    };
    if (outlined(el) || (el.closest('label') && outlined(el.closest('label')!))) return true;
    // The calendar button inside a date field: focus is on it, not on the field, and Chrome rings it.
    if (el instanceof HTMLInputElement && el.type === 'date' && !el.matches(':focus')) return true;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      for (let e: Element | null = el, up = 0; e && up < 3; e = e.parentElement, up++) {
        const s = getComputedStyle(e);
        if (s.borderBottomStyle !== 'none' && parseFloat(s.borderBottomWidth) >= 2) return true;
      }
    }
    return false;
  });

const expectFocusShown = async (page: Page, where: string) => {
  const shown = await focusIsShown(page);
  const on = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160));
  expect(shown, `focus is visible on ${where}: ${on}`).toBe(true);
};

/** Presses Tab until `target` has focus, checking that focus is visible at every stop on the way. */
async function tabTo(page: Page, target: Locator, max = 120) {
  await expect(target).toBeVisible();
  for (let stop = 0; stop <= max; stop++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
    // Past the last control, Tab leaves the page for the browser's own chrome and comes back.
    if (await page.evaluate(() => document.activeElement === document.body)) continue;
    await expectFocusShown(page, `Tab stop ${stop + 1}`);
  }
  throw new Error(`Tab never reached ${target}`);
}

/** Opens `opener` with Enter, then closes what it opened with Escape and checks focus is back on it. */
async function openAndEscape(page: Page, opener: Locator, dialog: Locator) {
  await tabTo(page, opener);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expectFocusShown(page, 'the opener after its dialog closed');
}

/** The welcome screen, then "Try with demo money", by keyboard. */
async function demoByKeyboard(page: Page) {
  await page.goto('/');
  await tabTo(page, page.getByRole('button', { name: 'Try with demo money' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
}

/** Every request the page sends to the price service; none of these flows may send one. */
function watchApi(page: Page) {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) sent.push(r.url());
  });
  return sent;
}

test('add an expense with the keyboard alone', async ({ page }) => {
  const api = watchApi(page);
  await demoByKeyboard(page);

  // A "?" tip is a sheet: Escape closes it and focus is back on the "?".
  await openAndEscape(
    page,
    page.getByRole('button', { name: 'What is available to spend?' }),
    page.getByRole('dialog', { name: 'Available to spend' }),
  );

  await tabTo(page, page.getByRole('main').getByRole('link', { name: 'Expense', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Add' })).toBeVisible();

  // The amount starts with focus; the rest is Tab and typing.
  const amount = page.getByLabel('Amount', { exact: true });
  await expect(amount).toBeFocused();
  await expectFocusShown(page, 'the Amount field');
  await page.keyboard.type('12.50');

  const category = page.getByLabel('Category');
  await tabTo(page, category);
  await page.keyboard.type('Fun');
  await expect(category).toHaveValue('entertainment');

  // Paid with is tabs, still radios: Tab lands on the choice and the arrows move it.
  const cash = page.getByRole('radio', { name: 'Cash' });
  await tabTo(page, cash);
  await expect(cash).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Debit card' })).toBeChecked();
  await expectFocusShown(page, 'the Paid with tabs');

  await tabTo(page, page.getByLabel('Note', { exact: true }));
  await page.keyboard.type('Team lunch');
  await tabTo(page, page.getByRole('button', { name: 'Save', exact: true }));
  await page.keyboard.press('Enter');

  await expect(page.getByText('Expense saved.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  expect(api).toEqual([]);
});

test('set a limit with the keyboard alone, and focus comes back to Add a limit', async ({
  page,
}) => {
  const api = watchApi(page);
  await demoByKeyboard(page);
  await tabTo(
    page,
    page.getByRole('navigation').getByRole('link', { name: 'Budget', exact: true }),
  );
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();

  const opener = page.getByRole('button', { name: 'Add a limit' });
  const dialog = page.getByRole('dialog', { name: 'Add a limit' });

  // Backing out with Escape, then opening it again to fill in.
  await openAndEscape(page, opener, dialog);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  // The dialog takes focus into itself, onto the first choice.
  await expect(dialog.getByRole('radio', { name: 'One category' })).toBeFocused();
  await expectFocusShown(page, 'the first choice in the dialog');

  const category = dialog.getByLabel('Category', { exact: true });
  await tabTo(page, category);
  await page.keyboard.type('Health');
  await expect(category).toHaveValue('health');

  await tabTo(page, dialog.getByLabel('Limit', { exact: true }));
  await page.keyboard.type('75');
  await tabTo(page, dialog.getByRole('button', { name: 'Save', exact: true }));
  await page.keyboard.press('Enter');

  await expect(page.getByText('Limit added.')).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expectFocusShown(page, 'Add a limit after saving');
  await expect(page.getByRole('button', { name: 'Edit Health limit' })).toBeVisible();
  expect(api).toEqual([]);
});

test('ask Buy it? on demo money with the keyboard alone', async ({ page }) => {
  const api = watchApi(page);
  await demoByKeyboard(page);
  await tabTo(page, page.getByRole('main').getByRole('link', { name: 'Buy it?', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Should I buy it?' })).toBeVisible();

  await tabTo(page, page.getByLabel('What is it?'));
  await page.keyboard.type('Noise-cancelling headphones');
  await tabTo(page, page.getByLabel('Price', { exact: true }));
  await page.keyboard.type('120');
  const category = page.getByLabel('Category');
  await tabTo(page, category);
  await page.keyboard.type('Fun');
  await expect(category).toHaveValue('entertainment');

  // Need / Want / Treat are tabs, still radios.
  await tabTo(page, page.getByRole('radio', { name: 'Want' }));
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Treat' })).toBeChecked();

  await tabTo(page, page.getByRole('button', { name: 'Ask', exact: true }));
  await page.keyboard.press('Enter');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Noise-cancelling headphones' }),
  ).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Buy meter' })).toBeVisible();

  // The "?" on the meter is a sheet too.
  await openAndEscape(
    page,
    page.getByRole('button', { name: 'What is the buy meter?' }),
    page.getByRole('dialog', { name: 'Should I buy it?' }),
  );
  expect(api).toEqual([]);
});

for (const width of [360, 375]) {
  test(`four tabs fit on one line in a dialog at ${width}px, and each is 44px wide`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'phone widths only');
    await page.setViewportSize({ width, height: 812 });
    await demoByKeyboard(page);
    await page.goto('/subscriptions');
    await page.getByRole('button', { name: 'Add', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    // Cycle has four tabs; Paid with has four on demo money (Cash, Debit card, Demo Visa, Other).
    for (const legend of ['Cycle', 'Paid with']) {
      const tabs = dialog.getByRole('group', { name: legend }).locator('label');
      const boxes = await tabs.evaluateAll((labels) =>
        labels.map((l) => l.getBoundingClientRect()),
      );
      expect(boxes, legend).toHaveLength(4);
      expect(new Set(boxes.map((b) => Math.round(b.top))).size, `${legend} on one line`).toBe(1);
      for (const b of boxes) expect(b.width, `${legend} tab width`).toBeGreaterThanOrEqual(43.9);
    }
  });
}
