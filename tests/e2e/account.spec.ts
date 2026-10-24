import { expect, test, type Page } from '@playwright/test';
import {
  addAccount,
  codeStep,
  createAccountStep,
  onboard,
  setOnline,
  setSalary,
  setStartingBalance,
} from './helpers';

// The build gets this token from playwright.config.ts.
const TOKEN = 'e2e-token';
/** The code the mock service "emails": the only one its sign-up takes. */
const CODE = '123456';
const ME = {
  username: 'Robin',
  email: 'robin@example.com',
  password: 'a long enough password',
  code: CODE,
};

type Stored = {
  authKey: string;
  wrappedPw: unknown;
  email: string;
  token: string;
  copy: { iv: string; ciphertext: string; version: number; savedAt: string } | null;
};
type Body = Record<string, unknown>;

/**
 * The account service, in memory, the way the real one answers: a code request for a free name
 * "mails" `CODE`, sign-up checks the name and then the code (only `CODE` makes the account) and keeps
 * the keys it is sent, uploads count up from 1, and a log-in checks the key, hands the phone a new
 * token and sends back the wrapped data key and the newest copy. `down` makes every call answer 503.
 */
async function mockAccountService(page: Page) {
  const accounts = new Map<string, Stored>();
  const seen: Array<{ route: string; method: string; body: Body | null }> = [];
  const state = { down: false };
  let tokens = 0;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const headers = request.headers();
    if (headers['x-funancial-token'] !== TOKEN) {
      return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    }
    const name = new URL(request.url()).pathname.split('/').pop() ?? '';
    const body = request.postDataJSON() as Body | null;
    seen.push({ route: name, method: request.method(), body });
    if (state.down) return route.fulfill({ status: 503, json: { error: 'unavailable' } });

    if (name === 'code') {
      if (accounts.has(String(body?.username))) {
        return route.fulfill({ status: 409, json: { error: 'taken' } });
      }
      return route.fulfill({ json: { ok: true } });
    }
    if (name === 'signup') {
      const who = String(body?.username);
      // The name first, as the real one does: a retried sign-up must hear "taken", not "wrong code".
      if (accounts.has(who)) return route.fulfill({ status: 409, json: { error: 'taken' } });
      if (body?.code !== CODE) return route.fulfill({ status: 401, json: { error: 'code' } });
      const token = `device-${++tokens}`;
      accounts.set(who, {
        authKey: String(body?.authKey),
        wrappedPw: body?.wrappedPw,
        email: String(body?.email),
        token,
        copy: null,
      });
      return route.fulfill({ json: { deviceToken: token } });
    }
    if (name === 'login') {
      const account = accounts.get(String(body?.username));
      if (!account || account.authKey !== body?.authKey) {
        return route.fulfill({ status: 401, json: { error: 'denied' } });
      }
      account.token = `device-${++tokens}`;
      return route.fulfill({
        json: {
          deviceToken: account.token,
          wrappedPw: account.wrappedPw,
          copy: account.copy,
          email: account.email,
        },
      });
    }
    if (name === 'copy' && request.method() === 'PUT') {
      const token = (headers['authorization'] ?? '').replace('Bearer ', '');
      const account = [...accounts.values()].find((a) => a.token === token);
      if (!account) return route.fulfill({ status: 401, json: { error: 'moved' } });
      const version = (account.copy?.version ?? 0) + 1;
      account.copy = {
        iv: String(body?.iv),
        ciphertext: String(body?.ciphertext),
        version,
        savedAt: new Date().toISOString(),
      };
      return route.fulfill({ json: { version, savedAt: account.copy.savedAt } });
    }
    if (name === 'forgot') return route.fulfill({ json: { ok: true } });
    return route.fulfill({ status: 404, json: { error: 'not found' } });
  });
  return { accounts, seen, state };
}

/** What the browser does when the app goes to the background: the app saves a copy at once. */
const sendToBackground = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

/** A new phone: nothing of the app's is left in the browser. */
async function wipePhone(page: Page) {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    // Each delete waits until the page lets go of the database, which the reload does.
    for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name);
  });
  await page.reload();
}

/**
 * Home shows the money set after setup: the $1,234.00 in Main account, which it shows by default,
 * and with the $5,000.00 in savings the whole of Net worth is $6,234.00.
 */
