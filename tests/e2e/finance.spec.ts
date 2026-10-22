import { expect, test, type Page } from '@playwright/test';
import { onboard } from './helpers';

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await onboard(page, { cash: '1000', savings: '5000', salary: { amount: '4200', payDay: '25' } });
}

async function addExpense(
  page: Page,
  opts: { amount: string; category?: string; paidWith?: string; note?: string; repeat?: string },
) {
  await page.goto('/add');
  await page.getByLabel('Amount', { exact: true }).fill(opts.amount);
  if (opts.category) await page.getByRole('radio', { name: opts.category, exact: true }).click();
  // The account is picked from the Paid with select, by the name it shows ("Visa (credit card)").
  if (opts.paidWith) await page.getByLabel('Paid with').selectOption({ label: opts.paidWith });
  if (opts.note) await page.getByLabel('Note', { exact: true }).fill(opts.note);
  if (opts.repeat) await page.getByLabel('Repeats').selectOption({ label: opts.repeat });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Expense saved.')).toBeVisible();
}

/** Home's hero: the account it shows (Main account, the default) and what it has. */
const hero = (page: Page) => page.getByRole('region', { name: 'Available balance' });

/** The Cards tab's Available to spend pill: the bank and cash, less the bills still to come. */
async function available(page: Page) {
  await page.goto('/cards');
  return page.getByRole('button', { name: /^Available to spend/ });
}

test('switching currency in Settings relabels amounts without converting them', async ({
  page,
}) => {
  await start(page);
  await expect(hero(page)).toContainText('$1,000.00');

  await page.goto('/settings');
  // Only the row's button is there while both dialogs are closed.
  const change = page.getByRole('button', { name: 'Change currency' });
  await change.click();
  const picker = page.getByRole('dialog', { name: 'Change currency' });
  await picker.getByLabel('New currency').selectOption('EUR');
  const confirm = page.getByRole('dialog', { name: 'Change your currency to EUR?' });
  await expect(confirm).toContainText('1,200 USD becomes 1,200 EUR.');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Focus is back where the person started, not dropped to the page (jsdom cannot show this).
  await expect(change).toBeFocused();

  // Cancel changed nothing; do it again and confirm.
  await change.click();
  await picker.getByLabel('New currency').selectOption('EUR');
  await confirm.getByRole('button', { name: 'Change currency' }).click();
  await expect(page.getByText('Currency changed to EUR.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(change).toBeFocused();

  await page.goto('/');
  await expect(hero(page)).toContainText('€1,000.00');
});

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
  // The limits live on Spending now, where the bar reads 83%.
  await page.goto('/budget');
  await expect(page.getByRole('progressbar', { name: 'Food · weekly' })).toHaveAttribute(
    'aria-valuetext',
    '83% used',
  );
});

test('card spending becomes a bill until the card is paid', async ({ page }) => {
  await start(page);
  // Savings is shown apart (in Net worth), so only the bank account counts in Available.
  await expect(await available(page)).toContainText('$1,000.00');

  await page.goto('/debts');
  await page.getByRole('button', { name: 'Add card' }).click();
  const add = page.getByRole('dialog', { name: 'Add a card' });
  await add.getByLabel('Name').fill('Visa');
  await add.getByLabel('Current balance').fill('0');
  await add.getByLabel('Due day').selectOption('21');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Card added.')).toBeVisible();

  // The new card is an account: Paid with offers it by name, marked as a credit card.
  await addExpense(page, { amount: '50', category: 'Shopping', paidWith: 'Visa (credit card)' });
  await expect(await available(page)).toContainText('$950.00');

  await page.goto('/debts');
  const visa = page.getByRole('listitem').filter({ hasText: 'Visa' });
  await expect(visa).toContainText('$50.00');
  await visa.getByRole('button', { name: 'Pay card' }).click();
  const pay = page.getByRole('dialog', { name: 'Pay Visa' });
  await expect(pay.getByLabel('Amount')).toHaveValue('50.00');
  await pay.getByRole('button', { name: 'Pay' }).click();
  await expect(visa).toContainText('$0.00');

  // The Main account paid the card: 1,000 − 50, and no bill left.
  await expect(await available(page)).toContainText('$950.00');
  await page.goto('/');
  await expect(hero(page)).toContainText('$950.00');
});

