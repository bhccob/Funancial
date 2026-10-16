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
 * Symbol search finds nothing unless a test gives it a reply.
 */
async function mockPriceService(page: Page, replies: Record<string, unknown>) {
  await page.route('**/api/**', (route) => {
    const request = route.request();
    if (request.headers()['x-funancial-token'] !== TOKEN) {
      return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    }
    const name = new URL(request.url()).pathname.split('/').pop() ?? '';
    const answers: Record<string, unknown> = { search: { results: [] }, ...replies };
    return name in answers
      ? route.fulfill({ json: answers[name] })
      : route.fulfill({ status: 404, json: { error: 'not found' } });
  });
}

/**
 * What the service says about a US stock: a search hit, its profile, a quote at `price`, no
 * dividends, and closes that rise to `price` by today from 5% below it, a month apart.
 */
function usStock(symbol: string, name: string, price: number) {
  return {
    search: { results: [{ symbol, name, exchange: 'NASDAQ', type: 'stock' }] },
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
    history: {
      symbol,
      currency: 'USD',
      points: [-60, -30, 0].map((offset, i) => ({
        date: day(offset),
        close: price * (0.95 + i * 0.025),
      })),
    },
  };
}

/**
 * Opens the add dialog on the empty Holdings tab and saves a holding the person already owns. With
 * `search`, it types that and picks `symbol` from the list instead of typing the whole symbol.
 */
async function addHolding(
  page: Page,
  symbol: string,
  shares: string,
  paid: string,
  { bought, search }: { bought?: string; search?: string } = {},
) {
  await page.getByRole('button', { name: 'Add your first holding' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a holding' });
  if (search) {
    await dialog.getByRole('combobox', { name: 'Symbol' }).fill(search);
    await dialog.getByRole('option', { name: new RegExp(`^${symbol}`) }).click();
    await expect(dialog.getByLabel('Symbol')).toHaveValue(symbol);
    await expect(dialog.getByRole('listbox')).toBeHidden();
  } else {
    await dialog.getByLabel('Symbol').fill(symbol);
  }
  await dialog.getByLabel('Shares').fill(shares);
  await dialog.getByLabel('What you paid in total').fill(paid);
  if (bought) await dialog.getByLabel('Purchase date').fill(bought);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Holding added.')).toBeVisible();
}

test('a new holding shows its value and a slice of the allocation', async ({ page }) => {
  await mockPriceService(page, usStock('AAPL', 'Apple', 200));
  await startFresh(page, '/invest');

  await addHolding(page, 'AAPL', '5', '900', { search: 'appl' });

  await expect(page.getByRole('link', { name: /^AAPL · Apple/ })).toContainText('$1,000.00');
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
  await addHolding(page, 'ko', '10', '500', { bought: day(-30) });

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
  await expect(page.getByRole('link', { name: /^VWRL · / })).toContainText('$5,114.88');
  await expect(page.getByRole('region', { name: 'Portfolio value' })).toContainText('$15,995.31');
});

test('a holding opens on its own page with a price chart, and Edit saves back to it', async ({
  page,
}) => {
  await mockPriceService(page, usStock('AAPL', 'Apple', 200));
  await startFresh(page, '/invest');
  await addHolding(page, 'AAPL', '5', '900', { search: 'appl', bought: day(-60) });

  // Tapping the row opens the page, which asks for the closes since the purchase.
  const asked = page.waitForRequest(
    (r) => r.url().includes('/api/history') && r.url().includes(`from=${day(-60)}`),
  );
  await page.getByRole('link', { name: /^AAPL · Apple/ }).click();
  await asked;
  await expect(page).toHaveURL(/\/invest\/holding\/[\w-]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'AAPL' })).toBeVisible();
  await expect(page.getByText('Apple · NYQ')).toBeVisible();
  await expect(page.getByText('$1,000.00').first()).toBeVisible();
  const chart = page.getByRole('img', { name: /^From \$190\.00 on .* to \$200\.00 today$/ });
  await expect(chart).toBeVisible();
  await expect(chart.getByText('You bought · $180.00')).toBeVisible();

  // Touching the chart reads out a close.
  await chart.hover({ position: { x: 1, y: 40 } });
  await expect(page.getByText(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · \$190\.00$/)).toBeVisible();
  await expect(page.getByText('Bought on')).toBeVisible();

  // Edit opens the form; saving it leaves the person on the page, with the new figures.
  await page.getByRole('button', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit AAPL' });
  await dialog.getByLabel('Shares').fill('6');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Holding updated.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'AAPL' })).toBeVisible();
  await expect(page.getByText('$1,200.00').first()).toBeVisible();

  // And back to the list.
  await page.getByRole('link', { name: 'Back to Invest' }).click();
  await expect(page).toHaveURL(/\/invest\?tab=holdings$/);
  await expect(page.getByRole('link', { name: /^AAPL · Apple/ })).toContainText('$1,200.00');
});

