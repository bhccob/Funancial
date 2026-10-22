import { expect, test, type Page } from '@playwright/test';
import { startFresh } from './helpers';

/** The top line on Home: the avatar opens Profile and names the level. */
const avatar = (page: Page) => page.getByRole('link', { name: /^Profile, level \d+$/ });

/** The Quests page's row for the daily logging quest. */
const logQuest = (page: Page) =>
  page
    .getByRole('region', { name: 'Quests' })
    .getByRole('listitem')
    .filter({ hasText: "Log today's spending" });

/** The Quests page's logging streak: "Start a new streak today." until it runs, then "N days". */
const loggingStreak = (page: Page) =>
  page
    .getByRole('region', { name: 'Streaks' })
    .getByRole('listitem')
    .filter({ hasText: 'Daily logging' });

test('the first expense pays XP, completes the daily quest and earns a badge', async ({ page }) => {
  await startFresh(page, '/add');
  await page.getByLabel('Amount', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText('Expense saved.')).toBeVisible();
  await expect(
    page.getByRole('status').filter({
      hasText: "Quest complete: Log today's spending · +20 XP · +5 coins",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Badge unlocked: First Expense Logged' }),
  ).toBeVisible();

  // 10 (logging) + 20 (quest) + 50 (badge) XP, and 5 + 10 coins.
  await page.goto('/');
  await expect(avatar(page)).toHaveAttribute('aria-label', 'Profile, level 1');
  await expect(page.getByText('80 / 100 XP')).toHaveCount(0);

  // The XP and the coins are on Profile, on the level bar under the avatar's page title.
  await avatar(page).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Level progress' })).toHaveAttribute(
    'aria-valuetext',
    '80 of 100 XP',
  );
  await expect(page.getByText('80 / 100 XP')).toBeVisible();
  await expect(page.getByText('15 coins', { exact: true })).toBeVisible();

  await page.goto('/quests');
  const badges = page.getByRole('region', { name: 'Badges' });
  await expect(
    badges.getByRole('listitem').filter({ hasText: 'First Expense Logged' }),
  ).toContainText(/Earned /);
});

test('the monthly backup quest is not offered, among the quests or in How to earn', async ({
  page,
}) => {
  await startFresh(page, '/quests');
  await expect(logQuest(page)).toBeVisible();
  await expect(page.getByText('Back up your data')).toHaveCount(0);

  const howTo = page.getByRole('region', { name: 'How to earn' });
  await expect(howTo.getByText(/^Audit your subscriptions/)).toBeVisible();
  await expect(page.getByText('Back up your data')).toHaveCount(0);
});

test('Nothing spent keeps the day', async ({ page }) => {
  await startFresh(page, '/quests');
  await expect(loggingStreak(page)).toContainText('Start a new streak today.');

  await logQuest(page).getByRole('button', { name: 'Nothing spent' }).click();

  await expect(logQuest(page)).toContainText('Done');
  await expect(logQuest(page).getByRole('button', { name: 'Nothing spent' })).toHaveCount(0);
  await expect(loggingStreak(page)).toContainText('1 day');
});

test('the shop refuses a purchase without enough coins', async ({ page }) => {
  await startFresh(page, '/shop');
  await expect(
    page.getByText("Coins are for fun. They can't be bought and have no money value."),
  ).toBeVisible();

  const sky = page.getByRole('listitem').filter({ hasText: 'Sunny Sky' });
  await expect(sky.getByRole('button', { name: 'Buy Sunny Sky' })).toBeDisabled();
  await expect(sky.getByText('Not enough coins.')).toBeVisible();
});
