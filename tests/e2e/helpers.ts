import { expect, type Page } from '@playwright/test';

export interface OnboardOptions {
  cash?: string;
  savings?: string;
  /** Omit for "I don't have a regular salary". */
  salary?: { amount: string; payDay?: string };
  pin?: string;
}

const next = (page: Page) => page.getByRole('button', { name: 'Next' }).click();

/** Walks the six onboarding steps, then waits for Home. Defaults: zero balances, no salary, no cards, no lock. */
export async function onboard(page: Page, opts: OnboardOptions = {}) {
  await page.getByRole('checkbox', { name: 'I understand' }).check();
  await next(page);
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
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
}

/** First run → "Start with my real data" → onboarding with defaults → Home. Each test gets a fresh browser context. */
export async function startFresh(page: Page, path = '/') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with my real data' }).click();
  await onboard(page);
  if (path !== '/') await page.goto(path);
}

/** First run → "Try with demo money" → Home with the demo banner and the level-up dialog dismissed. */
export async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with demo money' }).click();
  await expect(page.getByText("You're using demo money.")).toBeVisible();
  // The first settle celebrates the seeded history, and the modal dialog holds the page inert.
  const levelUp = page.getByRole('dialog', { name: /^Level \d+$/ });
  await levelUp.getByRole('button', { name: 'Nice' }).click();
  await expect(levelUp).toBeHidden();
}