async function expectSetupMoney(page: Page) {
  await expect(page.getByRole('region', { name: 'Available balance' })).toContainText('$1,234.00');
  await expect(page.getByRole('region', { name: 'Net worth' })).toContainText('$6,234.00');
}

/**
 * An account made in setup, with its emailed code; then, as setup no longer asks for money, $1,234.00
 * in Main account, $5,000.00 in a Savings account and a salary, and its copy saved on the service;
 * then the phone is wiped, so the next thing the page shows is the welcome screen of a new phone.
 */
async function accountThenNewPhone(
  page: Page,
  service: Awaited<ReturnType<typeof mockAccountService>>,
) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await onboard(page, { account: ME });
  await setStartingBalance(page, '1,234');
  await addAccount(page, { name: 'Savings', kind: 'Savings', balance: '5000' });
  await setSalary(page, { amount: '4200', payDay: '25' });
  await expectSetupMoney(page);

  // A code was asked for the name and address, and the account made with it.
  expect(service.seen.filter((s) => s.route === 'code').map((s) => s.body)).toEqual([
    { username: 'robin', email: ME.email },
  ]);
  // The service heard the keys and a sealed copy, never the password or the data.
  const [signup] = service.seen.filter((s) => s.route === 'signup');
  expect(signup!.body).toMatchObject({ username: 'robin', email: ME.email, code: CODE });
  expect(JSON.stringify(service.seen)).not.toContain(ME.password);

  // The copy goes up when the app goes to the background: wait for the service to hold a newer one.
  const stored = () => service.accounts.get('robin')?.copy?.version ?? 0;
  const before = stored();
  await sendToBackground(page);
  await expect.poll(stored).toBeGreaterThan(before);

  await wipePhone(page);
  await expect(page.getByRole('button', { name: 'Create an account' })).toBeVisible();
}

