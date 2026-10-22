import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The main flows with the keyboard alone: only Tab, Enter, Escape and typing, no mouse. Every
 * Tab stop must show where focus is, and a dialog or sheet must hand focus back to what opened it.
 * No network: nothing leaves the page.
 */

/**
 * Whether the focused element shows that it has focus.
 * - A radio or checkbox is a hidden native input (the page-wide ring would give it an outline no one
 *   sees), so what counts is the ring on its visible label.
 * - A text input or select has no outline by design (`focus:outline-none`); it takes a 2px line in
 *   ink under its value instead, in place of the 1px hairline. That counts when the line is at
 *   least 2px and not the hairline's colour (so a tab's always-there transparent border cannot pass).
 * - Anything else (links, buttons, switches, bars) needs an outline of its own.
 */
const focusIsShown = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    const ring = (e: Element) => {
      const s = getComputedStyle(e);
      const clear = s.outlineColor === 'transparent' || /,\s*0\)$/.test(s.outlineColor);
      return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && !clear;
    };
    if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
      const label = el.closest('label');
      return label !== null && ring(label);
    }
    // The calendar button inside a date field: focus is on it, not on the field, and Chrome rings it.
    if (el instanceof HTMLInputElement && el.type === 'date' && !el.matches(':focus')) return true;
    if (ring(el)) return true;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      // The hairline's colour as the page resolves it, to tell the focused line from the resting one.
      const probe = document.createElement('div');
      probe.style.color = 'var(--color-border)';
      document.body.append(probe);
      const hairline = getComputedStyle(probe).color;
      probe.remove();
      // The line is the input's own border, or its wrapper's (the share stepper's).
      for (let e: Element | null = el, up = 0; e && up < 3; e = e.parentElement, up++) {
        const s = getComputedStyle(e);
        if (
          s.borderBottomStyle !== 'none' &&
          parseFloat(s.borderBottomWidth) >= 2 &&
          s.borderBottomColor !== hairline
        )
          return true;
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

  // Category is chips, radios too: Tab lands on the chosen one (Food) and the arrows move it.
  await tabTo(page, page.getByRole('radio', { name: 'Food', exact: true }));
  // Transport, Rent, Utilities, Fun.
  for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Fun', exact: true })).toBeChecked();
  await expectFocusShown(page, 'the Category chips');

  // Paid with is a select of the accounts: Tab lands on it, on the Main account (first in line),
  // and the arrow keys step to the next one, the Demo Visa.
  const paidWith = page.getByLabel('Paid with');
  await tabTo(page, paidWith);
  await expect(paidWith.locator('option:checked')).toHaveText('Main account');
  await page.keyboard.press('ArrowDown');
  await expect(paidWith.locator('option:checked')).toHaveText('Demo Visa (credit card)');
  await expectFocusShown(page, 'the Paid with select');

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
  // The dialog takes focus into itself, onto the chosen radio of its first group (One category);
  // the browser alone would pick the first radio, Overall, which nobody chose.
  await expect(dialog.getByRole('radio', { name: 'One category' })).toBeFocused();
  await expectFocusShown(page, 'the chosen radio in the dialog');

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

for (const width of [360, 375]) {
  test(`four cycle tabs fit on one line in a dialog at ${width}px, each 44px wide, over a Paid with line`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'phone widths only');
    await page.setViewportSize({ width, height: 812 });
    await demoByKeyboard(page);
    // Opened by keyboard like everything else here (the URL change is not a mouse action).
    await page.goto('/subscriptions');
    await tabTo(page, page.getByRole('button', { name: 'Add', exact: true }).first());
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Widths depend on the font, so measure once it has loaded.
    await page.evaluate(() => document.fonts.ready);

    // Cycle is four tabs.
    const tabs = dialog.getByRole('group', { name: 'Cycle' }).locator('label');
    const boxes = await tabs.evaluateAll((labels) => labels.map((l) => l.getBoundingClientRect()));
    expect(boxes, 'Cycle').toHaveLength(4);
    expect(new Set(boxes.map((b) => Math.round(b.top))).size, 'Cycle on one line').toBe(1);
    for (const b of boxes) expect(b.width, 'Cycle tab width').toBeGreaterThanOrEqual(43.9);

    // Paid with is a select of the accounts, not tabs: one 44px line inside the dialog, naming the
    // demo's accounts in carousel order (a card is told apart by "(credit card)").
    const paidWith = dialog.getByLabel('Paid with');
    await expect(paidWith).toHaveJSProperty('tagName', 'SELECT');
    await expect(dialog.getByRole('group', { name: 'Paid with' })).toHaveCount(0);
    await expect(paidWith.locator('option')).toHaveText([
      'Main account',
      'Demo Visa (credit card)',
      'Savings',
      'Cash wallet',
      'Passive income',
    ]);
    const line = (await paidWith.boundingBox())!;
    const frame = (await dialog.boundingBox())!;
    expect(line.height, 'Paid with height').toBeGreaterThanOrEqual(43.9);
    expect(line.x, 'Paid with starts inside the dialog').toBeGreaterThanOrEqual(frame.x);
    expect(line.x + line.width, 'Paid with ends inside the dialog').toBeLessThanOrEqual(
      frame.x + frame.width,
    );
  });
}
