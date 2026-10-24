import { expect, test, type Page } from '@playwright/test';
import { sha256 } from 'hash-wasm';
import { startDemo, startFresh } from './helpers';

// The build gets this token from playwright.config.ts.
const TOKEN = 'e2e-token';
const PASSWORD = 'a long enough password';
/** The code the mock service "emails": the only one its sign-up takes. */
const CODE = '123456';

type Seen = { method: string; route: string; body: Record<string, unknown> | null; auth: string };

/**
 * The account service, in memory: a code request "mails" `CODE`, sign-up answers with a device token
 * for that code alone, uploads count up from 1, and `refuseUploads` makes the next ones answer as an
 * account that moved to another phone does.
 */
async function mockAccountService(page: Page) {
  const seen: Seen[] = [];
  const state = { version: 0, refuseUploads: false };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const headers = request.headers();
    if (headers['x-funancial-token'] !== TOKEN) {
      return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    }
    const name = new URL(request.url()).pathname.split('/').pop() ?? '';
    seen.push({
      method: request.method(),
      route: name,
      body: request.postDataJSON() as Record<string, unknown> | null,
      auth: headers['authorization'] ?? '',
    });
    if (name === 'code') return route.fulfill({ json: { ok: true } });
    if (name === 'signup') {
      if (seen.at(-1)?.body?.code !== CODE) {
        return route.fulfill({ status: 401, json: { error: 'code' } });
      }
      return route.fulfill({ json: { deviceToken: 'device-token-1' } });
    }
    if (name === 'copy' && request.method() === 'PUT') {
      if (state.refuseUploads) return route.fulfill({ status: 401, json: { error: 'moved' } });
      state.version += 1;
      return route.fulfill({ json: { version: state.version, savedAt: new Date().toISOString() } });
    }
    if (name === 'copy' && request.method() === 'DELETE') return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404, json: { error: 'not found' } });
  });
  return { seen, state };
}

/** What the browser does when the app goes to the background: the app saves a copy at once. */
const sendToBackground = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

/** The account step of the Create-account sheet, typed and sent on: the sheet is then on its code step. */
async function accountStep(page: Page) {
  await page.getByRole('button', { name: 'Create account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create your account' });
  await dialog.getByLabel('Username').fill('Robin');
  await dialog.getByLabel('Email', { exact: true }).fill('robin@example.com');
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  const code = page.getByRole('dialog', { name: 'Check your email' });
  await expect(code).toBeVisible();
  return code;
}

async function createAccount(page: Page) {
  const dialog = await accountStep(page);
  await dialog.getByLabel('Code', { exact: true }).fill(CODE);
  await dialog.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('Your account is ready.')).toBeVisible();
}

