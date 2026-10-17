import { expect, test, type Page } from '@playwright/test';

const LATEST = {
  versionCode: 8,
  versionName: '0.8',
  notes: 'First release for friends.',
  apkUrl: 'https://funancial.vercel.app/get/funancial-0.8.apk',
  sha256: 'a'.repeat(63) + '0',
  size: 9_437_184,
};

const PIXEL =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** Serves `latest.json` as the release script writes it, or with the status/body given. */
async function serveLatest(
  page: Page,
  answer: { status: number; body?: string } | object = LATEST,
) {
  await page.route('**/get/latest.json', (route) =>
    'status' in answer
      ? route.fulfill({ status: answer.status, contentType: 'application/json', body: answer.body })
      : route.fulfill({ json: answer }),
  );
}

/** The compact button under the title. */
const heroLink = (page: Page) => page.locator('.hero').getByRole('link');
/** The full download block at the end of the page. */
const downloadLink = (page: Page) =>
  page.locator('#download').getByRole('link', { name: 'Download for Android' });
const comingSoon = (page: Page) => page.getByRole('button', { name: 'Coming soon' });

/** The lowest contrast ratio between the CSS colour `color` and any pixel of the PNG. */
function lowestContrast(page: Page, png: Buffer, color: string) {
  return page.evaluate(
    async ({ base64, color }) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + base64;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const g = canvas.getContext('2d')!;
      g.drawImage(image, 0, 0);
      const channel = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const [r, gr, b] = color.match(/\d+/g)!.map(Number);
      const text = luminance(r!, gr!, b!);
      const { data } = g.getImageData(0, 0, canvas.width, canvas.height);
      let lowest = Infinity;
      for (let i = 0; i < data.length; i += 4) {
        const back = luminance(data[i]!, data[i + 1]!, data[i + 2]!);
        lowest = Math.min(lowest, (Math.max(back, text) + 0.05) / (Math.min(back, text) + 0.05));
      }
      return lowest;
    },
    { base64: png.toString('base64'), color },
  );
}

