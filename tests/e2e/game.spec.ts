import { expect, test, type Page } from '@playwright/test';
import { startFresh } from './helpers';

/** The top line on Home: one link to the quests, named by its level, XP, streak and coins. */
const hud = (page: Page) => page.getByRole('link', { name: /^Level \d+,/ });

/** The Home "Quests" row for the daily logging quest. */
const logQuest = (page: Page) =>
  page.getByRole('listitem').filter({ hasText: "Log today's spending" });

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
  await expect(hud(page)).toHaveAttribute('aria-label', /Level 1, 80 of 100 XP/);
  await expect(hud(page)).toHaveAttribute('aria-label', /, 15 coins\. Open quests$/);
  await expect(hud(page).getByText('15', { exact: true })).toBeVisible();
  await expect(page.getByText('80 / 100 XP')).toHaveCount(0);

  await page.goto('/quests');
  const badges = page.getByRole('region', { name: 'Badges' });
  await expect(
    badges.getByRole('listitem').filter({ hasText: 'First Expense Logged' }),
  ).toContainText(/Earned /);
});

test('Nothing spent keeps the day', async ({ page }) => {
  await startFresh(page);
  await expect(hud(page)).toHaveAttribute('aria-label', /0-day streak/);

  await logQuest(page).getByRole('button', { name: 'Nothing spent' }).click();

  await expect(logQuest(page)).toContainText('Done');
  await expect(logQuest(page).getByRole('button', { name: 'Nothing spent' })).toHaveCount(0);
  await expect(hud(page)).toHaveAttribute('aria-label', /1-day streak/);
});

test('the shop refuses a purchase without enough coins', async ({ page }) => {
  await startFresh(page, '/shop');
  await expect(
    page.getByText("Coins are for fun. They can't be bought and have no money value."),
  ).toBeVisible();

  const ocean = page.getByRole('listitem').filter({ hasText: 'Ocean' });
  await expect(ocean.getByRole('button', { name: 'Buy Ocean' })).toBeDisabled();
  await expect(ocean.getByText('Not enough coins.')).toBeVisible();
});