test('the Home reminder leads to Settings, where an account is made and then turned off', async ({
  page,
}) => {
  const service = await mockAccountService(page);
  await startFresh(page);

  const ask = page.getByText('Make an account so you can move to a new phone and keep everything.');
  await expect(ask).toBeVisible();
  await page.getByRole('link', { name: 'Set up' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Account' })).toBeVisible();

  await createAccount(page);
  await expect(page.getByText('robin', { exact: true })).toBeVisible();
  await expect(page.getByText('robin@example.com')).toBeVisible();
  await expect(page.getByText(/Last copy saved/)).toBeVisible();

  // A code was asked for the name and address, and the account made with it.
  expect(service.seen.filter((s) => s.route === 'code').map((s) => s.body)).toEqual([
    { username: 'robin', email: 'robin@example.com' },
  ]);
  // The service heard the keys and the code, not the password, and the copy: sealed, from version 0.
  const [signup] = service.seen.filter((s) => s.route === 'signup');
  expect(signup!.body).toMatchObject({
    username: 'robin',
    email: 'robin@example.com',
    code: CODE,
  });
  expect(Object.keys(signup!.body!).sort()).toEqual(
    ['authKey', 'code', 'dek', 'email', 'username', 'wrappedPw'].sort(),
  );
  expect(JSON.stringify(signup!.body)).not.toContain(PASSWORD);
  // Argon2id (64 MiB, 3 passes) from the built app's own WASM gives what Node's Argon2id and HKDF
  // give for robin and PASSWORD (`independently` in api/_lib/accounts.test.ts), as the reset page does,
  // checked by its SHA-256 so the key, which looks like a real secret, is not in the repo.
  expect(await sha256(String(signup!.body!.authKey))).toBe(
    'cbac384a9a92fb4820f05b88b977ef5005c6ec975a37a89f0cb29a81fa9f7146',
  );
  const [upload] = service.seen.filter((s) => s.route === 'copy' && s.method === 'PUT');
  expect(upload!.auth).toBe('Bearer device-token-1');
  expect(upload!.body).toMatchObject({ baseVersion: 0 });
  expect(Object.keys(upload!.body!).sort()).toEqual(['baseVersion', 'ciphertext', 'iv']);
  expect(JSON.stringify(upload!.body)).not.toContain('Robin');

  // It does not ask again.
  await page.getByRole('link', { name: 'Home' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(ask).toBeHidden();

  // Still linked after a reload.
  await page.goto('/settings');
  await expect(page.getByText('robin', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Turn off and delete my copy' }).click();
  const confirm = page.getByRole('dialog', { name: 'Turn off and delete my copy?' });
  await confirm.getByRole('button', { name: 'Delete my copy' }).click();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  expect(
    service.seen.some((s) => s.method === 'DELETE' && s.auth === 'Bearer device-token-1'),
  ).toBe(true);
});

test('Create account in Settings makes the account only with the emailed code', async ({
  page,
}) => {
  const service = await mockAccountService(page);
  await startFresh(page, '/settings');
  const dialog = await accountStep(page);
  await expect(
    dialog.getByText(
      'We sent a 6-digit code to robin@example.com. Your account is made once you type it.',
    ),
  ).toBeVisible();
  // The tapped button is gone: the code takes the focus.
  await expect(dialog.getByLabel('Code', { exact: true })).toBeFocused();
  // And a screen reader moved there is told where the code went.
  await expect(dialog.getByLabel('Code', { exact: true })).toHaveAccessibleDescription(
    'We sent a 6-digit code to robin@example.com. Your account is made once you type it.',
  );

  // A wrong code is turned away on the code step; nothing is made.
  await dialog.getByLabel('Code', { exact: true }).fill('000000');
  await dialog.getByRole('button', { name: 'Verify' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    "That code isn't right. Check the email and try again.",
  );
  await expect(page.getByText('Your account is ready.')).toBeHidden();

  // Back keeps what was typed, and on again goes to the code already sent.
  await dialog.getByRole('button', { name: 'Back' }).click();
  const first = page.getByRole('dialog', { name: 'Create your account' });
  await expect(first.getByLabel('Username')).toHaveValue('Robin');
  await expect(first.getByLabel('Email', { exact: true })).toHaveValue('robin@example.com');
  await expect(first.getByLabel('Password', { exact: true })).toHaveValue(PASSWORD);
  await first.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog).toBeVisible();
  expect(service.seen.filter((s) => s.route === 'code')).toHaveLength(1);

  await dialog.getByLabel('Code', { exact: true }).fill(CODE);
  await dialog.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('Your account is ready.')).toBeVisible();
  await expect(page.getByText('robin', { exact: true })).toBeVisible();
  expect(service.seen.filter((s) => s.route === 'signup').map((s) => s.body?.code)).toEqual([
    '000000',
    CODE,
  ]);
});

test('logging out keeps the data, stops saving and leaves the service alone', async ({ page }) => {
  const service = await mockAccountService(page);
  await startFresh(page, '/settings');
  await createAccount(page);
  await expect(page.getByText(/Last copy saved/)).toBeVisible();
  await page.getByLabel('Name').fill('Robin Kept');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  const confirm = page.getByRole('dialog', { name: 'Log out on this phone?' });
  await expect(confirm).toContainText(
    "If you log in again later, your account's copy replaces what is on this phone.",
  );
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('robin', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await confirm.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByText('Logged out. Your data is still on this phone.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeHidden();

  // Still logged out after a reload, with the data in place, and nothing more goes up.
  const calls = service.seen.length;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveValue('Robin Kept');
  await sendToBackground(page);
  expect(service.seen).toHaveLength(calls);
  expect(service.seen.some((s) => s.method === 'DELETE')).toBe(false);

  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('dialog', { name: 'Log in' })).toBeVisible();
});

test('a phone whose account moved says so and keeps working', async ({ page }) => {
  const service = await mockAccountService(page);
  await startFresh(page, '/settings');
  await createAccount(page);

  service.state.refuseUploads = true;
  await page.getByLabel('Name').fill('Robin Changed');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await sendToBackground(page);

  await expect(page.getByText('Your account moved to another phone')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in again' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep using without an account' })).toBeVisible();

  // Home says so too, and leads back to the account.
  await page.getByRole('link', { name: 'Home' }).first().click();
  await expect(page.getByText("This phone isn't saving its copy any more")).toBeVisible();
  await page.getByRole('link', { name: 'Account settings' }).click();
  await expect(page.getByText('Your account moved to another phone')).toBeVisible();

  // The data stayed as the person left it.
  await page.reload();
  await expect(page.getByLabel('Name')).toHaveValue('Robin Changed');
  await page.getByRole('button', { name: 'Keep using without an account' }).click();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
});

test('the demo has no account section and no reminder, and never calls the service', async ({
  page,
}) => {
  const service = await mockAccountService(page);
  await startDemo(page);
  await expect(page.getByText('Make an account so you can move to a new phone')).toBeHidden();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Account' })).toBeHidden();
  await sendToBackground(page);
  expect(service.seen).toEqual([]);
});
