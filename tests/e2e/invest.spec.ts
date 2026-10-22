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
 * Opens the add dialog on the empty Holdings tab and saves a holding the person already owns:
 * `shares` of it at `price` each, on average. The shares are typed one short and the stepper adds the
 * last one. With `search`, it types that and picks `symbol` from the list instead of typing the whole symbol.
 */
async function addHolding(
  page: Page,
  symbol: string,
  shares: string,
  price: string,
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
  // `exact`: the stepper's buttons (Fewer shares, More shares) have "shares" in their labels too.
  await dialog.getByLabel('Shares', { exact: true }).fill(String(Number(shares) - 1));
  await dialog.getByRole('button', { name: 'More shares' }).click();
  await expect(dialog.getByLabel('Shares', { exact: true })).toHaveValue(shares);
  await dialog.getByLabel('Price per share (your average)').fill(price);
  // The total is made live from the two.
  await expect(dialog.getByText('Total paid')).toBeVisible();
  if (bought) await dialog.getByLabel('Purchase date').fill(bought);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Holding added.')).toBeVisible();
}

test('a new holding shows its value and a slice of the allocation', async ({ page }) => {
  await mockPriceService(page, usStock('AAPL', 'Apple', 200));
  await startFresh(page, '/invest');

  await addHolding(page, 'AAPL', '5', '180', { search: 'appl' });

  await expect(page.getByRole('link', { name: /^AAPL · Apple/ })).toContainText('$1,000.00');
  await expect(page.getByRole('button', { name: 'AAPL, $1,000.00, 100%' })).toHaveCount(1);
  // With a holding, the one add button is the pill in the Portfolio value row.
  await expect(
    page
      .getByRole('region', { name: 'Portfolio value' })
      .getByRole('button', { name: 'Add a holding' }),
  ).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Add a holding' })).toHaveCount(1);
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
  await addHolding(page, 'ko', '10', '50', { bought: day(-30) });

  await page.getByRole('tab', { name: 'Dividends' }).click();
  await page.getByRole('region', { name: 'Due' }).getByRole('button', { name: 'Confirm' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm KO dividend' });
  // Where it went is a select of the accounts it can arrive in, then Reinvest.
  const to = dialog.getByLabel('Where did it go?');
  await expect(to.locator('option')).toHaveText(['Main account', 'Savings', 'Reinvest']);
  await to.selectOption({ label: 'Savings' });
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
  // After the demo's sale of 5 of the 12 AAPL shares: $15,995.31 less 5 × $228.50.
  await expect(page.getByRole('region', { name: 'Portfolio value' })).toContainText('$14,852.81');
});

// A 1x1 PNG, the logo the mocked price service gives every company.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test("the pie stands each holding's logo outside its ring, and every list starts with one", async ({
  page,
}) => {
  const logoRequests: string[] = [];
  await page.route('**/api/**', (route) => {
    const request = route.request();
    if (!request.url().includes('/api/logo')) {
      return route.fulfill({ status: 502, json: { error: 'upstream' } });
    }
    logoRequests.push(new URL(request.url()).searchParams.get('symbol') ?? '');
    // An <img> sends no token; the app fetches the picture itself and must send it.
    return request.headers()['x-funancial-token'] === TOKEN
      ? route.fulfill({ contentType: 'image/png', body: PIXEL })
      : route.fulfill({ status: 401, json: { error: 'unauthorized' } });
  });
  await startDemo(page);
  await page.goto('/invest');

  const pie = page.getByRole('group', { name: 'All holdings' });
  const labels = pie.locator('[data-label]');
  await expect(labels).toHaveCount(4);
  // Four holdings: four on the pie, four in the legend, four in the rows, from four requests.
  await expect(page.locator('[data-logo] img')).toHaveCount(12);
  expect(logoRequests.sort()).toEqual(['AAPL', 'ASML', 'KO', 'VWRL']);
  expect((await pie.locator('svg').first().boundingBox())?.width).toBe(220);

  // Each label is on the screen, and the page does not scroll sideways to reach one.
  const width = page.viewportSize()!.width;
  for (const box of await labels.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().toJSON() as { left: number; right: number }),
  )) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
});

