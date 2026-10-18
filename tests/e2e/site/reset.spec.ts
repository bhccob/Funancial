import { expect, test, type Page } from '@playwright/test';

const TOKEN = 'T'.repeat(43);
const PASSWORD = 'a brand new password';

/**
 * Plays the service: `POST /api/reset` with `{ token }` names the account, and with the new keys too
 * takes them. `posts` are the ones with keys; `requests` is every call, as method, URL and body.
 */
async function serveReset(page: Page, info: { status: number; body?: object }, change = 204) {
  const posts: Array<{ headers: Record<string, string>; body: string }> = [];
  const requests: string[] = [];
  await page.route('**/api/reset**', (route) => {
    const request = route.request();
    const body = request.postData() ?? '';
    requests.push(`${request.method()} ${request.url()} ${body}`);
    if (body.includes('newAuthKey')) {
      posts.push({ headers: request.headers(), body });
      return route.fulfill({ status: change });
    }
    return route.fulfill({ status: info.status, json: info.body });
  });
  return { posts, requests };
}

test('a friend chooses a new password from the emailed link', async ({ page }) => {
  const { posts, requests } = await serveReset(page, { status: 200, body: { username: 'ada' } });
  // Every request the page makes, the page itself first: the fragment is never in one.
  const sentUrls: string[] = [];
  page.on('request', (request) => sentUrls.push(request.url()));
  await page.goto(`/reset#token=${TOKEN}`);
  await expect(page).toHaveTitle('Choose a new password');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('heading', { name: 'Choose a new password for ada' })).toBeVisible();
  // The token was read, and is out of the address bar.
  expect(new URL(page.url()).pathname).toBe('/reset');
  expect(page.url()).not.toContain(TOKEN);

  await page.getByLabel('New password').fill(PASSWORD);
  await page.getByLabel('Type it again').fill(PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(
    page.getByText('Your password is changed. Log in on your phone with the new one.'),
  ).toBeVisible();

  // The built page sent the keys it derived, and no shared token or password.
  expect(posts).toHaveLength(1);
  const sent = JSON.parse(posts[0]!.body) as Record<string, string>;
  expect(Object.keys(sent).sort()).toEqual(['kek', 'newAuthKey', 'token']);
  expect(sent.token).toBe(TOKEN);
  // Argon2id (64 MiB, 3 passes) from the built page's own WASM gives what Node's Argon2id and HKDF
  // give for ada and this password (`independently` in api/_lib/accounts.test.ts), as the app does.
  expect(sent.newAuthKey).toBe('lZxv41bid5O0MjkLF1yeGhyvPux4SnnbRdw+3PaAiq4=');
  expect(sent.kek).toBe('rVlb6vjMQaTT2CAzWvIHDx4oZlpcOTTaQSp1gApAqCs=');
  expect(posts[0]!.headers['x-funancial-token']).toBeUndefined();
  expect(posts[0]!.body).not.toContain(PASSWORD);

  // Whose link it was went as a POST body too: no request to the service had the token in its URL.
  expect(requests[0]).toBe(`POST ${new URL('/api/reset', page.url())} {"token":"${TOKEN}"}`);
  for (const request of requests) expect(request.split(' ')[1]).not.toContain(TOKEN);
  expect(sentUrls[0]).toBe(new URL('/reset', page.url()).href);
  for (const url of sentUrls) expect(url).not.toContain(TOKEN);
});

test('still opens a link sent before, with the token in its query, and clears it', async ({
  page,
}) => {
  const { requests } = await serveReset(page, { status: 200, body: { username: 'ada' } });
  await page.goto(`/reset?token=${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Choose a new password for ada' })).toBeVisible();
  expect(page.url()).toBe(new URL('/reset', page.url()).href);
  expect(requests[0]).toBe(`POST ${new URL('/api/reset', page.url())} {"token":"${TOKEN}"}`);
});

test('asks for a password of 10 characters that is typed twice', async ({ page }) => {
  const { posts } = await serveReset(page, { status: 200, body: { username: 'ada' } });
  await page.goto(`/reset#token=${TOKEN}`);
  await page.getByLabel('New password').fill('too short');
  await page.getByLabel('Type it again').fill('too short');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('alert')).toHaveText('Use at least 10 characters.');

  await page.getByLabel('New password').fill(PASSWORD);
  await page.getByLabel('Type it again').fill(`${PASSWORD}?`);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('alert')).toHaveText("The two passwords don't match.");
  expect(posts).toHaveLength(0);
});

test('says an old link has expired', async ({ page }) => {
  await serveReset(page, { status: 410, body: { error: 'gone' } });
  await page.goto(`/reset#token=${TOKEN}`);
  await expect(
    page.getByText('This link has expired. Ask for a new one in the app.'),
  ).toBeVisible();
  await expect(page.getByLabel('New password')).toBeHidden();
});

test('asks to open the emailed link again when the address has no token, as after a reload', async ({
  page,
}) => {
  await serveReset(page, { status: 200, body: { username: 'ada' } });
  await page.goto('/reset');
  await expect(
    page.getByText('Open the link in your email again to choose a new password.'),
  ).toBeVisible();
  await expect(page.getByLabel('New password')).toBeHidden();
});

test('fits a phone, with fields and a button a thumb can hit', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await serveReset(page, { status: 200, body: { username: 'ada' } });
  await page.goto(`/reset#token=${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Choose a new password for ada' })).toBeVisible();

  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(wide).toBe(false);
  for (const target of [
    page.getByLabel('New password'),
    page.getByLabel('Type it again'),
    page.getByRole('button', { name: 'Change password' }),
  ]) {
    expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
});
