import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { openProfile, startDemo, startFresh } from './helpers';

/** Opens the Inbox as each layout lists it: on Profile on a phone, in the sidebar on desktop. */
async function openInbox(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name === 'mobile-chromium') {
    await (await openProfile(page)).getByRole('link', { name: /^Inbox/ }).click();
  } else {
    await page
      .getByRole('navigation', { name: 'All sections' })
      .getByRole('link', { name: /^Inbox/ })
      .click();
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
}

const newTab = (page: Page) => page.getByRole('button', { name: /^New \(\d+\)$/ });
const newCount = async (page: Page) =>
  Number((await newTab(page).textContent())?.match(/\d+/)?.[0]);

test('a new profile has nothing to catch up on', async ({ page }, testInfo) => {
  await startFresh(page);
  await openInbox(page, testInfo);
  await expect(
    page.getByText('Nothing here yet. Reminders you miss will show up here.'),
  ).toBeVisible();
  await expect(newTab(page)).toHaveText('New (0)');
  await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeHidden();
});

test('demo money: reminders that came due fill the inbox, one is read by opening it, the rest by Mark all as read', async ({
  page,
}, testInfo) => {
  await startDemo(page);
  await openInbox(page, testInfo);

  const rows = page.getByRole('main').getByRole('link');
  const total = await newCount(page);
  expect(total).toBeGreaterThan(0);
  await expect(rows).toHaveCount(total);

  await rows.first().click();
  await expect(page).not.toHaveURL(/\/inbox/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  await expect(newTab(page)).toHaveText(`New (${total - 1})`);

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(rows).toHaveCount(total);

  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(newTab(page)).toHaveText('New (0)');
  await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeHidden();
  await expect(rows).toHaveCount(total);
});
