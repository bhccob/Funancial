import { expect, type Page } from '@playwright/test';

export interface OnboardOptions {
  /**
   * Make this account in the first step; the account service must be mocked (the specs route every request to /api). Without it
   * the step is skipped the way an offline phone skips it, which asks the service for nothing.
   */
  account?: { username: string; email: string; password: string };
  /** Setup starts on the phone's currency, which is the test machine's; defaults to USD, chosen here. */
  currency?: string;
  cash?: string;
  savings?: string;
  /** Omit for "I don't have a regular salary". */
  salary?: { amount: string; payDay?: string };
  pin?: string;
}

const next = (page: Page) => page.getByRole('button', { name: 'Next' }).click();

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

/** Setup's first step, the way a phone with no connection takes it: "Skip for now". */
export async function skipAccount(page: Page) {
  await setOnline(page, false);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await setOnline(page, true);
}

/** Fills setup's account step and moves on. */
export async function createAccountStep(
  page: Page,
  { username, email, password }: NonNullable<OnboardOptions['account']>,
) {
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email (for "forgot password")').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await next(page);
}

/**
 * Walks the six setup steps (the account first), "You're all set", then Home. Defaults: no account
 * (skipped), zero balances, no salary, no cards, no lock.
 */
export async function onboard(page: Page, opts: OnboardOptions = {}) {
  if (opts.account) await createAccountStep(page, opts.account);
  else await skipAccount(page);
  await page.getByLabel('Currency').selectOption(opts.currency ?? 'USD');
  await next(page);
  await page.getByLabel('Cash & checking', { exact: true }).fill(opts.cash ?? '0');
  await page.getByLabel('Savings', { exact: true }).fill(opts.savings ?? '0');
  await next(page);
  if (opts.salary) {
    await page.getByLabel('Monthly take-home pay').fill(opts.salary.amount);
    if (opts.salary.payDay) await page.getByLabel('Pay day').selectOption(opts.salary.payDay);
  } else {
    await page.getByRole('switch', { name: "I don't have a regular salary" }).click();
  }
  await next(page);
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

/** First run → "Create an account" → setup with defaults → Home. Each test gets a fresh browser context. */
export async function startFresh(page: Page, path = '/') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await onboard(page);
  if (path !== '/') await page.goto(path);
}

/** First run → "Try with demo money" → Home with the demo banner. */
export async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with demo money' }).click();
  await expect(page.getByText("You're exploring with demo money")).toBeVisible();
}
