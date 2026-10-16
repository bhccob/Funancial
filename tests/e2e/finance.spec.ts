import { expect, test, type Page } from '@playwright/test';
import { onboard } from './helpers';

/** Local calendar date, offset by whole days, as the app sees it (YYYY-MM-DD). */
function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with my real data' }).click();
  await onboard(page, { cash: '1000', savings: '5000', salary: { amount: '4200', payDay: '25' } });
}

async function addExpense(
  page: Page,
  opts: { amount: string; category?: string; paidWith?: string; note?: string; repeat?: string },
) {
  await page.goto('/add');
  await page.getByLabel('Amount', { exact: true }).fill(opts.amount);
  if (opts.category) await page.getByRole('radio', { name: opts.category, exact: true }).click();
  if (opts.paidWith) await page.getByLabel('Paid with').selectOption({ label: opts.paidWith });
  if (opts.note) await page.getByLabel('Note', { exact: true }).fill(opts.note);
  if (opts.repeat) await page.getByLabel('Repeats').selectOption({ label: opts.repeat });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Expense saved.')).toBeVisible();
}

const available = (page: Page) => page.getByRole('region', { name: 'Available to spend' });

test('a weekly food limit warns at 80% in the motivational tone', async ({ page }) => {
  await start(page);
  await page.goto('/budget');
  await page.getByRole('button', { name: 'Add a limit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a limit' });
  await dialog.getByRole('radio', { name: 'One category' }).click();
  await dialog.getByRole('radio', { name: 'Weekly' }).click();
  await dialog.getByLabel('Limit').fill('120');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('progressbar', { name: 'Food · weekly' })).toBeVisible();

  await addExpense(page, { amount: '100', category: 'Food' });
  await expect(
    page.getByText("Food is at 83%. A few careful days and you've got this!"),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Food · week: 83% used, $20 left' })).toBeVisible();
});

test('card spending becomes a bill until the card is paid', async ({ page }) => {
  await start(page);
  await expect(available(page)).toContainText('$6,000.00');

  await page.goto('/goals');
  await page.getByRole('button', { name: 'Add card' }).click();
  const add = page.getByRole('dialog', { name: 'Add a card' });
  await add.getByLabel('Name').fill('Visa');
  await add.getByLabel('Current balance').fill('0');
  await add.getByLabel('Due day').selectOption('21');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Card added.')).toBeVisible();

  await addExpense(page, { amount: '50', category: 'Shopping', paidWith: 'Visa' });
  await expect(available(page)).toContainText('$5,950.00');

  await page.goto('/goals');
  const visa = page.getByRole('listitem').filter({ hasText: 'Visa' });
  await expect(visa).toContainText('$50.00');
  await visa.getByRole('button', { name: 'Pay card' }).click();
  const pay = page.getByRole('dialog', { name: 'Pay Visa' });
  await expect(pay.getByLabel('Amount')).toHaveValue('50.00');
  await pay.getByRole('button', { name: 'Pay' }).click();
  await expect(visa).toContainText('$0.00');

  await page.goto('/');
  // Cash paid the card: 1,000 − 50 cash + 5,000 savings, and no bill left.
  await expect(available(page)).toContainText('$5,950.00');
});

test('a salary freeze previews lower pay and shows on Home', async ({ page }) => {
  await start(page);
  await page.goto('/freeze');
  await page.getByLabel('From', { exact: true }).fill(localDate(0));
  await page.getByLabel('To', { exact: true }).fill(localDate(2));
  await expect(page.getByText(/: \$4,200\.00 → \$[\d,]+\.\d\d$/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Add freeze' }).click();
  await expect(page.getByText('Freeze added. Expected pay is updated.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your freezes' })).toBeVisible();

  await page.goto('/');
  await expect(
    page.getByText(/^Salary freeze until .+\. Bills and subscriptions still apply\.$/),
  ).toBeVisible();
});

test('setting the actual cash balance records a correction', async ({ page }) => {
  await start(page);
  await page.goto('/history');
  await page.getByRole('button', { name: 'Set actual balance' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set actual balance' });
  await expect(dialog.getByText('Funancial thinks: $1,000.00')).toBeVisible();
  await dialog.getByLabel('Actual balance').fill('900');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Balance correction')).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Net worth' })).toContainText('Cash $900');
});

test('a monthly expense also becomes a subscription renewing next month', async ({ page }) => {
  await start(page);
  await addExpense(page, { amount: '1,200', category: 'Rent', note: 'Rent', repeat: 'Monthly' });
  await page.goto('/subscriptions');
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleString('en-US', {
    month: 'short',
  });
  const rent = page.getByRole('listitem').filter({ hasText: 'Rent' });
  await expect(rent).toContainText(`$1,200.00 / month · Renews ${nextMonth}`);
});