test('there is no salary freeze: its page is gone and Home has no banner for it', async ({
  page,
}) => {
  await start(page);
  await page.goto('/freeze');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();

  await page.goto('/');
  // Wait for Home itself first: an absence check could pass before anything has rendered.
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(hero(page)).toBeVisible();
  await expect(page.getByText(/^Salary freeze until/)).toHaveCount(0);
});

test("setting an account's actual balance records a correction", async ({ page }) => {
  await start(page);
  await page.goto('/history');
  await page.getByRole('button', { name: 'Set actual balance' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set actual balance' });
  // It starts on the default account, and the person can pick any other.
  const account = dialog.getByLabel('Account');
  await expect(account.locator('option:checked')).toHaveText('Main account');
  await expect(dialog.getByText('Funcial thinks: $1,000.00')).toBeVisible();
  await account.selectOption({ label: 'Savings' });
  await expect(dialog.getByText('Funcial thinks: $5,000.00')).toBeVisible();
  await account.selectOption({ label: 'Main account' });
  await expect(dialog.getByText('Funcial thinks: $1,000.00')).toBeVisible();
  await dialog.getByLabel('Actual balance').fill('900');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Balance correction')).toBeVisible();

  await page.goto('/');
  await expect(hero(page)).toContainText('$900.00');
  // 900 in the bank and 5,000 in savings.
  await expect(page.getByRole('region', { name: 'Net worth' })).toContainText('$5,900.00');
});

test("the Cards tab's Available to spend sheet corrects an account and keeps its place", async ({
  page,
}) => {
  await start(page);
  const number = await available(page);
  // The name is what it is, then the amount drawn.
  await expect(number).toHaveAccessibleName('Available to spend $1,000.00');
  await number.click();
  const sheet = page.getByRole('dialog', { name: 'Available to spend' });
  // The accounts that count are listed; savings is not one of them.
  const main = sheet.getByRole('listitem').filter({ hasText: 'Main account' });
  await expect(main).toContainText('$1,000.00');
  await expect(sheet.getByRole('listitem').filter({ hasText: 'Savings' })).toHaveCount(0);
  await main.getByRole('button', { name: 'Correct Main account', exact: true }).click();
  // Opened for one account, the dialog names it instead of asking which.
  const dialog = page.getByRole('dialog', { name: 'Set actual balance' });
  await expect(dialog.getByText('Main account', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Account')).toHaveCount(0);
  await dialog.getByLabel('Actual balance').fill('900');
  await dialog.getByRole('button', { name: 'Save' }).click();

  // The sheet is still open with the new balance, and focus is back on the button that asked.
  await expect(main).toContainText('$900.00');
  await expect(sheet.getByText('= Available to spend').locator('..')).toContainText('$900.00');
  await expect(
    main.getByRole('button', { name: 'Correct Main account', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(number).toContainText('$900.00');
  await expect(number).toBeFocused();
});

test("adds an expense from Home's Expenses tile, in a sheet over Home, and History lists it", async ({
  page,
}) => {
  await start(page);
  const expenses = page
    .getByRole('region', { name: 'Overview' })
    .getByRole('button', { name: /^Expenses.*Add expense$/ });
  await expenses.click();
  const sheet = page.getByRole('dialog', { name: 'Add expense' });
  await expect(sheet.getByLabel('Amount', { exact: true })).toBeFocused();
  await sheet.getByLabel('Amount', { exact: true }).fill('23.40');
  await sheet.getByRole('radio', { name: 'Transport', exact: true }).click();
  await sheet.getByLabel('Note', { exact: true }).fill('Bus pass');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText('Expense saved.')).toBeVisible();
  await expect(sheet).toBeHidden();
  // Still on Home, which counts it at once.
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(hero(page)).toContainText('$976.60');
  await expect(expenses).toContainText('−$23');
  const recent = page.getByRole('region', { name: 'Recent transactions' });
  await expect(recent.getByRole('listitem').first()).toContainText('Bus pass');

  // Overview's View all opens History on this month, where it is listed.
  await page
    .getByRole('region', { name: 'Overview' })
    .getByRole('link', { name: 'View all' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: 'Bus pass' });
  await expect(row).toContainText('Transport · Main account');
  await expect(row).toContainText('−$23.40');
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
