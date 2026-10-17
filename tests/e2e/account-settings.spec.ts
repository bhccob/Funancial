import { expect, test, type Page } from '@playwright/test';
import { startDemo, startFresh } from './helpers';

// The build gets this token from playwright.config.ts.
const TOKEN = 'e2e-token';
const PASSWORD = 'a long enough password';

type Seen = { method: string; route: string; body: Record<string, unknown> | null; auth: string };

/**
 * The account service, in memory: sign-up answers with a device token, uploads count up from 1, and
 * `refuseUploads` makes the next ones answer as an account that moved to another phone does.
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
    if (name === 'signup') return route.fulfill({ json: { deviceToken: 'device-token-1' } });
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

async function createAccount(page: Page) {
  await page.getByRole('button', { name: 'Create account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create your account' });
  await dialog.getByLabel('Username').fill('Robin');
  await dialog.getByLabel('Email (for "forgot password")').fill('robin@example.com');
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Create account' }).click();
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

  // The service heard the keys, not the password, and the copy: sealed, from version 0.
  const [signup] = service.seen.filter((s) => s.route === 'signup');
  expect(signup!.body).toMatchObject({ username: 'robin', email: 'robin@example.com' });
  expect(Object.keys(signup!.body!).sort()).toEqual(
    ['authKey', 'dek', 'email', 'username', 'wrappedPw'].sort(),
  );
  expect(JSON.stringify(signup!.body)).not.toContain(PASSWORD);
  // Argon2id (64 MiB, 3 passes) from the built app's own WASM gives what Node's Argon2id and HKDF
  // give for robin and PASSWORD (`independently` in src/data/accountCrypto.test.ts), as the reset page does.
  expect(signup!.body!.authKey).toBe('Vj0qBrtPRpdyMcSA5NoTGNqLuly/M1fklymvThxkE/s=');
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
