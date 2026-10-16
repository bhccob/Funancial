import { expect, test, type Page } from '@playwright/test';
import { startDemo, startFresh } from './helpers';

// The build gets this token from playwright.config.ts, so the app asks its price service.
const TOKEN = 'e2e-token';

/** The local date `offset` days from today, as the app reads its own `today`. */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA');
}

/**
 * Answers the price service by the route in `/api/<route>`, as long as the app sends its token.
 * A route with no reply, such as `fx` for a holding in the profile currency, reads as not found.
 */
async function mockPriceService(page: Page, replies: Record<string, unknown>) {
  await page.route('**/api/**', (route) => {
    const request = route.request();
    if (request.headers()['x-funancial-token'] !== TOKEN) {
      return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    }
    const name = new URL(request.url()).pathname.split('/').pop() ?? '';
    return name in replies
      ? route.fulfill({ json: replies[name] })
      : route.fulfill({ status: 404, json: { error: 'not found' } });
  });
}

/** What the service says about a US stock: its profile, a quote at `price`, and no dividends. */
function usStock(symbol: string, name: string, price: number) {
  return {
    profile: { symbol, name, type: 'stock', exchange: 'NYQ', currency: 'USD', sector: null },
    quote: {
      quotes: [
        {
          symbol,
          name,
          price,
          previousClose: price,
          currency: 'USD',
          type: 'stock',
          exchange: 'NYQ',
          asOf: new Date().toISOString(),
        },
      ],
      missing: [],
    },
    dividends: {
      symbol,
      currency: 'USD',
      history: [],
      next: { exDate: null, payDate: null, amount: null },
    },
  };
}

/** Opens the add dialog on the empty Holdings tab and saves a holding the person already owns. */
async function addHolding(
  page: Page,
  symbol: string,
  shares: string,
  paid: string,
  bought?: string,
) {
  await page.getByRole('button', { name: 'Add your first holding' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a holding' });
  await dialog.getByLabel('Symbol').fill(symbol);
  await dialog.getByLabel('Shares').fill(shares);
  await dialog.getByLabel('What you paid in total').fill(paid);
  if (bought) await dialog.getByLabel('Purchase date').fill(bought);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Holding added.')).toBeVisible();
}

test('a new holding shows its value and a slice of the allocation', async ({ page }) => {
  await mockPriceService(page, usStock('AAPL', 'Apple', 200));
  await startFresh(page, '/invest');

  await addHolding(page, 'aapl', '5', '900');

  await expect(page.getByRole('button', { name: /^AAPL · Apple/ })).toContainText('$1,000.00');
  await expect(page.getByRole('button', { name: 'AAPL, $1,000.00, 100%' })).toHaveCount(1);
});

test('confirming a due dividend shows the reward and earns First Dividend', async ({ page }) => {
  await mockPriceService(page, {
    ...usStock('KO', 'Coca-Cola', 60),
    // Went ex 6 days ago and paid 3 days ago: due, on shares bought 30 days ago.
    dividends: {
      symbol: 'KO',
      currency: 'USD',
      history: [{ date: day(-6), amount: 0.53 }],
      next: { exDate: day(-6), payDate: day(-3), amount: 0.53 },
    },
  });
  await startFresh(page, '/invest');
  await addHolding(page, 'ko', '10', '500', day(-30));

  await page.getByRole('tab', { name: 'Dividends' }).click();
  await page.getByRole('region', { name: 'Due' }).getByRole('button', { name: 'Confirm' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm KO dividend' });
  await dialog.getByRole('radio', { name: 'Passive' }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect(page.getByText('Dividend confirmed.')).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Badge unlocked: First Dividend' }),
  ).toBeVisible();

  await page.goto('/quests');
  const badges = page.getByRole('region', { name: 'Badges' });
  await expect(badges.getByRole('listitem').filter({ hasText: 'First Dividend' })).toContainText(
    /Earned /,
  );
});

test('with the price service down, Invest shows the last prices and says so', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 502, json: { error: 'upstream' } }),
  );
  await startDemo(page);
  await page.goto('/invest');

  await expect(
    page.getByText("Couldn't reach the price service. Showing your last prices."),
  ).toBeVisible();
  await expect(page.getByText('Live prices need the price service.')).toHaveCount(0);
  // 40 VWRL at €118.40, in dollars at the stored 1.08.
  await expect(page.getByRole('button', { name: /^VWRL · / })).toContainText('$5,114.88');
  await expect(page.getByRole('region', { name: 'Portfolio value' })).toContainText('$15,995.31');
});
