import { expect, test, type Page } from '@playwright/test';
import { startDemo, startFresh } from './helpers';

// The build gets this token from playwright.config.ts, so the app asks its price service.
const TOKEN = 'e2e-token';
const LINK = 'https://shop.example/concert-vip-pass';

/**
 * Answers `/api/extract` as long as the app sends its token; `reply` is what the page gave, or a
 * status for a service that fails. Returns the links the app sent off, to see what left the phone.
 */
async function mockExtract(page: Page, reply: { json: unknown } | { status: number }) {
  const sent: URL[] = [];
  await page.route('**/api/extract**', (route) => {
    const request = route.request();
    if (request.headers()['x-funancial-token'] !== TOKEN) {
      return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    }
    sent.push(new URL(request.url()));
    return 'json' in reply
      ? route.fulfill({ json: reply.json })
      : route.fulfill({ status: reply.status, json: { error: 'unavailable' } });
  });
  return sent;
}

const meter = (page: Page) => page.getByRole('meter', { name: 'Buy meter' });
const reading = async (page: Page) => Number(await meter(page).getAttribute('aria-valuenow'));

/**
 * Asks about `item` in Fun on the demo's card, from the Ask form. That is over the demo's Fun limit
 * of $100 whatever has been spent so far, and a card with a balance is money the person does not
 * have, which holds the meter at Wait.
 */
async function askAboutFun(page: Page, item: string, price: string) {
  await page.getByLabel('What is it?').fill(item);
  await page.getByLabel('Price', { exact: true }).fill(price);
  await page.getByLabel('Category').selectOption({ label: 'Fun' });
  await page.getByLabel('Pay with').selectOption({ label: 'Demo Visa' });
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: item })).toBeVisible();
}

/** Turns "Fun" in About you on or off, and waits for it to be saved. */
async function overspendOnFun(page: Page, on: boolean) {
  await page.goto('/about-you');
  const chip = page.getByRole('button', { name: 'Fun', exact: true });
  await expect(chip).toHaveAttribute('aria-pressed', String(!on));
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', String(on));
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
}

test('a pasted link fills the ask, and a Fun purchase over its limit is held at Wait', async ({
  page,
}) => {
  const sent = await mockExtract(page, {
    json: { name: 'Concert VIP pass', price: 150, currency: 'USD' },
  });
  await startDemo(page);
  await page.getByRole('main').getByRole('link', { name: 'Buy it?', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Should I buy it?' })).toBeVisible();

  // Leaving the field reads the link, as pasting into it does.
  const link = page.getByLabel('Paste a link (fills name and price)');
  await link.fill(LINK);
  await link.blur();
  await expect(page.getByLabel('What is it?')).toHaveValue('Concert VIP pass');
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('150.00');
  // Only the link went out.
  expect(sent.map((u) => [...u.searchParams])).toEqual([[['url', LINK]]]);

  await page.getByLabel('Category').selectOption({ label: 'Fun' });
  await page.getByLabel('Pay with').selectOption({ label: 'Demo Visa' });
  await page.getByRole('button', { name: 'Ask', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Concert VIP pass' })).toBeVisible();
  await expect(meter(page)).toBeVisible();
  // Over a limit and on a card with a balance: never a buy, whatever the day.
  await expect(page.locator('p', { hasText: '· confidence' })).toHaveText(
    /^(Skip it|Wait a few days|Look for a cheaper one) · confidence (low|medium|high)$/,
  );
  const facts = page.getByRole('list', { name: 'The facts' });
  await expect(facts.getByRole('listitem').filter({ hasText: 'Fun limit after' })).toContainText(
    /\d+% · over by \$/,
  );
  await expect(facts).toContainText('Available after');
  await expect(page.getByText("Needs money you don't have")).toBeVisible();
  await expect(page.getByText('Not financial advice')).toBeVisible();
});

test('About you lowers the meter and shows the note on the next ask', async ({ page }) => {
  await startDemo(page);
  // The demo comes with Fun marked; turn it off to see what it changes.
  await overspendOnFun(page, false);

  await page.goto('/buy');
  await askAboutFun(page, 'Concert VIP pass', '150');
  const before = await reading(page);
  // What the demo person said matters shows, the overspend line does not.
  await expect(page.getByText('You said: Paying off my card and the bike fund.')).toBeVisible();
  await expect(page.getByText('You said you tend to overspend on Fun.')).toHaveCount(0);

  await overspendOnFun(page, true);
  await page.goto('/buy');
  await askAboutFun(page, 'Concert VIP pass', '150');
  expect(await reading(page)).toBeLessThan(before);
  await expect(page.getByText('You said you tend to overspend on Fun.')).toBeVisible();
});

test('I bought it opens Add Expense with the item, amount, category and card filled in', async ({
  page,
}) => {
  await startDemo(page);
  await page.goto('/buy');
  await askAboutFun(page, 'Concert VIP pass', '150');

  await page.getByRole('button', { name: 'I bought it' }).click();

  await expect(page).toHaveURL(/\/add$/);
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('150.00');
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Concert VIP pass');
  await expect(page.getByRole('radio', { name: 'Fun', exact: true })).toBeChecked();
  // The card the ask said it would be paid with, not Cash.
  await expect(page.getByLabel('Paid with').locator('option:checked')).toHaveText('Demo Visa');
});

test('when the link cannot be read it says so and Ask still works', async ({ page }) => {
  await mockExtract(page, { status: 500 });
  await startFresh(page, '/buy');

  const link = page.getByLabel('Paste a link (fills name and price)');
  await link.fill(LINK);
  await link.blur();
  await expect(page.getByText("Couldn't read that link. Fill it in yourself.")).toBeVisible();

  await page.getByLabel('What is it?').fill('Concert VIP pass');
  await page.getByLabel('Price', { exact: true }).fill('150');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Concert VIP pass' })).toBeVisible();
  await expect(meter(page)).toBeVisible();
});