test('keeps itself out of search engines', async ({ page }) => {
  await serveLatest(page);
  await page.goto('/get');
  await expect(page).toHaveTitle('Funancial');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('tells the story in plain sections, and what the app asks for', async ({ page }) => {
  await serveLatest(page);
  await page.goto('/get');
  await expect(page.getByRole('heading', { level: 1, name: 'Funancial' })).toBeVisible();
  await expect(page.getByText('A budget app that stays on your phone.')).toBeVisible();
  for (const caption of [
    'See what you can still spend.',
    'Limits that tap you on the shoulder.',
    'Ask before you buy.',
    'Level up as you go.',
    'Safe and simple',
  ]) {
    await expect(page.getByRole('heading', { name: caption })).toBeVisible();
  }
  await expect(page.getByText('First release for friends.')).toBeVisible();
  for (const permission of [
    'INTERNET',
    'POST_NOTIFICATIONS',
    'RECEIVE_BOOT_COMPLETED',
    'USE_BIOMETRIC',
  ]) {
    await expect(page.locator(`[data-permission~="${permission}"]`)).toBeVisible();
  }
});

test('shows the install steps', async ({ page }) => {
  await serveLatest(page);
  await page.goto('/get');
  const steps = page.getByRole('listitem').filter({ hasText: /^(Tap|If Android)/ });
  await expect(steps).toHaveText([
    'Tap Download, then open the file.',
    'If Android asks, allow your browser to install apps.',
    'Tap Install, open Funancial, and try demo money first.',
  ]);
  await expect(steps.first()).toBeVisible();
});

test.describe('on an Android phone', () => {
  test.use({ userAgent: PIXEL });

  test('offers the download, with the version and size', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toHaveAttribute('href', LATEST.apkUrl);
    await expect(page.getByText('Version 0.8 · 9.4 MB')).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR code for this page' })).toBeHidden();
  });

  test('puts a download button in the first screen, at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await serveLatest(page);
    await page.goto('/get');
    await expect(heroLink(page)).toHaveText('Download for Android');
    await expect(heroLink(page)).toHaveAttribute('href', LATEST.apkUrl);
    const box = await heroLink(page).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(812);
  });

  test('shows "Coming soon" at the top while latest.json is on its way', async ({ page }) => {
    let answer!: () => void;
    const arrived = new Promise<void>((resolve) => (answer = resolve));
    await page.route('**/get/latest.json', async (route) => {
      await arrived;
      await route.fulfill({ json: LATEST });
    });
    await page.goto('/get');
    await expect(comingSoon(page).first()).toBeDisabled();
    await expect(heroLink(page)).toHaveCount(0);
    answer();
    await expect(heroLink(page)).toHaveAttribute('href', LATEST.apkUrl);
    await expect(comingSoon(page)).toHaveCount(0);
  });

  test('reaches both download buttons by keyboard, with a visible focus ring', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toBeVisible();
    for (const link of [heroLink(page), downloadLink(page)]) {
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      const ring = await link.evaluate((el) => {
        const style = getComputedStyle(el);
        return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      expect(ring.style).not.toBe('none');
      expect(ring.width).toBeGreaterThanOrEqual(2);
    }
  });

  test('has download buttons of at least 44px', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toBeVisible();
    for (const link of [heroLink(page), downloadLink(page)]) {
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('says "Coming soon" on disabled buttons while there is no release', async ({ page }) => {
    await serveLatest(page, { status: 404, body: 'Not found' });
    await page.goto('/get');
    await expect(comingSoon(page)).toHaveCount(2);
    for (const button of await comingSoon(page).all()) await expect(button).toBeDisabled();
    await expect(page.getByRole('link', { name: /download/i })).toHaveCount(0);
  });

  test('offers nothing from a latest.json that is not a release', async ({ page }) => {
    await serveLatest(page, { ...LATEST, apkUrl: 'javascript:alert(1)' });
    await page.goto('/get');
    await expect(comingSoon(page)).toHaveCount(2);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test('still offers the download when drawing the phones fails', async ({ page }) => {
    await page.addInitScript(() => {
      const create = document.createElement.bind(document);
      document.createElement = ((tag: string, options?: ElementCreationOptions) => {
        if (tag === 'canvas') throw new Error('no canvas today');
        return create(tag, options);
      }) as typeof document.createElement;
    });
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toHaveAttribute('href', LATEST.apkUrl);
    await expect(heroLink(page)).toHaveAttribute('href', LATEST.apkUrl);
  });

  test('fits a 375px screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toBeVisible();
    const overflow = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(overflow, 'pixels wider than the screen').toBeLessThanOrEqual(0);
  });
});

test.describe('on a phone, the text is readable', () => {
  test.use({ userAgent: PIXEL, viewport: { width: 375, height: 812 }, colorScheme: 'light' });

  const LINES = {
    'the subline': '.subline',
    'a stop label': '.stop .n',
    'a stop sentence': '.stop .caption p:last-child',
    'the meta line': '#download-meta',
    'the notes': '#whats-new-notes',
    'a permissions line': '[data-permission="INTERNET"]',
    'an install step': 'ol li',
  };

  for (const [name, selector] of Object.entries(LINES)) {
    test(`against the background under ${name}`, async ({ page }) => {
      await serveLatest(page);
      await page.goto('/get');
      const line = page.locator(selector).first();
      await expect(line).toBeVisible();
      await line.scrollIntoViewIfNeeded();
      const color = await line.evaluate((el) => getComputedStyle(el).color);
      // The text itself is made see-through, so the picture is the background under it.
      const background = await line.screenshot({
        style: '* { color: transparent !important; }',
        animations: 'disabled',
      });
      expect(await lowestContrast(page, background, color)).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('against the darkest spot of the backdrop, wherever the page is scrolled', async ({
    page,
  }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(downloadLink(page)).toBeVisible();
    // The blurred colours stay fixed to the screen, so text meets any part of them as it scrolls.
    const backdrop = await page.screenshot({ style: 'main { visibility: hidden !important; }' });
    for (const selector of Object.values(LINES)) {
      const line = page.locator(selector).first();
      const color = await line.evaluate((el) => getComputedStyle(el).color);
      expect(await lowestContrast(page, backdrop, color), selector).toBeGreaterThanOrEqual(4.5);
    }
  });
});

test.describe('on a computer', () => {
  test('offers a QR code to scan, and a direct download link', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(page.getByRole('img', { name: 'QR code for this page' })).toBeVisible();
    await expect(page.getByText('Scan with your Android phone')).toBeVisible();
    await expect(downloadLink(page)).toHaveAttribute('href', LATEST.apkUrl);
    await expect(page.getByText('Version 0.8 · 9.4 MB')).toBeVisible();
  });

  test('has a button at the top that goes down to the QR code', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    await expect(heroLink(page)).toHaveText('Get it on your phone ↓');
    await expect(heroLink(page)).toHaveAttribute('href', '#download');
    await heroLink(page).click();
    await expect(page.getByRole('heading', { name: 'Get it on your phone.' })).toBeInViewport();
  });
});

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE });

  test('says it is Android-only, and offers no download', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    const notes = page.getByText('Funancial is Android-only for now.');
    // Once at the top and once in the download block.
    await expect(notes).toHaveCount(2);
    for (const note of await notes.all()) await expect(note).toBeVisible();
    await expect(page.getByRole('link', { name: /download|get it/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /download|coming soon/i })).toHaveCount(0);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('says the download needs it, instead of a "Coming soon" that never changes', async ({
    page,
  }) => {
    await page.goto('/get');
    // Playwright's text queries skip <noscript>, so ask for the element.
    const notes = page.locator('noscript .note');
    await expect(notes).toHaveCount(2);
    for (const note of await notes.all()) {
      await expect(note).toHaveText('Turn on JavaScript to see the download button.');
      await expect(note).toBeVisible();
    }
    await expect(comingSoon(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Funancial' })).toBeVisible();
    await expect(page.getByText('Tap Download, then open the file.')).toBeVisible();
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows four drawn phones, the title, the button and the steps, and no WebGL', async ({
    page,
  }) => {
    await serveLatest(page);
    await page.goto('/get');
    const phones = page.getByRole('img', { name: /^Funancial .* screen$/ });
    await expect(phones).toHaveCount(4);
    for (const phone of await phones.all()) await expect(phone).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Funancial' })).toBeVisible();
    await expect(downloadLink(page)).toBeVisible();
    await expect(page.getByText('Tap Download, then open the file.')).toBeVisible();

    const webgl = await page.evaluate(() =>
      [...document.querySelectorAll('canvas')].some(
        (canvas) => canvas.getContext('webgl2') || canvas.getContext('webgl'),
      ),
    );
    expect(webgl).toBe(false);
  });

  test('draws the Home screen once the font is in', async ({ page }) => {
    await serveLatest(page);
    await page.goto('/get');
    const home = page.getByRole('img', { name: 'Funancial Home screen' });
    // The heading "Home" and the figure are dark ink on a white screen: some pixel is nearly black.
    await expect
      .poll(() =>
        home.evaluate((canvas: HTMLCanvasElement) => {
          const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < data.length; i += 4)
            if (data[i]! < 40 && data[i + 3]! > 200) return true;
          return false;
        }),
      )
      .toBe(true);
  });
});