test('a holding opens on its own page with a price chart, and Edit saves back to it', async ({
  page,
}) => {
  await mockPriceService(page, usStock('AAPL', 'Apple', 200));
  await startFresh(page, '/invest');
  await addHolding(page, 'AAPL', '5', '180', { search: 'appl', bought: day(-60) });

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
  // Break-even sits under the chart: $180.00 paid a share, $200.00 now.
  await expect(page.getByText('$180.00 break-even')).toBeVisible();
  await expect(page.getByText('now $200.00')).toBeVisible();
  await expect(page.getByText('$20.00 per share above break-even.')).toBeVisible();

  // Edit opens the form; saving it leaves the person on the page, with the new figures.
  await page.getByRole('button', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit AAPL' });
  await dialog.getByLabel('Shares', { exact: true }).fill('6');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Holding updated.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'AAPL' })).toBeVisible();
  await expect(page.getByText('$1,200.00').first()).toBeVisible();

  // And back to the Invest it came from.
  await page.getByRole('link', { name: 'Back to Invest' }).click();
  await expect(page).toHaveURL(/\/invest$/);
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
  await addHolding(page, 'AAPL', '5', '180', { search: 'appl', bought: day(-60) });
  await expect(page.getByRole('link', { name: /^AAPL · Apple/ })).toContainText('$1,000.00');

  // The chip opens a sheet: the app's own currency is named, and is the one that is ticked.
  await page.getByRole('button', { name: 'Shown in USD' }).click();
  const sheet = page.getByRole('dialog', { name: 'Show Invest in' });
  await expect(
    sheet.getByRole('radio', { name: /^USD · .* \(your app currency\)$/ }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    sheet.getByText(
      "Only Invest changes. Home, Budget and your balances stay in USD. Invest converts at today's rate, so your gain % stays the same.",
    ),
  ).toBeVisible();
  await sheet.getByRole('radio', { name: /^EUR · / }).click();

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
    page.getByRole('dialog', { name: 'Edit AAPL' }).getByLabel('Price per share (your average)'),
  ).toHaveValue('180.00');
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
    .getByRole('radio', { name: /\(your app currency\)$/ })
    .click();
  await expect(page.getByRole('button', { name: 'Shown in USD' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^AAPL · Apple/ })).toContainText('$1,000.00');
});

test('selling part of a holding shows in History, and deleting it there gives the shares back; profit & loss stays hidden after a reload; the pie switches to ETFs', async ({
  page,
}) => {
  // The demo: 40 VWRL shares (an ETF), and AAPL and KO, with an earlier sale of 5 AAPL.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 502, json: { error: 'upstream' } }),
  );
  await startDemo(page);
  await page.goto('/invest');

  // Sell 10 of the 40 VWRL shares, from its page: 9, and the stepper adds one.
  await page.getByRole('link', { name: /^VWRL · / }).click();
  await page.getByRole('button', { name: 'Sell', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sell VWRL' });
  await dialog.getByLabel('Shares to sell · of 40').fill('9');
  await dialog.getByRole('button', { name: 'More shares' }).click();
  await expect(dialog.getByText('30 shares stay.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Sell 10 shares' }).click();
  await expect(page.getByText('Sold 10 VWRL.')).toBeVisible();
  await expect(dialog).toBeHidden();
  // The person stays on the page, and the holding is down to 30 shares.
  await expect(page).toHaveURL(/\/invest\/holding\/[\w-]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'VWRL' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Invest' }).click();
  await expect(page.getByRole('link', { name: /^VWRL · / })).toContainText('30 shares');

  // History has the sale, dated today.
  await page.goto('/history');
  await expect(page.getByText('Sold 10 VWRL')).toBeVisible();

  // Deleting it there undoes it: the 10 shares go back to the holding.
  await page.getByRole('button', { name: 'Delete Sold 10 VWRL' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this entry?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByText('Sold 10 VWRL')).toBeHidden();
  await page.goto('/invest');
  await expect(page.getByRole('link', { name: /^VWRL · / })).toContainText('40 shares');

  // Hide profit & loss: only its header is left, and it is still hidden after a reload.
  await page.goto('/invest');
  const pnl = page.getByRole('region', { name: 'Profit & loss · all time' });
  await expect(pnl.getByText('From sales')).toBeVisible();
  await pnl.getByRole('button', { name: 'Hide' }).click();
  await expect(pnl.getByRole('button', { name: 'Show' })).toHaveAttribute('aria-expanded', 'false');
  await expect(pnl.getByText('From sales')).toBeHidden();
  await page.reload();
  await expect(pnl.getByRole('button', { name: 'Show' })).toBeVisible();
  await expect(pnl.getByText('From sales')).toBeHidden();

  // The pie starts on All and switches to just the ETFs (the one, VWRL), kept in the address.
  const choices = page.getByRole('group', { name: 'Allocation' });
  await expect(choices.getByRole('button', { name: 'All' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: /^AAPL, / })).toHaveCount(1);
  await choices.getByRole('button', { name: 'ETFs' }).click();
  await expect(page).toHaveURL(/\?pie=etfs$/);
  await expect(page.getByRole('group', { name: 'ETFs' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^VWRL, / })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^AAPL, / })).toHaveCount(0);
});

test('mobile: tapping an Allocation chip keeps your place on the page', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only');
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 502, json: { error: 'upstream' } }),
  );
  await startDemo(page);
  await page.goto('/invest');

  // The chips are brought to the top of the screen, so a jump to the page's top would put the pie out of sight.
  const choices = page.getByRole('group', { name: 'Allocation' });
  await choices.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);

  await choices.getByRole('button', { name: 'Stocks' }).click();
  await expect(page).toHaveURL(/\?pie=stocks$/);
  await expect(page.getByRole('group', { name: 'Stocks' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
});