test('Invest can be shown in another currency while the rest of the app keeps the profile currency', async ({
  page,
}) => {
  await mockPriceService(page, {
    ...usStock('AAPL', 'Apple', 200),
    // One euro is worth two dollars, so a dollar is half a euro.
    fx: { from: 'USD', to: 'EUR', rate: 0.5, asOf: new Date().toISOString() },
  });
  await startFresh(page, '/invest');
  await addHolding(page, 'AAPL', '5', '900', { search: 'appl', bought: day(-60) });
  await expect(page.getByRole('link', { name: /^AAPL · Apple/ })).toContainText('$1,000.00');

  // The chip opens a sheet: the app's own currency is named, and is the one that is ticked.
  await page.getByRole('button', { name: 'Shown in USD' }).click();
  const sheet = page.getByRole('dialog', { name: 'Show Invest in' });
  await expect(
    sheet.getByRole('button', { name: /^USD · .* \(your app currency\)$/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    sheet.getByText(
      "Only Invest changes. Home, Budget and your balances stay in USD. Invest converts at today's rate, so your gain % stays the same.",
    ),
  ).toBeVisible();
  await sheet.getByRole('button', { name: /^EUR · / }).click();

  // The rate arrives straight away: $1,000.00 is €500.00, and the gain keeps its percentage.
  await expect(page.getByRole('button', { name: 'Shown in EUR' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Portfolio value' })).toContainText('€500.00');
  await expect(page.getByRole('link', { name: /^AAPL · Apple/ })).toContainText('€500.00');
  await expect(page.getByRole('link', { name: /^AAPL · Apple/ })).toContainText('▲ 11.1%');
  await expect(page.getByText(/until a EUR rate loads/)).toHaveCount(0);

  // A holding's page and its chart follow, and the form still takes what was paid in dollars.
  await page.getByRole('link', { name: /^AAPL · Apple/ }).click();
  await expect(page.getByText('€500.00').first()).toBeVisible();
  await expect(page.getByText('€450.00').first()).toBeVisible();
  await expect(
    page.getByRole('img', { name: /^From €95\.00 on .* to €100\.00 today$/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Edit AAPL' }).getByLabel('What you paid in total'),
  ).toHaveValue('900.00');
  await page
    .getByRole('dialog', { name: 'Edit AAPL' })
    .getByRole('button', { name: 'Cancel' })
    .click();

  // The choice is kept, and nothing outside Invest turned into euros.
  await page.goto('/invest');
  await expect(page.getByRole('button', { name: 'Shown in EUR' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(page.getByText('€')).toHaveCount(0);

  // And back: picking the app's own currency is picking nothing at all.
  await page.goto('/invest');
  await page.getByRole('button', { name: 'Shown in EUR' }).click();
  await page
    .getByRole('dialog', { name: 'Show Invest in' })
    .getByRole('button', { name: /\(your app currency\)$/ })
    .click();
  await expect(page.getByRole('button', { name: 'Shown in USD' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^AAPL · Apple/ })).toContainText('$1,000.00');
});
