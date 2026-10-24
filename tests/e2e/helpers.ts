import { expect, type Page } from '@playwright/test';

export interface OnboardOptions {
  /**
   * Make this account in the first two steps, with `code` as the one the email brought; the account
   * service must be mocked (the specs route every request to /api). Without it the account and the
   * code are skipped the way an offline phone skips them, which asks the service for nothing.
   */
  account?: { username: string; email: string; password: string; code: string };
  /** Setup starts on the phone's currency, which is the test machine's; defaults to USD, chosen here. */
  currency?: string;
  pin?: string;
}

const next = (page: Page) => page.getByRole('button', { name: 'Continue' }).click();

/**
 * Makes the page read as offline (or online again): `navigator.onLine` and its events, so setup shows
 * its offline step. No request is held up, so the app and its files still load.
 */
export const setOnline = (page: Page, online: boolean) =>
  page.evaluate((on) => {
    if (on) Reflect.deleteProperty(navigator, 'onLine');
    else Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event(on ? 'online' : 'offline'));
  }, online);

/** Setup's account step (and the code after it), the way a phone with no connection takes it: "Skip for now". */
export async function skipAccount(page: Page) {
  await setOnline(page, false);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await setOnline(page, true);
}

/** Fills setup's account step and asks for the code: on the code step. */
export async function createAccountStep(
  page: Page,
  { username, email, password }: Omit<NonNullable<OnboardOptions['account']>, 'code'>,
) {
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await next(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
}

/** Types `code` on setup's code step and verifies it. The step showing now: the one leaving has none. */
export async function codeStep(page: Page, code: string) {
  await page.locator('[data-motion="current"]').getByLabel('Code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();
}

/**
 * Walks the four setup steps (the account and its code first), "You're all set", then Home.
 * Defaults: no account (skipped), USD, no lock. Setup asks nothing about money: a spec that needs
 * a balance, a salary or another account sets it afterwards (`setStartingBalance`, `setSalary`,
 * `addAccount`).
 */
export async function onboard(page: Page, opts: OnboardOptions = {}) {
  if (opts.account) {
    await createAccountStep(page, opts.account);
    await codeStep(page, opts.account.code);
  } else {
    await skipAccount(page);
  }
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your currency and name' }),
  ).toBeVisible();
  await page.getByLabel('Currency').selectOption(opts.currency ?? 'USD');
  await next(page);
  if (opts.pin) {
    await page.getByRole('radio', { name: 'PIN' }).click();
    await page.getByLabel('Choose a PIN').fill(opts.pin);
    await page.getByLabel('Confirm PIN').fill(opts.pin);
  }
  await page.getByRole('button', { name: 'Start my adventure' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^You're all set/ })).toBeVisible();
  await page.getByRole('button', { name: 'Open Funcial' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
}

/** Back to Home from wherever the app is, without a reload (a lock would ask for its PIN again). */
async function goHome(page: Page) {
  // The tab bar on a phone, the sidebar on a wide screen: whichever is showing.
  await page
    .getByRole('link', { name: 'Home', exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
}

/** The Cards tab, opened from the app's own links, so a lock is not asked for again. */
async function openCards(page: Page) {
  await page
    .getByRole('link', { name: 'Cards', exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cards' })).toBeVisible();
}

/**
 * Sets Main account's starting balance (its opening balance) to `amount`, as typed, then comes back
 * to Home. It goes through the Cards tab: Main account, its Settings, "Balance when added". (Home's
 * first-time card asks for the same number once it is there.)
 */
export async function setStartingBalance(page: Page, amount: string) {
  await openCards(page);
  await page
    .getByRole('group', { name: 'Your cards' })
    .getByRole('button', { name: /^Main account,/ })
    .click();
  await page
    .getByRole('group', { name: 'Card actions' })
    .getByRole('button', { name: 'Settings' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Edit card' });
  await dialog.getByLabel('Balance when added').fill(amount);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await goHome(page);
}

/** Adds an account of `kind` (its pill's word: Debit, Credit, Savings or Cash) on the Cards tab, then comes back to Home. */
export async function addAccount(
  page: Page,
  {
    name,
    kind,
    balance,
  }: { name: string; kind: 'Debit' | 'Credit' | 'Savings' | 'Cash'; balance: string },
) {
  await openCards(page);
  await page.getByRole('button', { name: 'Add a card' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a card' });
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('radio', { name: kind, exact: true }).check();
  await dialog.getByLabel('Current balance').fill(balance);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await goHome(page);
}

/**
 * Sets the salary in Settings' Profile & salary, as setup once asked for it, then comes back to Home.
 * It opens Settings by its address, a reload: not for a spec with a lock.
 */
export async function setSalary(
  page: Page,
  { amount, payDay }: { amount: string; payDay: string },
) {
  await page.goto('/settings');
  const profile = page.getByRole('region', { name: 'Profile & salary' });
  await profile.getByLabel('Monthly take-home pay').fill(amount);
  await profile.getByLabel('Pay day').selectOption(payDay);
  await profile.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await goHome(page);
}

/** First run → "Create an account" → setup with defaults → Home. Each test gets a fresh browser context. */
export async function startFresh(page: Page, path = '/') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await onboard(page);
  if (path !== '/') await page.goto(path);
}

/**
 * On a phone: Home from the tab bar, then Profile from the avatar there, which holds the menu the
 * tab bar has no room for. Returns the page, where its rows are.
 */
export async function openProfile(page: Page) {
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Home' })
    .click();
  await page.getByRole('link', { name: /^Profile, level \d+$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  return page.getByRole('main');
}

/** First run → "Try with demo money" → Home with the demo banner. */
export async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with demo money' }).click();
  await expect(page.getByText("You're exploring with demo money")).toBeVisible();
}