test('an account made in setup brings the same data to a phone with nothing on it', async ({
  page,
}) => {
  const service = await mockAccountService(page);
  await accountThenNewPhone(page, service);
  await expect(page.getByRole('button', { name: 'I have an account' })).toBeVisible();
  await page.getByRole('button', { name: 'I have an account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
  // A screen reader is told about the screen that has just come up.
  await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeFocused();

  // A wrong password is turned away, and the phone is still empty.
  await page.getByLabel('Username').fill('robin');
  await page.getByLabel('Password', { exact: true }).fill('not the right one at all');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText("That username and password don't match.");

  await page.getByLabel('Password', { exact: true }).fill(ME.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();

  // The copy is on the phone; this phone asks for its own PIN.
  await expect(page.getByRole('heading', { level: 1, name: 'Lock this phone' })).toBeVisible();
  await page.getByLabel('Choose a PIN').fill('2468');
  await page.getByLabel('Confirm PIN').fill('2468');
  await page.getByRole('button', { name: 'Set PIN' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expectSetupMoney(page);

  // The PIN is the day-to-day lock from here on.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('PIN').fill('2468');
  await page.getByLabel('PIN').press('Enter');
  await expectSetupMoney(page);
});

test('someone who has started setup on a new phone can still log in to their account', async ({
  page,
}) => {
  const service = await mockAccountService(page);
  await accountThenNewPhone(page, service);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeHidden();

  await page.getByRole('button', { name: 'I already have an account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeFocused();
  // The step that is leaving stays a moment with fields of its own: use the one showing now.
  const showing = page.locator('[data-motion="current"]');
  await showing.getByLabel('Username').fill('Robin');
  await showing.getByLabel('Password', { exact: true }).fill(ME.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Lock this phone' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip the lock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expectSetupMoney(page);
});

test('setup offline offers Skip for now, and asks the service for nothing', async ({ page }) => {
  const service = await mockAccountService(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  // Online there is no way past the account.
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeHidden();

  await setOnline(page, false);
  await expect(
    page.getByText("You're offline. Create your account later in Settings."),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  // Past the account and its code, on to Currency and name.
  await expect(page.getByText('Step 3 of 4')).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your currency and name' }),
  ).toBeVisible();
  expect(service.seen).toEqual([]);
});

test('setup makes the account only with the emailed code, and turns a wrong one away', async ({
  page,
}) => {
  const service = await mockAccountService(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  await createAccountStep(page, ME);
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  await expect(
    page.getByText(`We sent a 6-digit code to ${ME.email}. Your account is made once you type it.`),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeFocused();

  await codeStep(page, '000000');
  await expect(page.getByRole('alert')).toHaveText(
    "That code isn't right. Check the email and try again.",
  );
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  expect(service.accounts.size).toBe(0);

  // The right one, pasted as the email shows it ("123 456"), takes the wrong one's place.
  const field = page.locator('[data-motion="current"]').getByLabel('Code', { exact: true });
  await field.evaluate((input, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    input.focus();
    input.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, '123 456');
  await expect(field).toHaveValue(CODE);
  // And put in whole by a keyboard (Gboard's suggestion from the clipboard), with no paste: the
  // browser alone would cut "123 456" to the field's six characters, "123 45".
  await field.fill('');
  await field.focus();
  await page.keyboard.insertText('123 456');
  await expect(field).toHaveValue(CODE);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your currency and name' }),
  ).toBeVisible();
  await expect(page.getByText('Step 3 of 4')).toBeVisible();
  expect([...service.accounts.keys()]).toEqual(['robin']);
  expect(service.seen.filter((s) => s.route === 'code')).toHaveLength(1);
  expect(service.seen.filter((s) => s.route === 'signup').map((s) => s.body?.code)).toEqual([
    '000000',
    CODE,
  ]);
});

test('a service that is down shows a calm line with Skip, and setup goes on once it answers', async ({
  page,
}) => {
  const service = await mockAccountService(page);
  service.state.down = true;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Username').fill(ME.username);
  await page.getByLabel('Email', { exact: true }).fill(ME.email);
  await page.getByLabel('Password', { exact: true }).fill(ME.password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByText(
      "Funcial's service isn't answering right now. You can make an account later in Settings.",
    ),
  ).toBeVisible();
  // A down service never blocks setup: the way on is there, and the form is as it was.
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
  await expect(page.getByLabel('Username')).toHaveValue(ME.username);

  service.state.down = false;
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
});

test('forgot password says the same line and asks the service once', async ({ page }) => {
  const service = await mockAccountService(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'I have an account' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Forgot password?' })).toBeVisible();

  await page.getByLabel('Username or email').fill('robin@example.com');
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.getByRole('status')).toHaveText(
    "If that account exists, we've emailed a link. It works for 30 minutes.",
  );
  expect(service.seen.filter((s) => s.route === 'forgot').map((s) => s.body)).toEqual([
    { who: 'robin@example.com' },
  ]);

  await page.getByRole('button', { name: 'Back to log in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
});

test.describe('the welcome screen and setup move', () => {
  test('rise in from below, line by line, over drifting colour', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const layer = page.locator('[data-motion="current"]');
    await expect(layer).toHaveCSS('animation-name', 'step-in-up');
    await expect(layer).toHaveCSS('animation-duration', '0.62s');
    await expect(layer.locator('> :nth-child(2)')).toHaveCSS('animation-delay', '0.08s');
    await expect(page.locator('[data-blob]').first()).toHaveCSS('animation-name', 'blob-drift');
    // Composited once, so a blurred shape is not repainted as it drifts.
    await expect(page.locator('[data-blob]').first()).toHaveCSS('will-change', 'transform');

    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page.locator('[data-motion="current"]')).toHaveCSS('animation-name', 'step-in-up');
    await expect(page.locator('[data-progress]')).toHaveCSS('transition-duration', '0.7s');
  });

  test('only fade for a person who asked for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const layer = page.locator('[data-motion="current"]');
    await expect(layer).toHaveCSS('animation-name', 'fade-in');
    await expect(layer.locator('> :nth-child(2)')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('[data-blob]').first()).toHaveCSS('animation-name', 'none');
    await expect(page.locator('[data-blob]').first()).toHaveCSS('will-change', 'auto');

    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page.locator('[data-motion="current"]')).toHaveCSS('animation-name', 'fade-in');
    await expect(page.locator('[data-progress]')).toHaveCSS('transition-duration', '0s');
  });
});
